import { describe, expect, it } from "vitest";
import { contributionsInWindow, excludedByWindow } from "../contribution-window";
import type { Contribution, Project } from "../types";

function contribution(overrides: Partial<Contribution>): Contribution {
  return {
    id: "c1",
    projectId: "p1",
    person: "Ada",
    type: "pr",
    sourceId: "1",
    title: "Test",
    timestamp: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Test",
    totalAmount: 1000,
    philosophy: "merit",
    status: "charter_confirmed",
    members: [],
    contributions: [],
    proposals: [],
    decisions: [],
    payouts: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    charterVersion: 1,
    ...overrides,
  };
}

describe("contributionsInWindow", () => {
  it("keeps everything when there is no since date", () => {
    const p = project({
      contributions: [contribution({ timestamp: "2020-01-01T00:00:00.000Z" })],
    });
    expect(contributionsInWindow(p)).toHaveLength(1);
  });

  it("drops GitHub items before the cutoff and keeps manual", () => {
    const p = project({
      sources: { github: { repos: ["o/r"], since: "2026-10-28T00:00:00.000Z" } },
      contributions: [
        contribution({ id: "old", type: "pr", timestamp: "2026-10-27T12:00:00.000Z" }),
        contribution({ id: "new", type: "commit", timestamp: "2026-10-30T00:00:00.000Z" }),
        contribution({ id: "m", type: "manual", timestamp: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    const scoped = contributionsInWindow(p);
    expect(scoped.map((c) => c.id)).toEqual(["new", "m"]);
  });

  it("keeps GitHub items at or after the cutoff", () => {
    const p = project({
      sources: { github: { repos: ["o/r"], since: "2026-10-28T00:00:00.000Z" } },
      contributions: [contribution({ id: "edge", type: "review", timestamp: "2026-10-28T00:00:00.000Z" })],
    });
    expect(contributionsInWindow(p)).toHaveLength(1);
  });

  it("keeps Trello items regardless of the GitHub date", () => {
    const p = project({
      sources: { github: { repos: ["o/r"], since: "2026-10-28T00:00:00.000Z" } },
      contributions: [contribution({ id: "t", type: "trello", timestamp: "2026-01-01T00:00:00.000Z" })],
    });
    expect(contributionsInWindow(p)).toHaveLength(1);
  });

  it("keeps an undated GitHub item rather than dropping it", () => {
    const p = project({
      sources: { github: { repos: ["o/r"], since: "2026-10-28T00:00:00.000Z" } },
      contributions: [contribution({ id: "x", type: "pr", timestamp: "" })],
    });
    expect(contributionsInWindow(p)).toHaveLength(1);
  });

  it("reports how many were excluded", () => {
    const p = project({
      sources: { github: { repos: ["o/r"], since: "2026-10-28T00:00:00.000Z" } },
      contributions: [
        contribution({ id: "old", timestamp: "2026-10-27T00:00:00.000Z" }),
        contribution({ id: "new", timestamp: "2026-10-29T00:00:00.000Z" }),
      ],
    });
    expect(excludedByWindow(p)).toBe(1);
  });
});
