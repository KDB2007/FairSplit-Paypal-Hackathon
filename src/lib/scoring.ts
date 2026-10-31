import OpenAI from "openai";
import type { Contribution, Member, Project, ScoreResult, SplitProposal } from "./types";
import { normalizePercentages, round2 } from "./store";

const QUIET_WORK = /review|unblock|client|admin|status|call|handoff|document|onboard|mentor|support/i;

interface ScoredPerson extends ScoreResult {
  sourceIds: string[];
}

function topEvidence(items: Contribution[], limit = 3): string[] {
  return items.slice(0, limit).map((c) => c.id);
}

function perPersonContributions(project: Project, member: Member): Contribution[] {
  return project.contributions.filter(
    (c) => c.person.toLowerCase() === member.name.toLowerCase()
  );
}

/** Deterministic heuristic used when the LLM is unavailable (demo-safe). */
export function heuristicScores(project: Project): ScoredPerson[] {
  const weights = project.members.map((member) => {
    const items = perPersonContributions(project, member);
    let weight = 0;
    for (const item of items) {
      if (item.type === "commit") weight += 1;
      else if (item.type === "pr") weight += 1.6;
      else if (item.type === "trello") weight += 1;
      else weight += 0.8 + (item.hours ?? 0) * 0.6;
      if (QUIET_WORK.test(item.title)) weight += 0.8;
    }
    if (member.role === "lead") weight += 0.6;
    return Math.max(weight, 0.5);
  });

  const pcts = normalizePercentages(weights);

  return project.members.map((member, i) => {
    const items = perPersonContributions(project, member);
    const has = (t: Contribution["type"]) => items.some((c) => c.type === t);
    const impact = clamp(4 + weights[i] * 0.55 + (member.role === "lead" ? 1 : 0));
    const complexity = clamp(4 + (has("pr") ? 2 : 1) + items.length * 0.35);
    const effort = clamp(3.5 + items.reduce((s, c) => s + (c.hours ?? 0.5), 0) * 0.5);
    const quiet = items.filter((c) => QUIET_WORK.test(c.title)).length;

    return {
      person: member.name,
      impact,
      complexity,
      effort,
      percentage: pcts[i],
      reason: buildReason(member, items, quiet),
      evidenceRefs: topEvidence(items),
      sourceIds: topEvidence(items),
    };
  });
}

function clamp(n: number): number {
  return Math.round(Math.min(10, Math.max(1, n)) * 10) / 10;
}

function buildReason(member: Member, items: Contribution[], quiet: number): string {
  const commits = items.filter((c) => c.type === "commit").length;
  const prs = items.filter((c) => c.type === "pr").length;
  const cards = items.filter((c) => c.type === "trello").length;
  const hours = items.reduce((s, c) => s + (c.hours ?? 0), 0);
  const parts: string[] = [];
  if (commits) parts.push(`${commits} commit${commits > 1 ? "s" : ""}`);
  if (prs) parts.push(`${prs} PR${prs > 1 ? "s" : ""}`);
  if (cards) parts.push(`${cards} completed Trello card${cards > 1 ? "s" : ""}`);
  if (hours) parts.push(`${round2(hours)}h logged`);
  if (quiet) parts.push(`${quiet} quiet-work item${quiet > 1 ? "s" : ""} (client/review/unblocking)`);
  if (member.role === "lead") parts.push("lead coordination");
  if (parts.length === 0) return "Limited logged activity; baseline share applied.";
  return `Contributed ${parts.join(", ")}, reflected in a fair merit-weighted share.`;
}

/* -------------------------------------------------------------------------- */
/* Scripted demo response (matches PRD demo script)                           */
/* -------------------------------------------------------------------------- */

function scriptedDemoScores(project: Project): ScoredPerson[] | null {
  const names = project.members.map((m) => m.name);
  const isDemoCast =
    names.includes("Priya") && names.includes("Leo") && names.includes("Maya");
  if (!isDemoCast || project.members.length !== 3) return null;

  const split: Record<string, number> = { Priya: 45, Leo: 35, Maya: 20 };
  const reasons: Record<string, string> = {
    Priya:
      "Led architecture and the PayPal integration, and handled client scope calls — highest overall impact.",
    Leo:
      "Delivered core auth and checkout fixes, and repeatedly unblocked teammates — strong complexity and quiet work.",
    Maya:
      "Built the design system and landing page, and carried client comms; a solid, well-rounded contribution.",
  };

  return project.members.map((member) => {
    const items = perPersonContributions(project, member);
    const quiet = items.filter((c) => QUIET_WORK.test(c.title)).length;
    const base = split[member.name] ?? 100 / project.members.length;
    return {
      person: member.name,
      impact: member.name === "Priya" ? 9 : member.name === "Leo" ? 8 : 7,
      complexity: member.name === "Leo" ? 9 : member.name === "Maya" ? 8 : 7,
      effort: member.name === "Maya" ? 8 : member.name === "Priya" ? 7 : 6,
      percentage: base,
      reason: reasons[member.name] ?? buildReason(member, items, quiet),
      evidenceRefs: topEvidence(items),
      sourceIds: topEvidence(items),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* LLM scoring                                                                */
/* -------------------------------------------------------------------------- */

interface LlmProposal {
  person: string;
  impact: number;
  complexity: number;
  effort: number;
  percentage: number;
  reason: string;
  evidenceRefs?: string[];
}

function groupActivity(project: Project): string {
  return project.members
    .map((member) => {
      const items = perPersonContributions(project, member);
      const hours = items.reduce((s, c) => s + (c.hours ?? 0), 0);
      const lines = items
        .map(
          (c) =>
            `  - [${c.id}] ${c.type.toUpperCase()} "${c.title}"${
              c.hours ? ` (${c.hours}h)` : ""
            }${c.evidenceUrl ? ` — ${c.evidenceUrl}` : ""}`
        )
        .join("\n");
      return `${member.name} (${member.role}) — ${items.length} items, ${hours}h logged:\n${
        lines || "  (no logged activity)"
      }`;
    })
    .join("\n\n");
}

export async function scoreProject(
  project: Project
): Promise<{ proposals: SplitProposal[]; source: "llm" | "canned" }> {
  const demoMode = process.env.DEMO_MODE === "true";
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  let scored: ScoredPerson[];
  let source: "llm" | "canned" = "canned";

  const scripted = scriptedDemoScores(project);
  if (demoMode || !hasKey) {
    scored = scripted ?? heuristicScores(project);
  } else {
    try {
      scored = await llmScores(project);
      source = "llm";
    } catch (error) {
      console.error("LLM scoring failed, falling back to heuristic:", error);
      scored = scripted ?? heuristicScores(project);
    }
  }

  const pcts = normalizePercentages(scored.map((s) => s.percentage));

  const proposals: SplitProposal[] = scored.map((s, i) => ({
    id: `prop_${project.id}_${i}_${s.person.toLowerCase()}`,
    projectId: project.id,
    person: s.person,
    impact: clamp(s.impact),
    complexity: clamp(s.complexity),
    effort: clamp(s.effort),
    percentage: pcts[i],
    reason: s.reason,
    evidenceRefs: s.evidenceRefs.length
      ? s.evidenceRefs
      : topEvidence(perPersonContributions(project, project.members[i])),
    aiGenerated: true,
  }));

  project.proposals = proposals;
  project.status = project.status === "paid" ? "paid" : "scored";

  return { proposals, source };
}

async function llmScores(project: Project): Promise<ScoredPerson[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const validIds = new Set(project.contributions.map((c) => c.id));

  const system = `You are FairSplit's contribution scoring engine.
Score each team member fairly for a one-off project payout.

Rules:
- Score impact, complexity and effort from 1 to 10.
- Explicitly account for QUIET WORK: code review, unblocking teammates, admin, client calls and communication. Do not only count commits.
- Give each person a percentage. Percentages must sum to 100 across all members (the server normalises anyway).
- Give a one-sentence, plain-language reason a non-technical client would understand.
- Return evidenceRefs as an array of contribution IDs that justify the score. Use the bracketed IDs from the activity list.
- Include every member, even those with little or no logged activity.

Return ONLY JSON of the form:
{"proposals":[{"person":"...","impact":1,"complexity":1,"effort":1,"percentage":1,"reason":"...","evidenceRefs":["..."]}]}`;

  const user = `Project: ${project.name}
Total payout: $${project.totalAmount}
Split philosophy: ${project.philosophy}
Members: ${project.members.map((m) => `${m.name} (${m.role})`).join(", ")}

Activity:
${groupActivity(project)}`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { proposals?: LlmProposal[] };
  const proposals = parsed.proposals ?? [];
  if (!proposals.length) throw new Error("LLM returned no proposals");

  const byName = new Map(proposals.map((p) => [p.person.toLowerCase(), p]));

  return project.members.map((member) => {
    const llm = byName.get(member.name.toLowerCase());
    const items = perPersonContributions(project, member);
    if (!llm) {
      const fallback = heuristicScores(project).find(
        (s) => s.person === member.name
      )!;
      return fallback;
    }
    const refs = (llm.evidenceRefs ?? []).filter((id) => validIds.has(id));
    return {
      person: member.name,
      impact: Number(llm.impact) || 5,
      complexity: Number(llm.complexity) || 5,
      effort: Number(llm.effort) || 5,
      percentage: Number(llm.percentage) || 100 / project.members.length,
      reason: llm.reason || buildReason(member, items, 0),
      evidenceRefs: refs.length ? refs : topEvidence(items),
      sourceIds: refs,
    };
  });
}
