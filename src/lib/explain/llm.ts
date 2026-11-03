import OpenAI from "openai";
import type { ContributionJudgment, NormalizedContribution, ScoredContribution } from "../types";
import { parseJudgments, validateEvidenceIds } from "./judge";

/**
 * Step 1 and Step 3 model calls.
 *
 * Both are explicitly bounded: 15s timeout, no SDK retries (so our own
 * retry-once policy is the only retry), temperature 0.2 / 0.3, and JSON-only
 * output. Whatever comes back is still treated as untrusted and validated by
 * ./judge before it can influence a number.
 */

export const LLM_TIMEOUT_MS = 25_000;

/**
 * A single judge call covers at most this many items. Large projects are split
 * into several bounded calls so no request can sit on the timeout — 20 items
 * already takes ~16s on a fast model, and 100+ items will never fit in one.
 */
export const JUDGE_CHUNK_SIZE = 15;

/** Chunks run a few at a time so we don't open dozens of sockets at once. */
const JUDGE_CONCURRENCY = 3;

/**
 * OpenRouter reserves credit per in-flight request. Keep the global number of
 * judge requests low so several runs can't exhaust the balance at once.
 */
const MAX_IN_FLIGHT = 5;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    // Visible if MAX_IN_FLIGHT turns out to be too low in practice — otherwise
    // queuing is silent and there's no signal to tune it from.
    console.warn(`Judge requests: ${waiting.length + 1} queued behind ${MAX_IN_FLIGHT} in flight`);
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight += 1;
  try {
    return await run();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const STEP1_SYSTEM = `You evaluate individual work contributions on a small team project. Judge ONLY
what is in the data; never infer unrecorded work. Reviewing, unblocking
teammates, client communication, planning and admin are real work and must be
scored on the same scale as code. Impact scale: 1 = minor/cosmetic, 2 = small
useful, 3 = solid contribution to a deliverable, 4 = major deliverable or
meaningful unblocking, 5 = critical (won the client, unblocked the whole
project, shipped the core feature). Complexity scale: 1 = trivial, 2 = routine,
3 = moderate, 4 = hard, 5 = exceptional. Set is_quiet_work true for review,
unblocking, client_comms, admin, planning.

Return ONLY a JSON object with this exact shape — no other keys, no prose:
{
  "contributions": [
    {
      "id": "<the id string exactly as given in the input>",
      "category": "<one of: code, review, design, client_comms, unblocking, admin, planning>",
      "impact": <integer 1-5>,
      "complexity": <integer 1-5>,
      "is_quiet_work": <true or false>,
      "rationale": "<plain-text reason, at most 20 words>"
    }
  ]
}
Include exactly one object per input contribution id, covering every id given, in any order.
The input has a "type" field (pr, commit, review, trello, manual) — it is not a category.
Pick the category from the list above; do not copy the type into it.`;

export const STEP3_SYSTEM = `You explain a split of a fixed project payment to the team that did the work.
You are given each person's already-computed percentages and their strongest
contributions. Explain in plain language why this person's share is what it is.
Never write a percentage, a dollar amount or any other number in the reason —
the app shows the exact figures beside it, and the split shown may be any of
the four modes. Describe the share qualitatively ("the largest share", "about
an equal share"). Put contribution IDs only in evidence_ids, never in the
reason text. Cite only contribution IDs that appear in the input for that
person. Mention quiet work (review, unblocking, client communication,
admin, planning) when it materially shaped someone's share. Each reason must be
at most two sentences.

Return ONLY a JSON object with this exact shape — no other keys, no prose:
{
  "people": [
    {
      "person": "<the person's name exactly as given in the input>",
      "reason": "<plain-text explanation, at most two sentences>",
      "evidence_ids": ["<contribution id from that person's top_contributions>", "..."]
    }
  ]
}
Include exactly one object per person given, in any order.`;

/**
 * OPENAI_BASE_URL lets this point at an OpenAI-compatible proxy (e.g.
 * OpenRouter's https://openrouter.ai/api/v1) instead of api.openai.com.
 * When set, OPENAI_MODEL must use that provider's model id
 * (OpenRouter: "openai/gpt-4o-mini", not "gpt-4o-mini").
 */
function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function model(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function describeItems(items: NormalizedContribution[]) {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    lines_changed: item.linesChanged,
    hours: item.hours,
  }));
}

/** One bounded Step 1 request. Throws on transport error, invalid JSON or bad shape. */
async function judgeChunkOnce(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
  return withSlot(async () => {
    const openai = client();
    const response = await openai.chat.completions.create({
      model: model(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STEP1_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({ contributions: describeItems(items) }),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Step 1 returned invalid JSON");
    }

    const result = parseJudgments(parsed, items.map((item) => item.id));
    if (!result.ok) {
      throw new Error(`Step 1 output rejected: ${result.errors.slice(0, 3).join("; ")}`);
    }
    return result.judgments;
  });
}

export function chunkItems<T>(items: T[], size = JUDGE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Run a bounded number of promises at a time, preserving input order. Each
 * task's outcome is captured rather than thrown: one failing task used to
 * reject the whole `Promise.all`, which (via judgeOnce below) discarded every
 * other chunk's already-judged items along with it.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<Settled<R>[]> {
  const results = new Array<Settled<R>>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await run(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Retry a chunk once, then surface the error so the UI can offer a manual retry. */
async function judgeChunkWithRetry(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
  try {
    return await judgeChunkOnce(items);
  } catch (firstError) {
    // Give in-flight requests time to settle (OpenRouter reserves credit per
    // request) and ride out a transient timeout instead of hammering it.
    await sleep(800 + Math.random() * 900);
    try {
      return await judgeChunkOnce(items);
    } catch (secondError) {
      throw new Error(
        `Judging failed twice. ${(secondError as Error).message || (firstError as Error).message}`
      );
    }
  }
}

/**
 * One Step 1 run: bounded chunks, a few in flight, each retried once.
 *
 * A chunk that still fails after its retry doesn't sink the whole run — the
 * other chunks' judgments (most of a large project) are kept, and medianJudgments
 * already tolerates a run that's missing some ids. The run only throws if every
 * chunk failed, so the caller sees a real, total failure rather than losing
 * otherwise-good work to one flaky request.
 */
export async function judgeOnce(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
  const chunks = chunkItems(items);
  if (chunks.length === 0) return [];
  const results = await mapWithConcurrency(chunks, JUDGE_CONCURRENCY, judgeChunkWithRetry);
  const judged = results.filter((r): r is { ok: true; value: ContributionJudgment[] } => r.ok);
  const failed = results.length - judged.length;

  if (judged.length === 0) {
    const firstError = results.find((r): r is { ok: false; error: unknown } => !r.ok)?.error;
    throw firstError instanceof Error ? firstError : new Error(String(firstError));
  }
  if (failed > 0) {
    console.warn(`Judging: ${failed} of ${results.length} chunks failed; using judgments from the rest.`);
  }
  return judged.flatMap((r) => r.value);
}

/** Alias kept for the pipeline: retries now happen per chunk. */
export async function judgeWithRetry(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
  return judgeOnce(items);
}

export interface ExplainPersonInput {
  memberId: string;
  person: string;
  meritPct: number;
  hybridPct: number;
  equalPct: number;
  contributions: ScoredContribution[];
}

export interface ExplainedPerson {
  memberId: string;
  reason: string;
  evidenceIds: string[];
}

function topContributions(contributions: ScoredContribution[], limit = 5) {
  return [...contributions]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      impact: c.impact,
      complexity: c.complexity,
    }));
}

/** One Step 3 attempt. Evidence ids are validated server-side afterwards. */
export async function explainOnce(people: ExplainPersonInput[]): Promise<ExplainedPerson[]> {
  const openai = client();
  const payload = {
    people: people.map((person) => ({
      person: person.person,
      merit_pct: person.meritPct,
      hybrid_pct: person.hybridPct,
      equal_pct: person.equalPct,
      top_contributions: topContributions(person.contributions),
    })),
  };

  const response = await openai.chat.completions.create({
    model: model(),
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: STEP3_SYSTEM },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw) as unknown;
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const list = Array.isArray(record.people) ? record.people : [];
  const byName = new Map(
    people.map((person) => [person.person.trim().toLowerCase(), person])
  );
  const allowed = new Set(people.flatMap((person) => person.contributions.map((c) => c.id)));
  const allowedByPerson = new Map(
    people.map((person) => [
      person.memberId,
      new Set(person.contributions.map((c) => c.id)),
    ])
  );

  const explained: ExplainedPerson[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const name = typeof item.person === "string" ? item.person.trim().toLowerCase() : "";
    const person = byName.get(name);
    if (!person) continue;
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!reason) continue;

    // Validate against every id we sent, then narrow to this person's items.
    const globallyValid = validateEvidenceIds(item.evidence_ids, allowed);
    const personIds = allowedByPerson.get(person.memberId) ?? new Set<string>();
    const evidenceIds = globallyValid.filter((id) => personIds.has(id));

    explained.push({ memberId: person.memberId, reason: reason.slice(0, 600), evidenceIds });
  }

  return explained;
}
