import { describe, expect, it } from "vitest";
import type { Contribution, Member } from "../../types";
import { normalizeContributions, categoryHint } from "../normalize";

const members: Member[] = [
  { id: "mem_a", name: "Priya", email: "p@x.com", role: "lead", confirmed: true },
  { id: "mem_b", name: "Leo", email: "l@x.com", role: "member", confirmed: true },
  { id: "mem_c", name: "Maya", email: "m@x.com", role: "member", confirmed: true },
];

function contribution(partial: Partial<Contribution> & Pick<Contribution, "id" | "title">): Contribution {
  return {
    projectId: "prj",
    person: "Priya",
    type: "commit",
    sourceId: partial.id,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("normalizeContributions", () => {
  it("assigns stable c_001… ids in chronological order", () => {
    const result = normalizeContributions(
      [
        contribution({ id: "a", title: "Second", timestamp: "2026-01-02T00:00:00.000Z" }),
        contribution({ id: "b", title: "First", timestamp: "2026-01-01T00:00:00.000Z" }),
        contribution({ id: "c", title: "Third", timestamp: "2026-01-03T00:00:00.000Z" }),
      ],
      members
    );

    expect(result.contributions.map((item) => item.id)).toEqual(["c_001", "c_002", "c_003"]);
    expect(result.contributions.map((item) => item.title)).toEqual(["First", "Second", "Third"]);

    // Re-running produces the same ids, not just the same order.
    const again = normalizeContributions(
      [
        contribution({ id: "c", title: "Third", timestamp: "2026-01-03T00:00:00.000Z" }),
        contribution({ id: "a", title: "Second", timestamp: "2026-01-02T00:00:00.000Z" }),
        contribution({ id: "b", title: "First", timestamp: "2026-01-01T00:00:00.000Z" }),
      ],
      members
    );
    expect(again.contributions.map((item) => item.id)).toEqual(["c_001", "c_002", "c_003"]);
  });

  it("folds linked commits into their PR and sums size + hours", () => {
    const result = normalizeContributions(
      [
        contribution({
          id: "pr1",
          type: "pr",
          sourceId: "#42",
          title: "PayPal payout integration",
          person: "Priya",
          hours: 6,
          linesChanged: 640,
        }),
        contribution({
          id: "commit1",
          sourceId: "sha1",
          title: "Guard retries",
          person: "Priya",
          prRef: "#42",
          hours: 2,
          linesChanged: 120,
          timestamp: "2026-01-02T00:00:00.000Z",
        }),
      ],
      members
    );

    expect(result.contributions).toHaveLength(1);
    const item = result.contributions[0];
    expect(item.sourceId).toBe("#42");
    expect(item.hours).toBe(8);
    expect(item.linesChanged).toBe(760);
    expect(item.sourceContributionIds.sort()).toEqual(["commit1", "pr1"]);
  });

  it("drops merge commits and whitespace/typo-only changes", () => {
    const result = normalizeContributions(
      [
        contribution({ id: "merge", title: "Merge pull request #42 from payouts" }),
        contribution({ id: "merge2", title: "whatever", isMerge: true }),
        contribution({ id: "typo", title: "Fix typo in README", linesChanged: 1 }),
        contribution({ id: "fmt", title: "Prettier formatting pass", linesChanged: 2 }),
        contribution({
          id: "real",
          title: "Correct invoice rounding on refunds",
          linesChanged: 40,
        }),
      ],
      members
    );

    expect(result.dropped.map((entry) => entry.contribution.id).sort()).toEqual([
      "fmt",
      "merge",
      "merge2",
      "typo",
    ]);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].id).toBe("c_001");
  });

  it("routes unknown people to unassigned instead of guessing", () => {
    const result = normalizeContributions(
      [
        contribution({ id: "u1", title: "Polish empty states", person: "Alex" }),
        contribution({ id: "u2", title: "Move QA checklist to Done", person: "Jordan", type: "trello" }),
        contribution({ id: "a1", title: "Auth flow", person: "leo" }),
      ],
      members
    );

    expect(result.assigned).toHaveLength(1);
    expect(result.assigned[0].memberId).toBe("mem_b");
    expect(result.unassigned.map((item) => item.person).sort()).toEqual(["Alex", "Jordan"]);
    expect(result.unassigned.every((item) => item.memberId === null)).toBe(true);
  });

  it("prefers an explicit memberId over the display name", () => {
    const result = normalizeContributions(
      [contribution({ id: "x", title: "Design pass", person: "Somebody Else", memberId: "mem_c" })],
      members
    );
    expect(result.contributions[0].memberId).toBe("mem_c");
    expect(result.unassigned).toHaveLength(0);
  });

  it("keeps duplicate names as separate members and never merges their ids", () => {
    const twins: Member[] = [
      { id: "mem_1", name: "Alex", email: "a1@x.com", role: "lead", confirmed: true },
      { id: "mem_2", name: "Alex", email: "a2@x.com", role: "member", confirmed: true },
    ];
    const result = normalizeContributions(
      [
        contribution({ id: "t1", title: "Auth work", person: "Alex", memberId: "mem_1" }),
        contribution({ id: "t2", title: "Checkout work", person: "Alex", memberId: "mem_2" }),
        contribution({ id: "t3", title: "Ambiguous work", person: "Alex" }),
      ],
      twins
    );

    expect(result.contributions[0].memberId).toBe("mem_1");
    expect(result.contributions[1].memberId).toBe("mem_2");
    // Without a memberId the name is ambiguous, so we park it rather than split it.
    expect(result.unassigned.map((item) => item.sourceContributionIds[0])).toEqual(["t3"]);
  });

  it("returns empty arrays for an empty project", () => {
    const result = normalizeContributions([], members);
    expect(result.contributions).toEqual([]);
    expect(result.assigned).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.dropped).toEqual([]);
  });
});

describe("categoryHint", () => {
  it("recognises quiet work from titles", () => {
    expect(categoryHint({ type: "manual", title: "Reviewed every checkout PR" })).toBe("review");
    expect(categoryHint({ type: "manual", title: "Unblocked Leo on the API contract" })).toBe("unblocking");
    expect(categoryHint({ type: "manual", title: "Client kickoff call" })).toBe("client_comms");
    expect(categoryHint({ type: "manual", title: "Invoice and contractor paperwork" })).toBe("admin");
    expect(categoryHint({ type: "trello", title: "Sprint planning" })).toBe("planning");
    expect(categoryHint({ type: "manual", title: "Design system and component library" })).toBe("design");
    expect(categoryHint({ type: "commit", title: "Wire receipt PDF export" })).toBe("code");
  });
});
