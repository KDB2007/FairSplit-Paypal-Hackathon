import { beforeAll, describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { seedDemoProject } from "../../store";
import { normalizeContributions } from "../normalize";
import { scoreProjectExplainable } from "../pipeline";

beforeAll(() => {
  process.env.DEMO_MODE = "true";
});

function totals(split: Awaited<ReturnType<typeof scoreProjectExplainable>>) {
  return {
    equal: split.people.reduce((sum, p) => sum + p.amountsByMode.equal, 0),
    merit: split.people.reduce((sum, p) => sum + p.amountsByMode.merit, 0),
    hybrid: split.people.reduce((sum, p) => sum + p.amountsByMode.hybrid, 0),
    hours: split.people.reduce((sum, p) => sum + p.amountsByMode.hours, 0),
  };
}

describe("demo seed", () => {
  it("has 30 raw activities, 25 normalized items and 2 unassigned", () => {
    const project = seedDemoProject();
    expect(project.contributions).toHaveLength(30);

    const normalized = normalizeContributions(project.contributions, project.members);
    expect(normalized.contributions).toHaveLength(25);
    expect(normalized.unassigned).toHaveLength(2);
    expect(normalized.dropped).toHaveLength(3);

    const perMember = Object.fromEntries(
      project.members.map((member) => [
        member.name,
        normalized.assigned.filter((item) => item.memberId === member.id).length,
      ])
    );
    expect(perMember).toEqual({ Priya: 6, Leo: 10, Maya: 7 });

    // The story: Maya produced the fewest commits but carried the quiet work.
    const realCommits = Object.fromEntries(
      project.members.map((member) => [
        member.name,
        project.contributions.filter(
          (item) => item.memberId === member.id && item.type === "commit" && !item.isMerge && !item.trivial
        ).length,
      ])
    );
    expect(realCommits.Maya).toBe(1);
    expect(realCommits.Maya).toBeLessThan(realCommits.Priya);
    expect(realCommits.Maya).toBeLessThan(realCommits.Leo);
  });

  it("folds the linked commits into #42 and #43", () => {
    const project = seedDemoProject();
    const normalized = normalizeContributions(project.contributions, project.members);
    const paypal = normalized.contributions.find((item) => item.sourceId === "#42")!;
    const race = normalized.contributions.find((item) => item.sourceId === "#43")!;

    expect(paypal.sourceContributionIds).toEqual(["con_p03", "con_p04"]);
    expect(paypal.linesChanged).toBe(820);
    expect(race.sourceContributionIds).toEqual(["con_l09", "con_l10"]);
    expect(race.linesChanged).toBe(200);
  });
});

describe("demo scoring pipeline", () => {
  it("flags Maya as a hidden contributor producing very few commits", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);

    expect(split.people).toHaveLength(3);
    expect(split.formula.source).toBe("canned");
    expect(split.formula.runs).toBe(3);

    const maya = split.people.find((person) => person.person === "Maya")!;
    const priya = split.people.find((person) => person.person === "Priya")!;
    const leo = split.people.find((person) => person.person === "Leo")!;

    expect(maya.hiddenContributor).toBe(true);
    expect(priya.hiddenContributor).toBe(false);
    expect(leo.hiddenContributor).toBe(false);

    // Her merit share must clearly beat both her activity-count share and equal.
    expect(maya.meritPct).toBeGreaterThan(maya.activityCountSharePct + 8);
    expect(maya.meritPct).toBeGreaterThan(maya.equalPct + 8);
    expect(maya.quietValueSharePct).toBeGreaterThan(50);

    // Maya has the fewest logged items of the two contributors who shipped code
    // and the strongest merit share.
    expect(maya.activityCountSharePct).toBeLessThan(leo.activityCountSharePct);
    expect(maya.meritPct).toBeGreaterThan(priya.meritPct);
  });

  it("surfaces dollars of underpayment for the hidden contributor", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    const maya = split.people.find((person) => person.person === "Maya")!;
    const shortfall = maya.amountsByMode.merit - maya.amountsByMode.equal;
    expect(shortfall).toBeGreaterThan(0);
  });

  it("sums to exactly $3,000.00 in every mode", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    expect(split.totalAmountCents).toBe(300_000);
    expect(totals(split)).toEqual({
      equal: 300_000,
      merit: 300_000,
      hybrid: 300_000,
      hours: 300_000,
    });
  });

  it("takes the charter's fees off the top and scores only the work pool", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    // Demo charter: 10% finder + 5% lead, both to Priya.
    expect(split.layers).toMatchObject({
      finderCents: 30_000,
      leadCents: 15_000,
      workPoolCents: 255_000,
      finderMemberId: "mem_priya",
      leadMemberId: "mem_priya",
    });
    for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
      const work = split.people.reduce((sum, p) => sum + p.workAmountsByMode[mode], 0);
      expect(work).toBe(255_000);
      const pct = split.people.reduce(
        (sum, p) => sum + { equal: p.equalPct, merit: p.meritPct, hybrid: p.hybridPct, hours: p.hoursPct }[mode],
        0
      );
      expect(Math.round(pct * 100)).toBe(10_000);
    }
    const priya = split.people.find((p) => p.person === "Priya")!;
    expect(priya.amountsByMode.merit - priya.workAmountsByMode.merit).toBe(45_000);
  });

  it("gives every active person at least one valid evidence chip", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    const known = new Set(split.contributions.map((contribution) => contribution.id));

    for (const person of split.people) {
      if (person.zeroActivity) continue;
      expect(person.evidenceIds.length).toBeGreaterThanOrEqual(1);
      for (const id of person.evidenceIds) expect(known.has(id)).toBe(true);
    }
  });

  it("writes reasons in plain language without restating percentages", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    for (const person of split.people) {
      expect(person.reason.length).toBeGreaterThan(20);
      expect(person.reason).not.toMatch(/\d+(\.\d+)?\s?%/);
      expect(person.reason).not.toMatch(/\$\s?\d/);
    }
  });

  it("reports high confidence because the three demo runs barely differ", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    expect(split.confidence).toBe("high");
    expect(split.formula.maxMeritDeltaPct).toBeLessThan(5);
    expect(split.people.every((person) => person.range === undefined)).toBe(true);
  });

  it("keeps the two unmatched items in the unassigned tray with judgments", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    expect(split.unassigned).toHaveLength(2);
    expect(split.unassigned.map((item) => item.sourceId).sort()).toEqual(["card-99", "x-01"]);
    expect(split.unassigned.every((item) => item.impact >= 1 && item.impact <= 5)).toBe(true);
    expect(split.unassigned.every((item) => item.reason === "no_matching_member")).toBe(true);
  });

  it("never emits NaN or Infinity for any person or amount", async () => {
    const project = seedDemoProject();
    const split = await scoreProjectExplainable(project);
    for (const person of split.people) {
      const numbers = [
        person.meritPct,
        person.hybridPct,
        person.hoursPct,
        person.equalPct,
        ...Object.values(person.amountsByMode),
      ];
      for (const value of numbers) expect(Number.isFinite(value)).toBe(true);
      expect(Object.values(person.amountsByMode).every((cents) => Number.isInteger(cents))).toBe(true);
    }
  });
});

describe("edge cases", () => {
  const baseProject = (overrides: Partial<Project>): Project => ({
    id: "prj_edge",
    name: "Edge",
    totalAmount: 1000,
    philosophy: "merit",
    status: "charter_confirmed",
    members: [{ id: "solo", name: "Solo", email: "s@x.com", role: "lead", confirmed: true }],
    contributions: [],
    proposals: [],
    decisions: [],
    payouts: [],
    createdAt: new Date().toISOString(),
    charterVersion: 1,
    ...overrides,
  });

  it("gives a single member 100% with no errors", async () => {
    const split = await scoreProjectExplainable(
      baseProject({
        contributions: [
          {
            id: "raw1",
            projectId: "prj_edge",
            person: "Solo",
            memberId: "solo",
            type: "commit",
            sourceId: "s1",
            title: "Built the whole thing",
            timestamp: new Date().toISOString(),
          },
        ],
      })
    );
    const [solo] = split.people;
    expect(solo.meritPct).toBe(100);
    expect(solo.amountsByMode.merit).toBe(100_000);
  });

  it("returns an empty-but-valid split when there are no contributions", async () => {
    const split = await scoreProjectExplainable(baseProject({ members: [
      { id: "a", name: "A", email: "a@x.com", role: "lead", confirmed: true },
      { id: "b", name: "B", email: "b@x.com", role: "member", confirmed: true },
    ] }));
    expect(split.people).toHaveLength(2);
    expect(split.people.every((person) => person.zeroActivity)).toBe(true);
    expect(split.people.every((person) => person.evidenceIds.length === 0)).toBe(true);
    expect(totals(split).merit).toBe(100_000);
  });

  it("throws a typed error when there are no members", async () => {
    await expect(scoreProjectExplainable(baseProject({ members: [] }))).rejects.toMatchObject({
      code: "NO_MEMBERS",
    });
  });
});
