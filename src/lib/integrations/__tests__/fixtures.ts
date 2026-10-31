import type { GithubPullRequest } from "../github";
import type { TrelloBoard } from "../trello";

const commit = (oid: string, login: string | null, opts: { parents?: number; lines?: number; title?: string } = {}) => ({
  commit: {
    oid,
    messageHeadline: opts.title ?? `Commit ${oid}`,
    additions: opts.lines ?? 40,
    deletions: 0,
    committedDate: "2026-10-02T10:00:00Z",
    url: `https://github.com/acme/app/commit/${oid}`,
    parents: { totalCount: opts.parents ?? 1 },
    author: { user: login ? { login } : null },
  },
});

/** The shape `mapGithubPullRequests` consumes — used directly by the pure-mapper tests. */
export const PULL_REQUESTS: GithubPullRequest[] = [
  {
    number: 12,
    title: "Add payout retries",
    url: "https://github.com/acme/app/pull/12",
    mergedAt: "2026-10-03T12:00:00Z",
    updatedAt: "2026-10-03T12:00:00Z",
    additions: 120,
    deletions: 30,
    author: { login: "Priya-Dev" },
    commits: {
      nodes: [
        commit("aaa1", "Priya-Dev"),
        commit("aaa2", null), // unlinked email → PR author
        commit("aaa3", "Priya-Dev", { parents: 2, title: "Merge branch 'main' into retries" }),
        commit("bbb1", "leo"), // co-author keeps their own credit
        commit("bot1", "dependabot[bot]"),
      ],
    },
    reviews: {
      nodes: [
        { author: { login: "maya" }, state: "COMMENTED", submittedAt: "2026-10-02T09:00:00Z", url: "r1" },
        { author: { login: "maya" }, state: "APPROVED", submittedAt: "2026-10-03T09:00:00Z", url: "r2" },
        { author: { login: "Priya-Dev" }, state: "COMMENTED", submittedAt: "2026-10-03T10:00:00Z", url: "r3" },
        { author: { login: "copilot", type: "Bot" }, state: "COMMENTED", submittedAt: "2026-10-03T10:00:00Z", url: "r4" },
        { author: { login: "leo" }, state: "DISMISSED", submittedAt: "2026-10-03T10:00:00Z", url: "r5" },
      ],
    },
  },
  {
    number: 13,
    title: "Bump deps",
    url: "https://github.com/acme/app/pull/13",
    mergedAt: "2026-10-04T12:00:00Z",
    updatedAt: "2026-10-04T12:00:00Z",
    additions: 5,
    deletions: 5,
    author: { login: "dependabot", type: "Bot" },
    commits: { nodes: [] },
    reviews: { nodes: [] },
  },
];

export const BOARD: TrelloBoard = {
  lists: [
    { id: "l_todo", name: "To do" },
    { id: "l_done", name: "Done ✅" },
  ],
  members: [
    { id: "tm_maya", username: "maya_t", fullName: "Maya" },
    { id: "tm_leo", username: "leo_t", fullName: "Leo" },
  ],
  cards: [
    { id: "c1", name: "Client kickoff call", idList: "l_done", idMembers: ["tm_maya", "tm_leo"], dateLastActivity: "2026-10-01T10:00:00Z", shortUrl: "https://trello.com/c/c1" },
    { id: "c2", name: "Write spec", idList: "l_todo", idMembers: ["tm_maya"], dateLastActivity: "2026-10-01T10:00:00Z", shortUrl: "https://trello.com/c/c2" },
    { id: "c3", name: "Set up invoicing", idList: "l_done", idMembers: [], dateLastActivity: "2026-10-01T11:00:00Z", shortUrl: "https://trello.com/c/c3" },
  ],
};

/**
 * Raw REST responses for "acme/app", shaped exactly like GitHub's actual
 * endpoints — the list endpoint omits additions/deletions and commits/reviews
 * are fetched per PR, mirroring what `fetchMergedPullRequests` really does.
 */
const REST_PULLS: Record<number, unknown> = {
  12: {
    number: 12,
    title: "Add payout retries",
    html_url: "https://github.com/acme/app/pull/12",
    merged_at: "2026-10-03T12:00:00Z",
    updated_at: "2026-10-03T12:00:00Z",
    user: { login: "Priya-Dev", type: "User" },
    additions: 120,
    deletions: 30,
  },
  13: {
    number: 13,
    title: "Bump deps",
    html_url: "https://github.com/acme/app/pull/13",
    merged_at: "2026-10-04T12:00:00Z",
    updated_at: "2026-10-04T12:00:00Z",
    user: { login: "dependabot", type: "Bot" },
    additions: 5,
    deletions: 5,
  },
};

const restCommit = (sha: string, login: string | null, parents: number) => ({
  sha,
  html_url: `https://github.com/acme/app/commit/${sha}`,
  commit: { message: `Commit ${sha}`, author: { date: "2026-10-02T10:00:00Z" } },
  author: login ? { login, type: login.endsWith("[bot]") ? "Bot" : "User" } : null,
  parents: Array.from({ length: parents }, (_, i) => ({ sha: `${sha}-parent-${i}` })),
});

const REST_COMMITS: Record<number, unknown[]> = {
  12: [
    restCommit("aaa1", "Priya-Dev", 1),
    restCommit("aaa2", null, 1),
    restCommit("aaa3", "Priya-Dev", 2),
    restCommit("bbb1", "leo", 1),
    restCommit("bot1", "dependabot[bot]", 1),
  ],
};

const reviewUrl = (id: number) => `https://github.com/acme/app/pull/12#pullrequestreview-${id}`;

const REST_REVIEWS: Record<number, unknown[]> = {
  12: [
    { id: 1, user: { login: "maya", type: "User" }, state: "COMMENTED", submitted_at: "2026-10-02T09:00:00Z", html_url: reviewUrl(1) },
    { id: 2, user: { login: "maya", type: "User" }, state: "APPROVED", submitted_at: "2026-10-03T09:00:00Z", html_url: reviewUrl(2) },
    { id: 3, user: { login: "Priya-Dev", type: "User" }, state: "COMMENTED", submitted_at: "2026-10-03T10:00:00Z", html_url: reviewUrl(3) },
    { id: 4, user: { login: "copilot", type: "Bot" }, state: "COMMENTED", submitted_at: "2026-10-03T10:00:00Z", html_url: reviewUrl(4) },
    { id: 5, user: { login: "leo", type: "User" }, state: "DISMISSED", submitted_at: "2026-10-03T10:00:00Z", html_url: reviewUrl(5) },
  ],
};

/**
 * Direct-branch commit history for "acme/app" — used to test the
 * no-PR-needed commit path. Includes: a commit already counted via PR #12
 * (same sha, should be excluded), a squash-merge commit referencing merged
 * PR #13 (should be excluded by message), a genuine direct commit by a
 * linked user, one by an unlinked email (no GitHub account — can't be
 * attributed), one by a bot, and a real merge commit by a linked user.
 */
export const REST_DIRECT_COMMITS: unknown[] = [
  { sha: "aaa1", html_url: "https://github.com/acme/app/commit/aaa1", commit: { message: "Fix typo", author: { date: "2026-10-05T10:00:00Z" } }, author: { login: "Priya-Dev", type: "User" }, parents: [{ sha: "p0" }] },
  { sha: "squash1", html_url: "https://github.com/acme/app/commit/squash1", commit: { message: "Bump deps (#13)", author: { date: "2026-10-04T12:00:00Z" } }, author: { login: "dependabot", type: "Bot" }, parents: [{ sha: "p1" }] },
  { sha: "direct1", html_url: "https://github.com/acme/app/commit/direct1", commit: { message: "Fix the dashboard spinner", author: { date: "2026-10-06T09:00:00Z" } }, author: { login: "newdev", type: "User" }, parents: [{ sha: "p2" }] },
  { sha: "unlinked1", html_url: "https://github.com/acme/app/commit/unlinked1", commit: { message: "Quick fix", author: { date: "2026-10-06T09:30:00Z" } }, author: null, parents: [{ sha: "p3" }] },
  { sha: "bot1direct", html_url: "https://github.com/acme/app/commit/bot1direct", commit: { message: "chore: bump lockfile", author: { date: "2026-10-06T10:00:00Z" } }, author: { login: "renovate[bot]", type: "Bot" }, parents: [{ sha: "p4" }] },
  { sha: "merge1", html_url: "https://github.com/acme/app/commit/merge1", commit: { message: "Merge branch 'feature/x'", author: { date: "2026-10-06T11:00:00Z" } }, author: { login: "newdev", type: "User" }, parents: [{ sha: "p5" }, { sha: "p6" }] },
];

/** Serves the REST fixtures as if they came from GitHub / Trello. */
export function fakeFetch(calls: string[] = []) {
  return async (url: string): Promise<Response> => {
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    // Direct-branch commit history (not nested under /pulls/).
    if (/\/repos\/acme\/app\/commits\?/.test(url)) return json(REST_DIRECT_COMMITS);

    const commitsMatch = url.match(/\/pulls\/(\d+)\/commits/);
    if (commitsMatch) return json(REST_COMMITS[Number(commitsMatch[1])] ?? []);

    const reviewsMatch = url.match(/\/pulls\/(\d+)\/reviews/);
    if (reviewsMatch) return json(REST_REVIEWS[Number(reviewsMatch[1])] ?? []);

    const detailMatch = url.match(/\/pulls\/(\d+)(?:\?|$)/);
    if (detailMatch) {
      const pr = REST_PULLS[Number(detailMatch[1])];
      return pr ? json(pr) : json({ message: "Not Found" }, 404);
    }

    if (url.includes("/pulls?")) {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return json(page === 1 ? Object.values(REST_PULLS) : []);
    }

    if (url.includes("/lists?")) return json(BOARD.lists);
    if (url.includes("/members?")) return json(BOARD.members);
    if (url.includes("/cards?")) return json(BOARD.cards);
    return new Response("not found", { status: 404 });
  };
}
