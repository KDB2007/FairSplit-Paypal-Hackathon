import { beforeAll, describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { fetchDirectCommits, fetchMergedPullRequests, mapDirectCommits, mapGithubPullRequests } from "../github";
import { mapTrelloCards, parseBoardId } from "../trello";
import { syncProject, type SyncEnv } from "../sync";
import { reattribute, unmatchedAuthors } from "../identity";
import { normalizeContributions } from "../../explain/normalize";
import { scoreProjectExplainable } from "../../explain/pipeline";
import { defaultPoolConfig } from "../../layers";
import { BOARD, PULL_REQUESTS, REST_DIRECT_COMMITS, fakeFetch } from "./fixtures";
import { resolveTrelloUsernames, duplicateHandleErrors } from "../identity";

const LIVE_ENV: SyncEnv = { GITHUB_TOKEN: "ghp_test", TRELLO_KEY: "k", TRELLO_TOKEN: "t" };

let counter = 0;
const newId = (prefix: string) => `${prefix}_${++counter}`;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj_live",
    name: "Live",
    totalAmount: 1000,
    philosophy: "merit",
    status: "charter_confirmed",
    members: [
      { id: "m_priya", name: "Priya", email: "p@x.com", role: "lead", confirmed: true, githubLogin: "priya-dev" },
      { id: "m_leo", name: "Leo", email: "l@x.com", role: "member", confirmed: true },
      { id: "m_maya", name: "Maya", email: "m@x.com", role: "member", confirmed: true, trelloMemberId: "tm_maya" },
    ],
    contributions: [
      { id: "manual_1", projectId: "prj_live", person: "Maya", memberId: "m_maya", type: "manual", sourceId: "man1", title: "[client call] Scope review", hours: 2, timestamp: "2026-10-01T09:00:00Z" },
    ],
    proposals: [],
    decisions: [],
    payouts: [],
    createdAt: "2026-10-01T00:00:00Z",
    charterVersion: 1,
    poolConfig: defaultPoolConfig("merit"),
    sources: { github: { repos: ["acme/app"] }, trello: { boardId: "AbCdEf12" } },
    ...overrides,
  };
}

describe("mapGithubPullRequests", () => {
  const items = mapGithubPullRequests(PULL_REQUESTS, "acme/app");
  const byId = (sourceId: string) => items.find((i) => i.sourceId === sourceId);

  it("emits the PR with its size, and skips PRs by bots", () => {
    expect(byId("acme/app#12")).toMatchObject({ type: "pr", linesChanged: 150, externalAuthor: { id: "priya-dev" } });
    expect(byId("acme/app#13")).toBeUndefined();
  });

  it("folds the PR author's commits into the PR and flags merge commits", () => {
    expect(byId("aaa1")).toMatchObject({ type: "commit", prRef: "acme/app#12" });
    expect(byId("aaa2")).toMatchObject({ prRef: "acme/app#12", externalAuthor: { id: "priya-dev" } });
    expect(byId("aaa3")).toMatchObject({ isMerge: true });
  });

  it("keeps co-author commits separate and drops bot commits", () => {
    expect(byId("bbb1")).toMatchObject({ prRef: undefined, externalAuthor: { id: "leo" } });
    expect(byId("bot1")).toBeUndefined();
  });

  it("emits one review per reviewer, ignoring self, bot and dismissed reviews", () => {
    const reviews = items.filter((i) => i.type === "review");
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      sourceId: "acme/app#12:review:maya",
      title: "Reviewed: Add payout retries",
      evidenceUrl: "r2", // latest review wins
    });
  });
});

describe("fetchMergedPullRequests (REST, fixtures)", () => {
  it("uses GitHub's own review link rather than reconstructing one", async () => {
    const prs = await fetchMergedPullRequests("acme/app", { fetchImpl: fakeFetch() });
    const pr12 = prs.find((p) => p.number === 12)!;
    const approval = pr12.reviews.nodes.find((n) => n.author?.login === "maya" && n.state === "APPROVED");
    expect(approval?.url).toBe("https://github.com/acme/app/pull/12#pullrequestreview-2");
  });

  it("gives every PR, commit and review a working, distinct evidence URL", async () => {
    const prs = await fetchMergedPullRequests("acme/app", { fetchImpl: fakeFetch() });
    const items = mapGithubPullRequests(prs, "acme/app");
    for (const item of items) {
      expect(item.evidenceUrl).toBeTruthy();
      expect(item.evidenceUrl).toMatch(/^https:\/\/github\.com\//);
    }
    const urls = items.map((i) => i.evidenceUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("direct commits (pushed without a PR)", () => {
  it("excludes commits already counted via a PR, by sha or by squash-merge message", async () => {
    const prs = await fetchMergedPullRequests("acme/app", { fetchImpl: fakeFetch() });
    const knownShas = new Set(prs.flatMap((pr) => pr.commits.nodes.map((n) => n.commit.oid)));
    const mergedPrNumbers = new Set(prs.map((pr) => pr.number));

    const commits = await fetchDirectCommits("acme/app", { fetchImpl: fakeFetch() });
    const items = mapDirectCommits(commits, { shas: knownShas, mergedPrNumbers });
    const bySha = Object.fromEntries(items.map((i) => [i.sourceId, i]));

    expect(bySha.aaa1).toBeUndefined(); // already counted as PR #12's own commit
    expect(bySha.squash1).toBeUndefined(); // squash-merge of already-counted PR #13
    expect(bySha.unlinked1).toBeUndefined(); // no linked GitHub account — can't attribute
    expect(bySha.bot1direct).toBeUndefined(); // bot
  });

  it("includes a genuine direct commit, attributed to its author", async () => {
    const commits = await fetchDirectCommits("acme/app", { fetchImpl: fakeFetch() });
    const items = mapDirectCommits(commits, { shas: new Set(), mergedPrNumbers: new Set() });
    const direct = items.find((i) => i.sourceId === "direct1");
    expect(direct).toMatchObject({
      type: "commit",
      title: "Fix the dashboard spinner",
      evidenceUrl: "https://github.com/acme/app/commit/direct1",
      externalAuthor: { source: "github", id: "newdev" },
    });
  });

  it("flags a real merge commit so normalize can drop it, same as a PR commit", async () => {
    const items = mapDirectCommits(REST_DIRECT_COMMITS as never, { shas: new Set(), mergedPrNumbers: new Set() });
    expect(items.find((i) => i.sourceId === "merge1")).toMatchObject({ isMerge: true });
  });

  it("treats an empty repository as zero commits rather than an error", async () => {
    const emptyRepoFetch = async () => new Response(JSON.stringify({ message: "Git Repository is empty." }), { status: 409 });
    expect(await fetchDirectCommits("acme/app", { fetchImpl: emptyRepoFetch })).toEqual([]);
  });
});

describe("resolveTrelloUsernames", () => {
  it("fills in trelloMemberId from a self-reported username, matched against the board", () => {
    const members = [
      { id: "m1", name: "Maya", email: "m@x.com", role: "member" as const, confirmed: true, trelloUsername: "Maya_T" },
      { id: "m2", name: "Leo", email: "l@x.com", role: "member" as const, confirmed: true, trelloMemberId: "already_set" },
      { id: "m3", name: "Ana", email: "a@x.com", role: "member" as const, confirmed: true },
    ];
    const resolved = resolveTrelloUsernames(members, BOARD.members);
    expect(resolved.find((m) => m.id === "m1")?.trelloMemberId).toBe("tm_maya");
    expect(resolved.find((m) => m.id === "m2")?.trelloMemberId).toBe("already_set"); // untouched
    expect(resolved.find((m) => m.id === "m3")?.trelloMemberId).toBeUndefined(); // no username to resolve
  });

  it("leaves an unrecognized username unresolved rather than guessing", () => {
    const members = [
      { id: "m1", name: "Someone", email: "s@x.com", role: "member" as const, confirmed: true, trelloUsername: "nobody_on_board" },
    ];
    expect(resolveTrelloUsernames(members, BOARD.members)[0].trelloMemberId).toBeUndefined();
  });
});

describe("duplicateHandleErrors", () => {
  it("flags the same GitHub or Trello handle claimed by two members", () => {
    const errors = duplicateHandleErrors([
      { name: "Ana", githubLogin: "shared-login" },
      { name: "Ben", githubLogin: "Shared-Login" }, // case-insensitive clash
      { name: "Cy", trelloUsername: "cy_t" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Ana");
    expect(errors[0]).toContain("Ben");
  });

  it("allows distinct handles, and members with none at all", () => {
    expect(
      duplicateHandleErrors([
        { name: "Ana", githubLogin: "ana-dev" },
        { name: "Ben" }, // no handles — a non-technical stakeholder
      ])
    ).toEqual([]);
  });
});

describe("mapTrelloCards", () => {
  it("credits every member on Done cards and parks memberless cards", () => {
    const items = mapTrelloCards(BOARD);
    expect(items.map((i) => i.sourceId)).toEqual(["card:c1:tm_maya", "card:c1:tm_leo", "card:c3"]);
    expect(items[0].externalAuthor).toEqual({ source: "trello", id: "tm_maya", label: "@maya_t" });
    expect(items[2].externalAuthor).toBeUndefined();
  });

  it("parses board ids from pasted URLs", () => {
    expect(parseBoardId("https://trello.com/b/AbCdEf12/fairsplit-board")).toBe("AbCdEf12");
    expect(parseBoardId("../../members/me")).toBeNull();
  });
});

describe("syncProject (live, fixtures)", () => {
  it("attributes mapped handles, reports unmatched ones and leaves manual work alone", async () => {
    const p = project();
    const report = await syncProject(p, "both", { env: LIVE_ENV, fetchImpl: fakeFetch(), newId });

    expect(report.mode).toBe("live");
    expect(report.errors).toEqual([]);
    expect(report.updated).toBe(0);
    expect(p.contributions.find((c) => c.sourceId === "acme/app#12")).toMatchObject({ memberId: "m_priya", person: "Priya" });
    expect(p.contributions.find((c) => c.sourceId === "card:c1:tm_maya")).toMatchObject({ memberId: "m_maya" });
    expect(report.unmatched.map((u) => `${u.source}:${u.id}:${u.count}`)).toEqual([
      "github:newdev:2", // unmapped direct-commit author (2 of their own commits), ranks first by count
      "trello:tm_leo:1", // remaining ties sort by label: "@leo_t" < "leo" < "maya"
      "github:leo:1",
      "github:maya:1",
    ]);
    expect(p.contributions.find((c) => c.id === "manual_1")?.title).toBe("[client call] Scope review");
  });

  it("is idempotent: re-syncing updates in place instead of duplicating", async () => {
    const p = project();
    const first = await syncProject(p, "both", { env: LIVE_ENV, fetchImpl: fakeFetch(), newId });
    const count = p.contributions.length;
    const ids = p.contributions.map((c) => c.id);
    const second = await syncProject(p, "both", { env: LIVE_ENV, fetchImpl: fakeFetch(), newId });
    expect(second.added).toBe(0);
    expect(second.updated).toBe(first.added);
    expect(p.contributions).toHaveLength(count);
    expect(p.contributions.map((c) => c.id)).toEqual(ids);
  });

  it("reports a missing token or source without failing the other source", async () => {
    const p = project({ sources: { github: { repos: ["acme/app"] } } });
    const report = await syncProject(p, "both", {
      env: { GITHUB_TOKEN: "ghp_test" },
      fetchImpl: fakeFetch(),
      newId,
    });
    expect(report.added).toBeGreaterThan(0);
    expect(report.errors).toEqual(["Trello: connect a board first."]);
  });

  it("never calls the network in DEMO_MODE", async () => {
    const calls: string[] = [];
    const p = project();
    const report = await syncProject(p, "both", { env: { ...LIVE_ENV, DEMO_MODE: "true" }, fetchImpl: fakeFetch(calls), newId });
    expect(report.mode).toBe("demo");
    expect(calls).toEqual([]);
    const again = await syncProject(p, "both", { env: { DEMO_MODE: "true" }, newId });
    expect(again.added).toBe(0);
  });

  it("re-attributes earlier items once a handle is mapped", async () => {
    const p = project();
    await syncProject(p, "github", { env: LIVE_ENV, fetchImpl: fakeFetch(), newId });
    p.members = p.members.map((m) => (m.id === "m_leo" ? { ...m, githubLogin: "Leo" } : m));
    p.contributions = reattribute(p.contributions, p.members);
    expect(p.contributions.find((c) => c.sourceId === "bbb1")).toMatchObject({ memberId: "m_leo", person: "Leo" });
    expect(unmatchedAuthors(p.contributions, p.members).map((u) => u.id)).toEqual(["newdev", "maya"]);
  });
});

describe("synced activity through the scoring pipeline", () => {
  beforeAll(() => {
    process.env.DEMO_MODE = "true";
  });

  it("folds commits into PRs, treats reviews as review work and still sums to the total", async () => {
    const p = project();
    p.members = p.members.map((m) =>
      m.id === "m_leo" ? { ...m, githubLogin: "leo", trelloMemberId: "tm_leo" } : m.id === "m_maya" ? { ...m, githubLogin: "maya" } : m
    );
    await syncProject(p, "both", { env: LIVE_ENV, fetchImpl: fakeFetch(), newId });

    const normalized = normalizeContributions(p.contributions, p.members);
    const pr = normalized.contributions.find((c) => c.sourceId === "acme/app#12")!;
    expect(pr.sourceContributionIds).toHaveLength(3); // PR + 2 own commits (merge dropped)
    // One merge commit from the PR's own history, plus "merge1" from the direct-commit fixture.
    expect(normalized.dropped.map((d) => d.reason)).toEqual(["merge_commit", "merge_commit"]);
    expect(normalized.contributions.find((c) => c.type === "review")?.categoryHint).toBe("review");
    // "direct1" is also unassigned here: this test's project doesn't map "newdev" to anyone.
    expect(normalized.unassigned.map((c) => c.sourceId)).toEqual(["card:c3", "direct1"]);

    const split = await scoreProjectExplainable(p);
    for (const mode of ["equal", "merit", "hybrid", "hours"] as const) {
      expect(split.people.reduce((s, x) => s + x.amountsByMode[mode], 0)).toBe(100_000);
    }
  });
});
