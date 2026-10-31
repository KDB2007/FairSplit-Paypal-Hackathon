import type {
  AmountsByMode,
  ContributionCategory,
  LayerAmounts,
  ScoreMode,
  ScoredPerson,
} from "../types";
import { sharesToBasisPoints, sharesToCents } from "./rounding";

/**
 * Step 2 — the only place percentages and money are produced.
 *
 * Nothing in this file calls a model. The same function runs on the server
 * (initial score) and in the browser (mode switching, unassigned reassignment),
 * which is what makes the toggle instant and the two views agree exactly.
 */

export const CATEGORY_WEIGHTS: Record<ContributionCategory, number> = {
  code: 1.0,
  review: 0.8,
  design: 1.0,
  client_comms: 1.0,
  unblocking: 0.9,
  admin: 0.6,
  planning: 0.8,
};

export const QUIET_CATEGORIES: ContributionCategory[] = [
  "review",
  "unblocking",
  "client_comms",
  "admin",
  "planning",
];

export const HYBRID_WEIGHTS = { merit: 0.7, hours: 0.3 };

/** Points of merit share a person must beat their item-count share by. */
export const HIDDEN_MARGIN_PTS = 8;

export function isQuietCategory(category: ContributionCategory): boolean {
  return QUIET_CATEGORIES.includes(category);
}

export function clampScore(value: unknown, fallback = 1): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, n));
}

/** value(c) = impact * complexity * categoryWeight[category] */
export function contributionValue(
  impact: number,
  complexity: number,
  category: ContributionCategory,
  weights: Record<ContributionCategory, number> = CATEGORY_WEIGHTS
): number {
  return clampScore(impact) * clampScore(complexity) * (weights[category] ?? 1);
}

export interface ComputeMember {
  id: string;
  name: string;
}

export interface ComputeContribution {
  id: string;
  memberId: string | null;
  person: string;
  category: ContributionCategory;
  impact: number;
  complexity: number;
  hours?: number;
}

export interface ComputeOptions {
  totalAmountCents: number;
  members: ComputeMember[];
  contributions: ComputeContribution[];
  categoryWeights?: Partial<Record<ContributionCategory, number>>;
  hybridWeights?: { merit: number; hours: number };
  /** Charter fees; omitted ⇒ the whole total is the work pool. */
  layers?: LayerAmounts;
}

export interface ComputedPerson extends Omit<ScoredPerson, "reason" | "evidenceIds"> {
  score: number;
  meritRawPct: number;
}

export interface ComputeResult {
  people: ComputedPerson[];
  totalScore: number;
  hoursFallback: boolean;
  totalAmountCents: number;
  categoryWeights: Record<ContributionCategory, number>;
  hybridWeights: { merit: number; hours: number };
  values: Record<string, number>;
  layers: LayerAmounts;
}

function resolveWeights(
  overrides: Partial<Record<ContributionCategory, number>> = {}
): Record<ContributionCategory, number> {
  const weights = { ...CATEGORY_WEIGHTS };
  for (const key of Object.keys(overrides) as ContributionCategory[]) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      weights[key] = value;
    }
  }
  return weights;
}

export function computeSplit(options: ComputeOptions): ComputeResult {
  const { totalAmountCents, members, contributions } = options;
  const categoryWeights = resolveWeights(options.categoryWeights);
  const hybridWeights = options.hybridWeights ?? HYBRID_WEIGHTS;
  const memberCount = members.length;

  const allCents = Math.max(0, Math.round(totalAmountCents));
  const layers: LayerAmounts = options.layers ?? {
    finderCents: 0,
    leadCents: 0,
    workPoolCents: allCents,
    finderMemberId: null,
    leadMemberId: null,
  };
  const workPoolAmountCents = Math.max(0, Math.round(layers.workPoolCents));
  const values: Record<string, number> = {};

  const byMember = new Map<
    string,
    { items: number; raw: number; quietRaw: number; hours: number; byCategory: Map<ContributionCategory, number> }
  >();
  for (const member of members) {
    byMember.set(member.id, {
      items: 0,
      raw: 0,
      quietRaw: 0,
      hours: 0,
      byCategory: new Map(),
    });
  }

  let assignedItems = 0;
  for (const contribution of contributions) {
    if (!contribution.memberId) continue;
    const bucket = byMember.get(contribution.memberId);
    if (!bucket) continue; // contribution points at someone who left the project

    const value = contributionValue(
      contribution.impact,
      contribution.complexity,
      contribution.category,
      categoryWeights
    );
    values[contribution.id] = value;

    bucket.items += 1;
    bucket.raw += value;
    bucket.hours += Number.isFinite(contribution.hours) ? Math.max(0, contribution.hours ?? 0) : 0;
    bucket.byCategory.set(
      contribution.category,
      (bucket.byCategory.get(contribution.category) ?? 0) + value
    );
    if (isQuietCategory(contribution.category)) bucket.quietRaw += value;
    assignedItems += 1;
  }

  // sqrt() per category, then sum across categories: breadth beats spam.
  const scores = new Map<string, number>();
  let totalScore = 0;
  for (const [memberId, bucket] of byMember) {
    let score = 0;
    for (const categoryValue of bucket.byCategory.values()) {
      score += Math.sqrt(categoryValue);
    }
    scores.set(memberId, score);
    totalScore += score;
  }

  const activeMembers = members.filter((m) => (byMember.get(m.id)?.items ?? 0) > 0);
  const totalHours = members.reduce((sum, m) => sum + (byMember.get(m.id)?.hours ?? 0), 0);
  const hoursFallback = totalHours <= 0;

  // Raw shares (0..1) for WORK POOL only. Every branch is total-safe: no divide-by-zero anywhere.
  const meritShares = members.map((member) => {
    if (memberCount === 0) return 0;
    if (totalScore > 0) return (scores.get(member.id) ?? 0) / totalScore;
    // Nobody has any scored activity — fall back to an equal split rather than 0/0.
    return activeMembers.length > 0
      ? (byMember.get(member.id)?.items ?? 0) > 0
        ? 1 / activeMembers.length
        : 0
      : 1 / memberCount;
  });

  const hoursShares = members.map((member) => {
    if (memberCount === 0) return 0;
    if (hoursFallback) return 1 / memberCount;
    return (byMember.get(member.id)?.hours ?? 0) / totalHours;
  });

  const equalShares = members.map(() => (memberCount === 0 ? 0 : 1 / memberCount));
  const hybridShares = meritShares.map(
    (merit, i) => hybridWeights.merit * merit + hybridWeights.hours * hoursShares[i]
  );

  const modeShares: Record<ScoreMode, number[]> = {
    equal: equalShares,
    merit: meritShares,
    hybrid: hybridShares,
    hours: hoursShares,
  };

  // Work pool cents distributed by shares
  const workPoolCentsByMode: Record<ScoreMode, number[]> = {
    equal: sharesToCents(modeShares.equal, workPoolAmountCents),
    merit: sharesToCents(modeShares.merit, workPoolAmountCents),
    hybrid: sharesToCents(modeShares.hybrid, workPoolAmountCents),
    hours: sharesToCents(modeShares.hours, workPoolAmountCents),
  };

  const bps: Record<ScoreMode, number[]> = {
    equal: sharesToBasisPoints(modeShares.equal),
    merit: sharesToBasisPoints(modeShares.merit),
    hybrid: sharesToBasisPoints(modeShares.hybrid),
    hours: sharesToBasisPoints(modeShares.hours),
  };

  const people: ComputedPerson[] = members.map((member, index) => {
    const bucket = byMember.get(member.id)!;
    // Charter fees are fixed per person; only the work-pool slice varies by mode.
    const finderAmountCents = member.id === layers.finderMemberId ? layers.finderCents : 0;
    const leadAmountCents = member.id === layers.leadMemberId ? layers.leadCents : 0;
    const fees = finderAmountCents + leadAmountCents;
    const workAmountsByMode: AmountsByMode = {
      equal: workPoolCentsByMode.equal[index],
      merit: workPoolCentsByMode.merit[index],
      hybrid: workPoolCentsByMode.hybrid[index],
      hours: workPoolCentsByMode.hours[index],
    };
    const amountsByMode: AmountsByMode = {
      equal: fees + workAmountsByMode.equal,
      merit: fees + workAmountsByMode.merit,
      hybrid: fees + workAmountsByMode.hybrid,
      hours: fees + workAmountsByMode.hours,
    };
    const valueByCategory: Partial<Record<ContributionCategory, number>> = {};
    for (const [category, value] of bucket.byCategory) {
      valueByCategory[category] = value;
    }
    const activityCountSharePct = assignedItems > 0 ? (bucket.items / assignedItems) * 100 : 0;
    const quietValueSharePct = bucket.raw > 0 ? (bucket.quietRaw / bucket.raw) * 100 : 0;
    const meritPct = bps.merit[index] / 100;

    return {
      memberId: member.id,
      person: member.name,
      meritPct,
      hybridPct: bps.hybrid[index] / 100,
      hoursPct: bps.hours[index] / 100,
      equalPct: bps.equal[index] / 100,
      amountsByMode,
      workAmountsByMode,
      hiddenContributor:
        bucket.items > 0 &&
        meritPct - activityCountSharePct >= HIDDEN_MARGIN_PTS &&
        quietValueSharePct > 50,
      zeroActivity: bucket.items === 0,
      activityCountSharePct,
      quietValueSharePct,
      valueByCategory,
      score: scores.get(member.id) ?? 0,
      meritRawPct: meritShares[index] * 100,
      finderAmountCents,
      leadAmountCents,
    };
  });

  return {
    people,
    totalScore,
    hoursFallback,
    totalAmountCents: allCents,
    categoryWeights,
    hybridWeights,
    values,
    layers: { ...layers, workPoolCents: workPoolAmountCents },
  };
}

/** Largest-remainder check used by tests and the UI footer. */
export function sumsToTotal(amounts: number[], totalCents: number): boolean {
  return amounts.reduce((sum, v) => sum + v, 0) === totalCents;
}
