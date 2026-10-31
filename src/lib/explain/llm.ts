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

export const LLM_TIMEOUT_MS = 15_000;

export const STEP1_SYSTEM = `You evaluate individual work contributions on a small team project. Judge ONLY
what is in the data; never infer unrecorded work. Reviewing, unblocking
teammates, client communication, planning and admin are real work and must be
scored on the same scale as code. Impact scale: 1 = minor/cosmetic, 2 = small
useful, 3 = solid contribution to a deliverable, 4 = major deliverable or
meaningful unblocking, 5 = critical (won the client, unblocked the whole
project, shipped the core feature). Complexity scale: 1 = trivial, 2 = routine,
3 = moderate, 4 = hard, 5 = exceptional. Set is_quiet_work true for review,
unblocking, client_comms, admin, planning. Return only JSON matching the schema.`;

export const STEP3_SYSTEM = `You explain a split of a fixed project payment to the team that did the work.
You are given each person's already-computed percentages and their strongest
contributions. Explain in plain language why this person's share is what it is.
Do not change the numbers, recompute them, or state different ones; refer to
them qualitatively. Cite only contribution IDs that appear in the input for
that person. Mention quiet work (review, unblocking, client communication,
admin, planning) when it materially shaped someone's share. Each reason must be
at most two sentences. Return only JSON matching the schema.`;

function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
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

/** One Step 1 attempt. Throws on transport error, invalid JSON or bad shape. */
export async function judgeOnce(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
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
}

/** Retry once, then surface the error so the UI can offer a manual retry. */
export async function judgeWithRetry(items: NormalizedContribution[]): Promise<ContributionJudgment[]> {
  try {
    return await judgeOnce(items);
  } catch (firstError) {
    try {
      return await judgeOnce(items);
    } catch (secondError) {
      throw new Error(
        `Judging failed twice. ${(secondError as Error).message || (firstError as Error).message}`
      );
    }
  }
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
