import type {
  ContributionJudgment,
  Project,
  ScoreFormula,
  ScoreMode,
  ScoredContribution,
  ScoredPerson,
  ScoredSplit,
  UnassignedContribution,
} from "../types";
import { assessConfidence } from "./confidence";
import { CATEGORY_WEIGHTS, HYBRID_WEIGHTS, computeSplit } from "./compute";
import { CANNED_REASONS, cannedJudgmentsForRun, generatedReason } from "./canned";
import { applyJudgments, buildScoredContributions, medianJudgments, topEvidenceIds } from "./judge";
import { normalizeContributions } from "./normalize";
import { explainOnce, judgeWithRetry, type ExplainPersonInput } from "./llm";
import { toCents } from "./rounding";

/**
 * Server orchestrator: normalize → judge ×3 → compute → explain → confidence.
 *
 * The model only ever supplies judgments and prose. Every percentage and cent
 * in the returned object comes from ./compute.
 */

export class ScoreError extends Error {
  code: "NO_MEMBERS" | "NO_CONTRIBUTIONS" | "MODEL_FAILED";
  details: string[];

  constructor(code: ScoreError["code"], message: string, details: string[] = []) {
    super(message);
    this.name = "ScoreError";
    this.code = code;
    this.details = details;
  }
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" || !process.env.OPENAI_API_KEY;
}

function defaultMode(project: Project): ScoreMode {
  if (project.philosophy === "equal") return "equal";
  if (project.philosophy === "hybrid") return "hybrid";
  return "merit";
}

export async function scoreProjectExplainable(project: Project): Promise<ScoredSplit> {
  const started = Date.now();
  if (project.members.length === 0) {
    throw new ScoreError("NO_MEMBERS", "Add at least one member before scoring.");
  }

  const normalized = normalizeContributions(project.contributions, project.members);
  const items = normalized.contributions;
  const demo = isDemoMode();
  const notes: string[] = [];

  if (normalized.dropped.length > 0) {
    const merges = normalized.dropped.filter((d) => d.reason === "merge_commit").length;
    const trivia = normalized.dropped.filter((d) => d.reason === "trivial_change").length;
    notes.push(
      `Dropped ${normalized.dropped.length} item${normalized.dropped.length === 1 ? "" : "s"} with no signal (${merges} merge, ${trivia} whitespace/typo).`
    );
  }
  if (normalized.unassigned.length > 0) {
    notes.push(
      `${normalized.unassigned.length} item${normalized.unassigned.length === 1 ? "" : "s"} could not be matched to a member.`
    );
  }

  // ---- Step 1: judge three times, in parallel -----------------------------
  let runs: ContributionJudgment[][];
  if (demo) {
    runs = [0, 1, 2].map((index) => cannedJudgmentsForRun(items, index));
    notes.push("DEMO_MODE: canned judgments replayed through the real formula.");
  } else {
    const results = await Promise.allSettled([
      judgeWithRetry(items),
      judgeWithRetry(items),
      judgeWithRetry(items),
    ]);
    const fulfilled = results
      .filter((result): result is PromiseFulfilledResult<ContributionJudgment[]> => result.status === "fulfilled")
      .map((result) => result.value);
    if (fulfilled.length === 0) {
      const reasons = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => String(result.reason?.message ?? result.reason));
      throw new ScoreError(
        "MODEL_FAILED",
        "The scoring model did not return a valid response. Try again.",
        reasons
      );
    }
    runs = fulfilled;
    if (fulfilled.length < 3) {
      notes.push(`Only ${fulfilled.length} of 3 model runs succeeded; confidence uses the runs we got.`);
    }
  }

  const finalJudgments = medianJudgments(runs);
  if (finalJudgments.length === 0 && items.length > 0) {
    throw new ScoreError("MODEL_FAILED", "No usable judgments were produced for this project.");
  }

  // ---- Step 2: compute (pure) --------------------------------------------
  const judged = applyJudgments(items, finalJudgments);
  const scored: ScoredContribution[] = buildScoredContributions(judged, CATEGORY_WEIGHTS);
  const totalAmountCents = toCents(project.totalAmount);
  const members = project.members.map((member) => ({ id: member.id, name: member.name }));

  const computeInput = {
    totalAmountCents,
    members,
    contributions: scored.map((contribution) => ({
      id: contribution.id,
      memberId: contribution.memberId,
      person: contribution.person,
      category: contribution.category,
      impact: contribution.impact,
      complexity: contribution.complexity,
      hours: contribution.hours,
    })),
    categoryWeights: CATEGORY_WEIGHTS,
    hybridWeights: HYBRID_WEIGHTS,
  };

  const computed = computeSplit(computeInput);
  if (computed.hoursFallback) {
    notes.push("No hours logged, so Hours mode falls back to an equal split.");
  }

  // ---- Step 4 (input): how much do the three runs disagree? ---------------
  const confidenceRuns = runs.map((run) => {
    const runScored = buildScoredContributions(applyJudgments(items, run), CATEGORY_WEIGHTS);
    const runComputed = computeSplit({
      ...computeInput,
      contributions: runScored.map((contribution) => ({
        id: contribution.id,
        memberId: contribution.memberId,
        person: contribution.person,
        category: contribution.category,
        impact: contribution.impact,
        complexity: contribution.complexity,
        hours: contribution.hours,
      })),
    });
    return runComputed.people.map((person) => ({
      memberId: person.memberId,
      meritPct: person.meritPct,
    }));
  });
  const confidence = assessConfidence(confidenceRuns);
  if (confidence.confidence === "lower") {
    notes.push(
      `Runs disagreed by up to ${confidence.maxDeltaPct.toFixed(1)} pts; shares shown with a range.`
    );
  }

  // ---- Step 3: explain ---------------------------------------------------
  const explainInput: ExplainPersonInput[] = computed.people.map((person) => ({
    memberId: person.memberId,
    person: person.person,
    meritPct: person.meritPct,
    hybridPct: person.hybridPct,
    equalPct: person.equalPct,
    contributions: scored.filter((contribution) => contribution.memberId === person.memberId),
  }));

  const explanations = new Map<string, { reason: string; evidenceIds: string[] }>();

  if (demo) {
    for (const person of explainInput) {
      const own = scored.filter((contribution) => contribution.memberId === person.memberId);
      explanations.set(person.memberId, {
        reason:
          CANNED_REASONS[person.person] ??
          generatedReason(
            person.person,
            own.map((contribution) => ({ category: contribution.category, value: contribution.value }))
          ),
        evidenceIds: topEvidenceIds(scored, person.memberId, 4),
      });
    }
  } else {
    try {
      const explained = await explainOnce(explainInput);
      for (const entry of explained) {
        explanations.set(entry.memberId, {
          reason: entry.reason,
          evidenceIds: entry.evidenceIds,
        });
      }
    } catch (error) {
      notes.push(
        `Explanations fell back to computed summaries (${(error as Error).message.slice(0, 80)}).`
      );
    }
  }

  // ---- Assemble ----------------------------------------------------------
  const people: ScoredPerson[] = computed.people.map((person) => {
    const own = scored.filter((contribution) => contribution.memberId === person.memberId);
    const explanation = explanations.get(person.memberId);
    const validEvidence = (explanation?.evidenceIds ?? []).filter((id) =>
      own.some((contribution) => contribution.id === id)
    );
    const required = person.zeroActivity ? 0 : 1;
    const evidenceIds =
      validEvidence.length >= required
        ? validEvidence
        : [...new Set([...validEvidence, ...topEvidenceIds(scored, person.memberId, 2)])];

    const reason =
      explanation?.reason?.trim() ||
      generatedReason(
        person.person,
        own.map((contribution) => ({ category: contribution.category, value: contribution.value }))
      );

    const { score, meritRawPct, ...rest } = person;
    void score;
    void meritRawPct;

    return {
      ...rest,
      reason,
      evidenceIds,
      range: confidence.ranges[person.memberId],
    };
  });

  const unassigned: UnassignedContribution[] = scored
    .filter((contribution) => contribution.memberId === null)
    .map((contribution) => ({
      id: contribution.id,
      title: contribution.title,
      person: contribution.person,
      sourceId: contribution.sourceId,
      type: contribution.type,
      category: contribution.category,
      impact: contribution.impact,
      complexity: contribution.complexity,
      hours: contribution.hours,
      timestamp: contribution.timestamp,
      evidenceUrl: contribution.evidenceUrl,
      reason: "no_matching_member",
    }));

  const formula: ScoreFormula = {
    categoryWeights: computed.categoryWeights,
    hybridMeritWeight: computed.hybridWeights.merit,
    hybridHoursWeight: computed.hybridWeights.hours,
    runs: runs.length,
    source: demo ? "canned" : "llm",
    hoursFallback: computed.hoursFallback,
    durationMs: Date.now() - started,
    notes,
    maxMeritDeltaPct: confidence.maxDeltaPct,
  };

  return {
    projectId: project.id,
    totalAmountCents,
    currency: "USD",
    defaultMode: defaultMode(project),
    confidence: confidence.confidence,
    people,
    contributions: scored.filter((contribution) => contribution.memberId !== null),
    unassigned,
    formula,
    generatedAt: new Date().toISOString(),
  };
}

/** Convenience for the API layer: proposals from a chosen mode. */
export function modePercentages(split: ScoredSplit, mode: ScoreMode) {
  return split.people.map((person) => ({
    person: person.person,
    percentage: mode === "equal"
      ? person.equalPct
      : mode === "merit"
        ? person.meritPct
        : mode === "hybrid"
          ? person.hybridPct
          : person.hoursPct,
  }));
}
