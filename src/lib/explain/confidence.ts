import type { Confidence, MeritRange } from "../types";

/** Step 4 — how much does the model's read of the work wobble between runs? */

export const CONFIDENCE_THRESHOLD_PTS = 5;

export interface ConfidenceInput {
  memberId: string;
  meritPct: number;
}

export interface ConfidenceResult {
  confidence: Confidence;
  ranges: Record<string, MeritRange>;
  maxDeltaPct: number;
}

/**
 * Compare merit shares across repeated Step 1 runs.
 *
 * If any person moves more than 5 percentage points between the best and worst
 * run we surface `lower` plus the min/max range, so the lead can see exactly
 * which share is soft. Otherwise `high` and no range is attached.
 */
export function assessConfidence(runs: ConfidenceInput[][]): ConfidenceResult {
  const usable = runs.filter((run) => run.length > 0);
  const ranges: Record<string, MeritRange> = {};
  if (usable.length === 0) {
    return { confidence: "lower", ranges, maxDeltaPct: 0 };
  }

  const ids = Array.from(new Set(usable.flatMap((run) => run.map((entry) => entry.memberId))));
  let maxDelta = 0;

  for (const id of ids) {
    const shares = usable
      .map((run) => run.find((entry) => entry.memberId === id)?.meritPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (shares.length === 0) continue;
    const min = Math.min(...shares);
    const max = Math.max(...shares);
    maxDelta = Math.max(maxDelta, max - min);
    ranges[id] = {
      minMeritPct: Math.round(min * 100) / 100,
      maxMeritPct: Math.round(max * 100) / 100,
    };
  }

  const confidence: Confidence = maxDelta > CONFIDENCE_THRESHOLD_PTS ? "lower" : "high";
  return {
    confidence,
    // Ranges are only meaningful when we actually flag the split as soft.
    ranges: confidence === "lower" ? ranges : {},
    maxDeltaPct: Math.round(maxDelta * 100) / 100,
  };
}
