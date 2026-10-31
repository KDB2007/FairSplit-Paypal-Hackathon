import { describe, expect, it } from "vitest";
import type { ContributionCategory } from "../../types";
import {
  CATEGORY_WEIGHTS,
  computeSplit,
  contributionValue,
  isQuietCategory,
  type ComputeContribution,
} from "../compute";
import { sharesToCents } from "../rounding";
import { layerAmounts } from "../../layers";

const MEMBERS = [
  { id: "mem_a", name: "Priya" },
  { id: "mem_b", name: "Leo" },
  { id: "mem_c", name: "Maya" },
];

function item(
  id: string,
  memberId: string,
  category: ContributionCategory,
  impact: number,
  complexity: number,
  hours?: number
): ComputeContribution {
  return { id, memberId, person: memberId, category, impact, complexity, hours };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^= t >>> 15) >>> 0) / 4294967296;
  };
}

describe("contributionValue", () => {
  it("is impact * complexity * categoryWeight", () => {
    expect(contributionValue(5, 5, "code")).toBe(25);
    expect(contributionValue(5, 4, "review")).toBeCloseTo(16);
    expect(contributionValue(3, 2, "admin")).toBeCloseTo(3.6);
  });

  it("clamps scores into 1-5", () => {
    expect(contributionValue(99, 99, "code")).toBe(25);
    expect(contributionValue(-4, 0, "code")).toBe(1);
    expect(contributionValue(Number.NaN, 3, "code")).toBe(3);
  });

  it("treats every quiet category as quiet", () => {
    expect(isQuietCategory("review")).toBe(true);
    expect(isQuietCategory("unblocking")).toBe(true);
    expect(isQuietCategory("client_comms")).toBe(true);
    expect(isQuietCategory("admin")).toBe(true);
    expect(isQuietCategory("planning")).toBe(true);
    expect(isQuietCategory("code")).toBe(false);
    expect(isQuietCategory("design")).toBe(false);
  });
});

describe("computeSplit — modes", () => {
  const contributions = [
    item("c1", "mem_a", "code", 5, 5),
    item("c2", "mem_a", "planning", 4, 4, 3),
    item("c3", "mem_b", "code", 4, 4, 5),
    item("c4", "mem_b", "code", 3, 3, 5),
    item("c5", "mem_c", "review", 5, 4, 2),
    item("c6", "mem_c", "client_comms", 4, 4, 2),
  ];
  const result = computeSplit({ totalAmountCents: 300_000, members: MEMBERS, contributions });

  it("produces percentages that sum to exactly 100.00 in every mode", () => {
    for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
      const total = result.people.reduce(
        (sum, person) =>
          sum +
          (mode === "equal"
            ? person.equalPct
            : mode === "merit"
              ? person.meritPct
              : mode === "hybrid"
                ? person.hybridPct
                : person.hoursPct),
        0
      );
      expect(total).toBeCloseTo(100, 2);
    }
  });

  it("produces integer cents that sum to the project total in every mode", () => {
    for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
      const total = result.people.reduce((sum, person) => sum + person.amountsByMode[mode], 0);
      expect(total).toBe(300_000);
      expect(result.people.every((person) => Number.isInteger(person.amountsByMode[mode]))).toBe(true);
    }
  });

  it("splits equally when asked", () => {
    for (const person of result.people) expect(person.equalPct).toBeCloseTo(33.33, 1);
    expect(result.people.reduce((sum, person) => sum + person.equalPct, 0)).toBeCloseTo(100, 2);
  });

  it("weights hybrid 70/30 between merit and hours", () => {
    for (const person of result.people) {
      expect(person.hybridPct).toBeCloseTo(
        Math.round((0.7 * person.meritPct + 0.3 * person.hoursPct) * 100) / 100,
        1
      );
    }
  });

  it("uses actual logged hours when present", () => {
    // Priya 3h, Leo 10h, Maya 4h => 17h total.
    const byName = Object.fromEntries(result.people.map((p) => [p.person, p]));
    expect(byName.Priya.hoursPct).toBeCloseTo(17.65, 1);
    expect(byName.Leo.hoursPct).toBeCloseTo(58.82, 1);
    expect(result.hoursFallback).toBe(false);
  });

  it("falls back to an equal hours split when nobody logged hours", () => {
    const noHours = computeSplit({
      totalAmountCents: 300_000,
      members: MEMBERS,
      contributions: contributions.map((c) => ({ ...c, hours: 0 })),
    });
    expect(noHours.hoursFallback).toBe(true);
    for (const person of noHours.people) expect(person.hoursPct).toBeCloseTo(33.33, 1);
    expect(noHours.people.reduce((s, p) => s + p.amountsByMode.hours, 0)).toBe(300_000);
  });
});

describe("computeSplit — fairness properties", () => {
  it("resists commit spam: 20 trivial commits do not beat one high-impact PR", () => {
    const spam = Array.from({ length: 20 }, (_, i) => item(`t${i}`, "mem_a", "code", 1, 1));
    const real = [item("pr", "mem_b", "code", 5, 5)];
    const result = computeSplit({
      totalAmountCents: 100_000,
      members: [MEMBERS[0], MEMBERS[1]],
      contributions: [...spam, ...real],
    });

    const [priya, leo] = result.people;
    expect(leo.meritPct).toBeGreaterThan(priya.meritPct);
    // 20 x 1 value -> sqrt(20) = 4.47; one 25-value PR -> sqrt(25) = 5.
    expect(priya.meritPct).toBeCloseTo(47.21, 1);
    expect(leo.meritPct).toBeCloseTo(52.79, 1);
  });

  it("gives breadth across categories more credit than depth in one", () => {
    const narrow = Array.from({ length: 4 }, (_, i) => item(`n${i}`, "mem_a", "code", 5, 5));
    const broad = [
      item("b1", "mem_b", "code", 5, 5),
      item("b2", "mem_b", "review", 5, 5),
      item("b3", "mem_b", "client_comms", 5, 5),
      item("b4", "mem_b", "planning", 5, 5),
    ];
    const result = computeSplit({
      totalAmountCents: 100_000,
      members: [MEMBERS[0], MEMBERS[1]],
      contributions: [...narrow, ...broad],
    });
    // narrow: sqrt(100) = 10. broad: 3 x sqrt(25) + sqrt(20) = 19.47.
    expect(result.people[1].meritPct).toBeGreaterThan(result.people[0].meritPct);
  });

  it("gives a zero-activity member 0% with a flag and never divides by zero", () => {
    const result = computeSplit({
      totalAmountCents: 300_000,
      members: MEMBERS,
      contributions: [item("c1", "mem_a", "code", 4, 4), item("c2", "mem_b", "code", 3, 3)],
    });

    const maya = result.people.find((person) => person.memberId === "mem_c")!;
    expect(maya.zeroActivity).toBe(true);
    expect(maya.meritPct).toBe(0);
    expect(maya.amountsByMode.merit).toBe(0);
    expect(maya.hiddenContributor).toBe(false);
    expect(result.people.every((person) => Number.isFinite(person.meritPct))).toBe(true);
    expect(result.people.reduce((s, p) => s + p.amountsByMode.merit, 0)).toBe(300_000);
  });

  it("handles an all-zero project without NaN and falls back to equal merit", () => {
    const result = computeSplit({ totalAmountCents: 300_000, members: MEMBERS, contributions: [] });
    expect(result.people.every((person) => person.zeroActivity)).toBe(true);
    expect(result.people.every((person) => Number.isFinite(person.meritPct))).toBe(true);
    expect(result.people.map((person) => person.meritPct)).toEqual([33.34, 33.33, 33.33]);
    expect(result.people.reduce((s, p) => s + p.amountsByMode.merit, 0)).toBe(300_000);
  });

  it("gives a single member 100% in every mode", () => {
    const result = computeSplit({
      totalAmountCents: 300_000,
      members: [{ id: "solo", name: "Solo" }],
      contributions: [item("c1", "solo", "code", 4, 4, 6)],
    });
    const [solo] = result.people;
    expect(solo.meritPct).toBe(100);
    expect(solo.hybridPct).toBe(100);
    expect(solo.hoursPct).toBe(100);
    expect(solo.equalPct).toBe(100);
    expect(solo.amountsByMode).toEqual({ equal: 300_000, merit: 300_000, hybrid: 300_000, hours: 300_000 });
  });

  it("keeps the cents exact across 1000 random projects in all four modes", () => {
    const random = seededRandom(2026);
    const categories: ContributionCategory[] = [
      "code",
      "review",
      "design",
      "client_comms",
      "unblocking",
      "admin",
      "planning",
    ];

    for (let i = 0; i < 1000; i += 1) {
      const memberCount = 1 + Math.floor(random() * 5);
      const projectMembers = Array.from({ length: memberCount }, (_, index) => ({
        id: `m${index}`,
        name: `Person ${index}`,
      }));
      const contributions: ComputeContribution[] = Array.from(
        { length: Math.floor(random() * 15) },
        (_, index) => ({
          id: `c${index}`,
          memberId:
            random() < 0.1
              ? null
              : projectMembers[Math.floor(random() * memberCount)].id,
          person: "x",
          category: categories[Math.floor(random() * categories.length)],
          impact: 1 + Math.floor(random() * 5),
          complexity: 1 + Math.floor(random() * 5),
          hours: random() < 0.3 ? undefined : random() * 8,
        })
      );
      const totalAmountCents = Math.floor(random() * 1_000_000);
      const result = computeSplit({ totalAmountCents, members: projectMembers, contributions });

      for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
        const cents = result.people.reduce((sum, person) => sum + person.amountsByMode[mode], 0);
        expect(cents).toBe(totalAmountCents);
        const pct = result.people.reduce(
          (sum, person) =>
            sum +
            (mode === "equal"
              ? person.equalPct
              : mode === "merit"
                ? person.meritPct
                : mode === "hybrid"
                  ? person.hybridPct
                  : person.hoursPct),
          0
        );
        expect(pct).toBeCloseTo(100, 2);
        expect(result.people.every((person) => Number.isFinite(person.meritPct))).toBe(true);
      }
    }
  });
});

describe("hiddenContributor", () => {
  it("flags someone whose merit clearly beats their item-count share via quiet work", () => {
    const quietHero = [
      item("q1", "mem_c", "review", 5, 5),
      item("q2", "mem_c", "review", 5, 5),
      item("q3", "mem_c", "unblocking", 5, 5),
      item("q4", "mem_c", "client_comms", 5, 5),
      item("q5", "mem_c", "admin", 4, 4),
    ];
    const loudDev = Array.from({ length: 6 }, (_, i) => item(`d${i}`, "mem_b", "code", 2, 2));
    const result = computeSplit({
      totalAmountCents: 300_000,
      members: [MEMBERS[1], MEMBERS[2]],
      contributions: [...loudDev, ...quietHero],
    });

    const maya = result.people.find((person) => person.memberId === "mem_c")!;
    const leo = result.people.find((person) => person.memberId === "mem_b")!;
    expect(maya.meritPct - maya.activityCountSharePct).toBeGreaterThanOrEqual(8);
    expect(maya.quietValueSharePct).toBeGreaterThan(50);
    expect(maya.hiddenContributor).toBe(true);
    expect(leo.hiddenContributor).toBe(false);
  });

  it("does not flag a high-volume contributor with little quiet work", () => {
    const spam = Array.from({ length: 30 }, (_, i) => item(`s${i}`, "mem_a", "code", 3, 3));
    const result = computeSplit({
      totalAmountCents: 100_000,
      members: [MEMBERS[0]],
      contributions: spam,
    });
    expect(result.people[0].hiddenContributor).toBe(false);
  });
});

describe("sharesToCents", () => {
  it("matches computeSplit output for a three-way split", () => {
    const shares = [0.4, 0.35, 0.25];
    expect(sharesToCents(shares, 300_000)).toEqual([120_000, 105_000, 75_000]);
  });
});

describe("category weights", () => {
  it("uses the documented defaults", () => {
    expect(CATEGORY_WEIGHTS).toEqual({
      code: 1.0,
      review: 0.8,
      design: 1.0,
      client_comms: 1.0,
      unblocking: 0.9,
      admin: 0.6,
      planning: 0.8,
    });
  });
});

describe("layered pool", () => {
  const contributions = [
    item("c1", "mem_a", "code", 4, 3, 10),
    item("c2", "mem_b", "code", 3, 3, 6),
    item("c3", "mem_c", "client_comms", 5, 2, 3),
  ];
  const modes = ["equal", "merit", "hybrid", "hours"] as const;

  it("matches the legacy split when no layers are given", () => {
    const result = computeSplit({ totalAmountCents: 100_001, members: MEMBERS, contributions });
    for (const person of result.people) {
      expect(person.amountsByMode).toEqual(person.workAmountsByMode);
      expect(person.finderAmountCents + person.leadAmountCents).toBe(0);
    }
    expect(result.layers.workPoolCents).toBe(100_001);
  });

  it("adds fees on top of work-pool slices and sums exactly to the total", () => {
    const layers = layerAmounts(100_001, {
      finderBps: 1500,
      finderMemberId: "mem_b",
      leadBps: 700,
      leadMemberId: "mem_b", // finder and lead can be the same person
    });
    const result = computeSplit({ totalAmountCents: 100_001, members: MEMBERS, contributions, layers });
    for (const mode of modes) {
      const total = result.people.reduce((sum, p) => sum + p.amountsByMode[mode], 0);
      const work = result.people.reduce((sum, p) => sum + p.workAmountsByMode[mode], 0);
      expect(total).toBe(100_001);
      expect(work).toBe(layers.workPoolCents);
    }
    const leo = result.people.find((p) => p.memberId === "mem_b")!;
    expect(leo.finderAmountCents).toBe(15_000);
    expect(leo.leadAmountCents).toBe(7_000);
    expect(leo.amountsByMode.merit - leo.workAmountsByMode.merit).toBe(22_000);
  });

  it("keeps a fee in the work pool when nobody is assigned to receive it", () => {
    const layers = layerAmounts(100_000, {
      finderBps: 1000,
      finderMemberId: null,
      leadBps: 500,
      leadMemberId: "mem_a",
    });
    expect(layers).toMatchObject({ finderCents: 0, leadCents: 5_000, workPoolCents: 95_000 });
  });
});
