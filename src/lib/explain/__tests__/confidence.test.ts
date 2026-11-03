import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_THRESHOLD_PTS,
  assessConfidence,
  type ConfidenceInput,
} from "../confidence";

function run(shares: Record<string, number>): ConfidenceInput[] {
  return Object.entries(shares).map(([memberId, meritPct]) => ({ memberId, meritPct }));
}

describe("assessConfidence", () => {
  it("reports high confidence and no ranges when runs agree", () => {
    const result = assessConfidence([
      run({ a: 40, b: 35, c: 25 }),
      run({ a: 41, b: 34, c: 25 }),
      run({ a: 40.5, b: 35, c: 24.5 }),
    ]);
    expect(result.confidence).toBe("high");
    expect(result.ranges).toEqual({});
    expect(result.maxDeltaPct).toBeLessThanOrEqual(CONFIDENCE_THRESHOLD_PTS);
  });

  it("reports lower confidence plus min/max ranges when any share moves >5 pts", () => {
    const result = assessConfidence([
      run({ a: 40, b: 35, c: 25 }),
      run({ a: 50, b: 30, c: 20 }),
      run({ a: 45, b: 33, c: 22 }),
    ]);
    expect(result.confidence).toBe("lower");
    expect(result.maxDeltaPct).toBe(10);
    expect(result.ranges.a).toEqual({ minMeritPct: 40, maxMeritPct: 50 });
    expect(result.ranges.b).toEqual({ minMeritPct: 30, maxMeritPct: 35 });
    expect(result.ranges.c).toEqual({ minMeritPct: 20, maxMeritPct: 25 });
  });

  it("treats exactly 5 points as high and anything above as lower", () => {
    const exact = assessConfidence([
      run({ a: 40, b: 60 }),
      run({ a: 45, b: 55 }),
      run({ a: 42, b: 58 }),
    ]);
    expect(exact.confidence).toBe("high");

    const over = assessConfidence([
      run({ a: 40, b: 60 }),
      run({ a: 45.01, b: 54.99 }),
      run({ a: 42, b: 58 }),
    ]);
    expect(over.confidence).toBe("lower");
  });

  it("treats a single run as lower confidence — there's nothing to compare it against", () => {
    const result = assessConfidence([run({ a: 100 })]);
    expect(result.confidence).toBe("lower");
    expect(result.maxDeltaPct).toBe(0);
  });

  it("still requires agreement with exactly 2 usable runs", () => {
    const agree = assessConfidence([run({ a: 40, b: 60 }), run({ a: 42, b: 58 })]);
    expect(agree.confidence).toBe("high");

    const disagree = assessConfidence([run({ a: 40, b: 60 }), run({ a: 50, b: 50 })]);
    expect(disagree.confidence).toBe("lower");
  });

  it("does not crash on empty input", () => {
    const result = assessConfidence([]);
    expect(result.confidence).toBe("lower");
    expect(result.ranges).toEqual({});
  });

  it("ignores members that are missing from some runs", () => {
    const result = assessConfidence([run({ a: 50, b: 50 }), run({ a: 50 })]);
    expect(result.confidence).toBe("high");
    expect(result.ranges).toEqual({});
  });
});
