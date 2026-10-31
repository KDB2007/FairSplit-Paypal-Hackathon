import { describe, expect, it } from "vitest";
import type { ContributionJudgment, NormalizedContribution, ScoredContribution } from "../../types";
import {
  applyJudgments,
  buildScoredContributions,
  medianJudgments,
  parseJudgments,
  topEvidenceIds,
  truncateWords,
  validateEvidenceIds,
} from "../judge";
import { CATEGORY_WEIGHTS } from "../compute";

const IDS = ["c_001", "c_002", "c_003"];

const validPayload = {
  contributions: [
    {
      id: "c_001",
      category: "code",
      impact: 4,
      complexity: 3,
      is_quiet_work: false,
      rationale: "Shipped the core payout flow.",
    },
    {
      id: "c_002",
      category: "review",
      impact: 5,
      complexity: 4,
      is_quiet_work: true,
      rationale: "Reviewed every PR before merge.",
    },
    {
      id: "c_003",
      category: "client_comms",
      impact: 3,
      complexity: 2,
      is_quiet_work: true,
      rationale: "Kept the client updated weekly.",
    },
  ],
};

describe("parseJudgments", () => {
  it("accepts a valid response for every id", () => {
    const result = parseJudgments(validPayload, IDS);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.judgments).toHaveLength(3);
    expect(result.judgments[0]).toMatchObject({ id: "c_001", impact: 4, complexity: 3 });
  });

  it("rejects unknown ids", () => {
    const payload = {
      contributions: [...validPayload.contributions.slice(0, 2), { ...validPayload.contributions[2], id: "c_999" }],
    };
    const result = parseJudgments(payload, IDS);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unknown id c_999/);
  });

  it("rejects missing ids", () => {
    const result = parseJudgments(
      { contributions: validPayload.contributions.slice(0, 2) },
      IDS
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/missing id c_003/);
  });

  it("rejects out-of-range scores and unknown categories", () => {
    const badScore = structuredClone(validPayload);
    badScore.contributions[0].impact = 7;
    expect(parseJudgments(badScore, IDS).ok).toBe(false);

    const zeroScore = structuredClone(validPayload);
    zeroScore.contributions[1].complexity = 0;
    expect(parseJudgments(zeroScore, IDS).ok).toBe(false);

    const badCategory = structuredClone(validPayload);
    (badCategory.contributions[2] as { category: string }).category = "vibes";
    expect(parseJudgments(badCategory, IDS).ok).toBe(false);
  });

  it("rejects duplicate ids", () => {
    const payload = {
      contributions: [...validPayload.contributions, validPayload.contributions[0]],
    };
    const result = parseJudgments(payload, IDS);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicate id/);
  });

  it("rejects a payload with no contributions array", () => {
    expect(parseJudgments({ nope: true }, IDS).ok).toBe(false);
    expect(parseJudgments(null, IDS).ok).toBe(false);
  });

  it("truncates rationales to 20 words", () => {
    const wordy = structuredClone(validPayload);
    wordy.contributions[0].rationale = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const result = parseJudgments(wordy, IDS);
    expect(result.ok).toBe(true);
    expect(result.judgments[0].rationale.split(/\s+/).length).toBeLessThanOrEqual(21);
    expect(truncateWords("one two three", 2)).toBe("one two…");
  });

  it("treats quiet categories as quiet even when the flag is missing", () => {
    const payload = structuredClone(validPayload);
    delete (payload.contributions[1] as { is_quiet_work?: boolean }).is_quiet_work;
    const result = parseJudgments(payload, IDS);
    expect(result.ok).toBe(true);
    expect(result.judgments[1].isQuietWork).toBe(true);
  });
});

describe("validateEvidenceIds", () => {
  const allowed = new Set(["c_001", "c_002"]);

  it("drops unknown and duplicate ids", () => {
    expect(validateEvidenceIds(["c_001", "c_999", "c_001", "c_002"], allowed)).toEqual([
      "c_001",
      "c_002",
    ]);
  });

  it("returns an empty array for non-arrays or non-strings", () => {
    expect(validateEvidenceIds(undefined, allowed)).toEqual([]);
    expect(validateEvidenceIds("c_001", allowed)).toEqual([]);
    expect(validateEvidenceIds([1, null, { id: "c_001" }], allowed)).toEqual([]);
  });
});

describe("topEvidenceIds fallback", () => {
  const scored = [
    { id: "c_001", memberId: "m1", value: 9 },
    { id: "c_002", memberId: "m1", value: 25 },
    { id: "c_003", memberId: "m1", value: 4 },
    { id: "c_004", memberId: "m2", value: 100 },
  ] as ScoredContribution[];

  it("attaches the person's top contributions by value", () => {
    expect(topEvidenceIds(scored, "m1", 2)).toEqual(["c_002", "c_001"]);
  });

  it("never borrows another person's evidence", () => {
    expect(topEvidenceIds(scored, "nobody", 2)).toEqual([]);
  });
});

describe("medianJudgments", () => {
  const base: ContributionJudgment = {
    id: "c_001",
    category: "code",
    impact: 3,
    complexity: 3,
    isQuietWork: false,
    rationale: "base",
  };

  it("takes the median score and majority category across runs", () => {
    const runs: ContributionJudgment[][] = [
      [{ ...base, impact: 5, complexity: 5 }],
      [{ ...base, impact: 1, complexity: 3, category: "review", isQuietWork: true }],
      [{ ...base, impact: 3, complexity: 4 }],
    ];
    const [merged] = medianJudgments(runs);
    expect(merged.impact).toBe(3);
    expect(merged.complexity).toBe(4);
    expect(merged.category).toBe("code");
  });

  it("returns the single run unchanged", () => {
    expect(medianJudgments([[base]])).toEqual([base]);
  });

  it("handles no runs", () => {
    expect(medianJudgments([])).toEqual([]);
    expect(medianJudgments([[]])).toEqual([]);
  });
});

describe("applyJudgments", () => {
  const items: NormalizedContribution[] = [
    {
      id: "c_001",
      sourceContributionIds: ["raw1"],
      sourceId: "p-1",
      memberId: "m1",
      person: "Priya",
      type: "commit",
      title: "PayPal integration",
      linesChanged: 200,
      hours: 4,
      timestamp: "2026-01-01T00:00:00.000Z",
      categoryHint: "code",
    },
    {
      id: "c_002",
      sourceContributionIds: ["raw2"],
      sourceId: "m-1",
      memberId: "m2",
      person: "Maya",
      type: "manual",
      title: "Reviewed every PR",
      linesChanged: 0,
      hours: 2,
      timestamp: "2026-01-02T00:00:00.000Z",
      categoryHint: "review",
    },
  ];

  it("joins judgments by id and computes value with category weights", () => {
    const joined = applyJudgments(items, [
      {
        id: "c_001",
        category: "code",
        impact: 5,
        complexity: 4,
        isQuietWork: false,
        rationale: "Core deliverable.",
      },
      {
        id: "c_002",
        category: "review",
        impact: 4,
        complexity: 4,
        isQuietWork: true,
        rationale: "Reviewed everything.",
      },
    ]);
    const scored = buildScoredContributions(joined, CATEGORY_WEIGHTS);
    expect(scored[0].value).toBe(20);
    expect(scored[1].value).toBeCloseTo(12.8);
    expect(scored[1].isQuietWork).toBe(true);
  });

  it("falls back to the category hint when a judgment is missing", () => {
    const joined = applyJudgments(items, []);
    expect(joined).toHaveLength(2);
    expect(joined[0].category).toBe("code");
    expect(joined[1].category).toBe("review");
    expect(joined.every((entry) => entry.impact >= 1 && entry.impact <= 5)).toBe(true);
  });
});
