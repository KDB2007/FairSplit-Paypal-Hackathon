import type {
  ContributionCategory,
  ContributionJudgment,
  ScoredContribution,
} from "../types";
import { QUIET_CATEGORIES, contributionValue, isQuietCategory } from "./compute";
import type { NormalizedContribution } from "../types";

/**
 * The trust boundary for model output. Everything the model returns is
 * untrusted data: it is validated, clamped and reconciled against the ids we
 * actually sent. The model never supplies a percentage or an amount.
 */

export const CATEGORIES: ContributionCategory[] = [
  "code",
  "review",
  "design",
  "client_comms",
  "unblocking",
  "admin",
  "planning",
];

export const MAX_RATIONALE_WORDS = 20;

export interface ParseResult {
  ok: boolean;
  judgments: ContributionJudgment[];
  errors: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
}

export function truncateWords(text: string, limit = MAX_RATIONALE_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? words.join(" ") : `${words.slice(0, limit).join(" ")}…`;
}

/**
 * Validate a Step 1 payload against the ids we sent.
 *
 * Rejects when: the shape is wrong, any id is unknown, any id is missing, or
 * any score/category is out of range. The caller retries once, then errors.
 */
export function parseJudgments(payload: unknown, expectedIds: string[]): ParseResult {
  const errors: string[] = [];
  const record = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : record && Array.isArray(record.contributions)
      ? (record.contributions as unknown[])
      : null;

  if (!list) {
    return { ok: false, judgments: [], errors: ["payload has no contributions array"] };
  }

  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  const judgments: ContributionJudgment[] = [];

  list.forEach((entry, index) => {
    const item = asRecord(entry);
    if (!item) {
      errors.push(`item ${index}: not an object`);
      return;
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      errors.push(`item ${index}: missing id`);
      return;
    }
    if (!expected.has(id)) {
      errors.push(`item ${index}: unknown id ${id}`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`item ${index}: duplicate id ${id}`);
      return;
    }

    const category = item.category as ContributionCategory;
    if (!CATEGORIES.includes(category)) {
      errors.push(`item ${index} (${id}): invalid category ${String(item.category)}`);
      return;
    }
    const impact = toScore(item.impact);
    const complexity = toScore(item.complexity);
    if (impact === null) {
      errors.push(`item ${index} (${id}): impact must be 1-5`);
      return;
    }
    if (complexity === null) {
      errors.push(`item ${index} (${id}): complexity must be 1-5`);
      return;
    }

    const rationale = typeof item.rationale === "string" ? item.rationale : "";
    const rawQuiet = item.is_quiet_work ?? item.isQuietWork;

    seen.add(id);
    judgments.push({
      id,
      category,
      impact,
      complexity,
      // Quiet categories are quiet by definition; trust the flag when it agrees.
      isQuietWork:
        typeof rawQuiet === "boolean" ? rawQuiet || isQuietCategory(category) : isQuietCategory(category),
      rationale: truncateWords(rationale || fallbackRationale(category)),
    });
  });

  for (const id of expected) {
    if (!seen.has(id)) errors.push(`missing id ${id}`);
  }

  return { ok: errors.length === 0, judgments, errors };
}

function fallbackRationale(category: ContributionCategory): string {
  const labels: Record<ContributionCategory, string> = {
    code: "Shipped implementation work.",
    review: "Reviewed teammates' work before it shipped.",
    design: "Designed the interface and shared system.",
    client_comms: "Kept the client informed and aligned.",
    unblocking: "Unblocked a teammate so work could continue.",
    admin: "Handled project admin and setup.",
    planning: "Planned scope, sequencing and estimates.",
  };
  return labels[category];
}

/** Reconcile judgments with normalized items so every item has exactly one. */
export function applyJudgments(
  items: NormalizedContribution[],
  judgments: ContributionJudgment[]
): Array<NormalizedContribution & ContributionJudgment> {
  const byId = new Map(judgments.map((judgment) => [judgment.id, judgment]));
  return items.map((item) => {
    const judgment = byId.get(item.id) ?? {
      id: item.id,
      category: item.categoryHint ?? "code",
      impact: 3,
      complexity: 3,
      isQuietWork: isQuietCategory(item.categoryHint ?? "code"),
      rationale: fallbackRationale(item.categoryHint ?? "code"),
    };
    return { ...item, ...judgment };
  });
}

/**
 * Median across runs (spec: median per-contribution scores). Categories are
 * decided by majority; rationale comes from the first run that had one.
 */
export function medianJudgments(runs: ContributionJudgment[][]): ContributionJudgment[] {
  const valid = runs.filter((run) => run.length > 0);
  if (valid.length === 0) return [];
  if (valid.length === 1) return valid[0];

  const ids = Array.from(new Set(valid.flatMap((run) => run.map((j) => j.id))));
  const result: ContributionJudgment[] = [];

  for (const id of ids) {
    const entries = valid
      .map((run) => run.find((judgment) => judgment.id === id))
      .filter((judgment): judgment is ContributionJudgment => Boolean(judgment));
    if (entries.length === 0) continue;

    const categoryCounts = new Map<ContributionCategory, number>();
    for (const entry of entries) {
      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    }
    const category = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0][0];

    result.push({
      id,
      category,
      impact: medianNumber(entries.map((entry) => entry.impact)),
      complexity: medianNumber(entries.map((entry) => entry.complexity)),
      isQuietWork: entries.filter((entry) => entry.isQuietWork).length * 2 >= entries.length,
      rationale:
        entries.find((entry) => entry.category === category && entry.rationale)?.rationale ??
        entries[0].rationale,
    });
  }

  return result;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Model-proposed evidence ids are filtered against what we actually sent. */
export function validateEvidenceIds(
  evidenceIds: unknown,
  allowed: Set<string>
): string[] {
  if (!Array.isArray(evidenceIds)) return [];
  const out: string[] = [];
  for (const value of evidenceIds) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Step 3 fallback: a person with no valid citation gets their top 2 by value. */
export function topEvidenceIds(
  contributions: ScoredContribution[],
  memberId: string,
  limit = 2
): string[] {
  return contributions
    .filter((contribution) => contribution.memberId === memberId)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((contribution) => contribution.id);
}

/** Join normalized items + judgments into scored contributions. */
export function buildScoredContributions(
  items: Array<NormalizedContribution & ContributionJudgment>,
  weights: Record<ContributionCategory, number>
): ScoredContribution[] {
  return items.map((item) => ({
    id: item.id,
    memberId: item.memberId,
    person: item.person,
    title: item.title,
    sourceId: item.sourceId,
    type: item.type,
    category: item.category,
    impact: item.impact,
    complexity: item.complexity,
    isQuietWork: item.isQuietWork || QUIET_CATEGORIES.includes(item.category),
    rationale: item.rationale,
    value: contributionValue(item.impact, item.complexity, item.category, weights),
    linesChanged: item.linesChanged,
    hours: item.hours,
    timestamp: item.timestamp,
    evidenceUrl: item.evidenceUrl,
  }));
}
