import { beforeAll, describe, expect, it } from "vitest";
import type { ScoredSplit } from "../../types";
import { seedDemoProject } from "../../store";
import { scoreProjectExplainable } from "../pipeline";
import { recomputeWithAssignments } from "../recompute";

beforeAll(() => {
  process.env.DEMO_MODE = "true";
});

async function demo(): Promise<{
  split: ScoredSplit;
  members: Array<{ id: string; name: string }>;
}> {
  const project = seedDemoProject();
  const split = await scoreProjectExplainable(project);
  return {
    split,
    members: project.members.map((member) => ({ id: member.id, name: member.name })),
  };
}

function centsTotal(split: ScoredSplit): number[] {
  return (["equal", "merit", "hybrid", "hours"] as const).map((mode) =>
    split.people.reduce((sum, person) => sum + person.amountsByMode[mode], 0)
  );
}

describe("recomputeWithAssignments", () => {
  it("is a no-op when nothing is assigned", async () => {
    const { split, members } = await demo();
    expect(recomputeWithAssignments(split, {}, members)).toBe(split);
    expect(recomputeWithAssignments(split, { c_999: members[0].id }, members)).toBe(split);
  });

  it("routes an unassigned item, paying the assignee and keeping cents exact", async () => {
    const { split, members } = await demo();
    const item = split.unassigned[0];
    const priya = split.people.find((person) => person.person === "Priya")!;

    const next = recomputeWithAssignments(
      split,
      { [item.id]: priya.memberId },
      members
    );

    expect(next.unassigned).toHaveLength(split.unassigned.length - 1);
    expect(next.contributions).toHaveLength(split.contributions.length + 1);
    expect(next.people.find((person) => person.memberId === priya.memberId)!.meritPct).toBeGreaterThan(
      priya.meritPct
    );

    for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
      const cents = next.people.reduce((sum, person) => sum + person.amountsByMode[mode], 0);
      expect(cents).toBe(next.totalAmountCents);
    }
    expect(centsTotal(next)).toEqual([300_000, 300_000, 300_000, 300_000]);

    // Evidence attached to the reassigned item resolves for the drawer.
    const assignee = next.people.find((person) => person.memberId === priya.memberId)!;
    expect(assignee.evidenceIds).toContain(item.id);
    const known = new Set(next.contributions.map((contribution) => contribution.id));
    for (const id of assignee.evidenceIds) expect(known.has(id)).toBe(true);

    // Percentages still add to exactly 100.00.
    const pctTotal = next.people.reduce(
      (sum, person) => sum + person.meritPct + person.hybridPct + person.hoursPct + person.equalPct,
      0
    );
    expect(pctTotal).toBeCloseTo(400, 2);
  });

  it("does not mutate the split it was given", async () => {
    const { split, members } = await demo();
    const item = split.unassigned[0];
    const before = JSON.stringify(split);

    recomputeWithAssignments(split, { [item.id]: members[0].id }, members);

    expect(JSON.stringify(split)).toBe(before);
    expect(split.unassigned).toHaveLength(2);
    expect(split.contributions).toHaveLength(23);
  });

  it("handles assigning every unassigned item at once", async () => {
    const { split, members } = await demo();
    const assignments = Object.fromEntries(
      split.unassigned.map((item, index) => [item.id, members[index % members.length].id])
    );

    const next = recomputeWithAssignments(split, assignments, members);
    expect(next.unassigned).toHaveLength(0);
    expect(next.contributions).toHaveLength(
      split.contributions.length + Object.keys(assignments).length
    );
    expect(centsTotal(next)).toEqual([300_000, 300_000, 300_000, 300_000]);
    expect(next.formula.notes.at(-1)).toMatch(/reassigned locally/);
  });
});
