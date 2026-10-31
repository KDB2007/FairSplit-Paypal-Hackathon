import { describe, expect, it } from "vitest";
import {
  applyDecisions,
  createProject,
  isScoringUnlocked,
  payoutLines,
  seedDemoProject,
  setMemberConfirmation,
  updatePoolConfig,
} from "../store";

const DEMO_CONFIG = {
  finderBps: 1000,
  finderMemberId: "mem_priya",
  leadBps: 500,
  leadMemberId: "mem_priya",
  workPhilosophy: "merit" as const,
};

function shares(priya: number, leo: number, maya: number) {
  return [
    { person: "Priya", finalPct: priya, status: "approved" },
    { person: "Leo", finalPct: leo, status: "approved" },
    { person: "Maya", finalPct: maya, status: "approved" },
  ];
}

describe("review overrides on a layered pool", () => {
  it("only moves the work pool — charter fees stay fixed", () => {
    const project = seedDemoProject();
    const before = applyDecisions(project, shares(45, 35, 20)).decisions;
    const after = applyDecisions(project, shares(40, 35, 25)).decisions;

    const priyaBefore = before.find((d) => d.person === "Priya")!;
    const priyaAfter = after.find((d) => d.person === "Priya")!;
    expect(priyaBefore.feeCents).toBe(45_000);
    expect(priyaAfter.feeCents).toBe(45_000);

    // Work pool is $2,550: 40% → $1,020 + $450 fees.
    expect(priyaAfter.amountCents).toBe(147_000);
    expect(after.find((d) => d.person === "Maya")!.amountCents).toBe(63_750);
    expect(after.reduce((sum, d) => sum + d.amountCents, 0)).toBe(300_000);
  });

  it("pays a disputed member's charter fees but withholds their work slice", () => {
    const project = seedDemoProject();
    applyDecisions(project, [
      { person: "Priya", finalPct: 0, status: "disputed" },
      { person: "Leo", finalPct: 60, status: "approved" },
      { person: "Maya", finalPct: 40, status: "approved" },
    ]);
    const lines = payoutLines(project);
    const priya = lines.find((l) => l.person === "Priya")!;
    expect(priya.breakdown).toEqual({ finderCents: 30_000, leadCents: 15_000, workCents: 0 });
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(300_000);
  });
});

describe("charter versions", () => {
  it("a new project starts with an all-work-pool config", () => {
    const project = createProject({
      name: "New",
      totalAmount: 1000,
      philosophy: "hybrid",
      members: [
        { name: "A", email: "a@x.com", confirmed: true },
        { name: "B", email: "b@x.com", confirmed: false },
      ],
    });
    expect(project.poolConfig).toMatchObject({ finderBps: 0, leadBps: 0, workPhilosophy: "hybrid" });
    expect(isScoringUnlocked(project)).toBe(false);
    setMemberConfirmation(project.id, project.members[1].id, true);
    expect(isScoringUnlocked(project)).toBe(true);
    expect(project.status).toBe("charter_confirmed");
  });

  it("changing the pool resets confirmations and discards the old scoring", () => {
    const project = seedDemoProject();
    applyDecisions(project, shares(45, 35, 20));
    const updated = updatePoolConfig(project.id, { ...DEMO_CONFIG, finderBps: 500 })!;
    expect(updated.charterVersion).toBe(2);
    expect(updated.poolConfig?.version).toBe(2);
    expect(updated.members.every((m) => !m.confirmed)).toBe(true);
    expect(updated.decisions).toHaveLength(0);
    expect(isScoringUnlocked(updated)).toBe(false);
  });
});
