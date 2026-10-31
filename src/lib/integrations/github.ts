import type { SyncedItem } from "./types";
import { IntegrationError, fetchJson, type FetchLike } from "./http";

/**
 * GitHub: merged PRs, the commits that shipped them, and reviews by other
 * people (quiet work). Uses the REST API so a public repo works with no
 * token at all (60 req/hr, unauthenticated) — a token raises that to
 * 5,000/hr and is required for a private repo. The mapper is pure so it can
 * be tested against fixtures.
 */

export const GITHUB_API = "https://api.github.com";
export const MAX_PRS_PER_REPO = 30;
export const MAX_COMMITS_PER_REPO = 100;
const PAGE_SIZE = 25;

export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

interface GithubActor {
  login: string;
  type?: string; // "Bot" for a bot account
}

export interface GithubPullRequest {
  number: number;
  title: string;
  url: string;
  mergedAt: string | null;
  updatedAt: string;
  additions: number;
  deletions: number;
  author: GithubActor | null;
  commits: {
    nodes: Array<{
      commit: {
        oid: string;
        messageHeadline: string;
        additions: number;
        deletions: number;
        committedDate: string;
        url: string;
        parents: { totalCount: number };
        author: { user: GithubActor | null } | null;
      };
    }>;
  };
  reviews: {
    nodes: Array<{
      author: GithubActor | null;
      state: string;
      submittedAt: string | null;
      url: string;
    }>;
  };
}

const COUNTED_REVIEWS = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

function isBot(actor: GithubActor | null | undefined): boolean {
  if (!actor?.login) return true;
  return actor.type === "Bot" || /\[bot\]$/i.test(actor.login);
}

function author(login: string) {
  return { source: "github" as const, id: login.toLowerCase(), label: login };
}

/** Map merged PRs to contribution items. Pure — same shape regardless of transport. */
export function mapGithubPullRequests(prs: GithubPullRequest[], repo: string): SyncedItem[] {
  const items: SyncedItem[] = [];

  for (const pr of prs) {
    if (!pr.mergedAt || isBot(pr.author)) continue;
    const prAuthor = pr.author!.login;
    const prSourceId = `${repo}#${pr.number}`;

    items.push({
      type: "pr",
      sourceId: prSourceId,
      title: pr.title,
      timestamp: pr.mergedAt,
      evidenceUrl: pr.url,
      linesChanged: Math.max(0, pr.additions + pr.deletions),
      externalAuthor: author(prAuthor),
    });

    for (const { commit } of pr.commits.nodes) {
      const user = commit.author?.user ?? null;
      if (user && isBot(user)) continue;
      // An unlinked commit email has no user; it was pushed to this PR, so it belongs to the PR author.
      const login = user?.login ?? prAuthor;
      const sameAuthor = login.toLowerCase() === prAuthor.toLowerCase();
      items.push({
        type: "commit",
        sourceId: commit.oid,
        title: commit.messageHeadline,
        timestamp: commit.committedDate,
        evidenceUrl: commit.url,
        linesChanged: Math.max(0, commit.additions + commit.deletions),
        isMerge: commit.parents.totalCount > 1,
        // Fold into the PR only when the PR author wrote it; co-authors keep their own credit.
        prRef: sameAuthor ? prSourceId : undefined,
        externalAuthor: author(login),
      });
    }

    // One review item per reviewer per PR, using their latest counted review.
    const latest = new Map<string, GithubPullRequest["reviews"]["nodes"][number]>();
    for (const review of pr.reviews.nodes) {
      if (isBot(review.author) || !COUNTED_REVIEWS.has(review.state)) continue;
      const login = review.author!.login;
      if (login.toLowerCase() === prAuthor.toLowerCase()) continue;
      const key = login.toLowerCase();
      const prior = latest.get(key);
      if (!prior || (review.submittedAt ?? "") > (prior.submittedAt ?? "")) latest.set(key, review);
    }
    for (const review of latest.values()) {
      const login = review.author!.login;
      items.push({
        type: "review",
        sourceId: `${prSourceId}:review:${login.toLowerCase()}`,
        title: `Reviewed: ${pr.title}`,
        timestamp: review.submittedAt ?? pr.mergedAt,
        evidenceUrl: review.url,
        externalAuthor: author(login),
      });
    }
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* REST fetch                                                                  */
/* -------------------------------------------------------------------------- */

interface RestUser {
  login: string;
  type: string; // "User" | "Bot" | "Organization"
}

interface RestPullListItem {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  user: RestUser | null;
}

interface RestPullDetail extends RestPullListItem {
  additions: number;
  deletions: number;
}

interface RestCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
  author: RestUser | null; // the linked GitHub account; null if the commit email isn't linked
  parents: Array<{ sha: string }>;
  // No `stats` here: the PR-commits-list endpoint doesn't return per-commit
  // additions/deletions (only a single-commit lookup does, and that's not
  // worth the extra rate-limited call). The PR's own additions/deletions
  // already capture the full diff size.
}

interface RestReview {
  id: number;
  user: RestUser | null;
  state: string;
  submitted_at: string | null;
  html_url: string; // GitHub's own deep link to this specific review
}

function headers(token?: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "FairSplit",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toActor(user: RestUser | null): GithubActor | null {
  return user ? { login: user.login, type: user.type } : null;
}

function notFoundMessage(repo: string, token: string | undefined): string {
  return token
    ? `GitHub: repository ${repo} not found (check the name and that the token can read it).`
    : `GitHub: repository ${repo} not found. If it's private, add GITHUB_TOKEN with access to it.`;
}

/** Fetch merged PRs for one repo, newest first, stopping at `since`. */
export async function fetchMergedPullRequests(
  repo: string,
  options: { token?: string; since?: string; limit?: number; fetchImpl?: FetchLike }
): Promise<GithubPullRequest[]> {
  if (!REPO_PATTERN.test(repo)) throw new IntegrationError(`Invalid repository "${repo}".`);
  const limit = options.limit ?? MAX_PRS_PER_REPO;
  const base = `${GITHUB_API}/repos/${repo}`;
  const init = { headers: headers(options.token) };

  const merged: RestPullListItem[] = [];
  let page = 1;
  while (merged.length < limit) {
    const batch = await fetchJson<RestPullListItem[]>(
      "GitHub",
      `${base}/pulls?state=closed&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      init,
      options.fetchImpl
    ).catch((err) => {
      throw err instanceof IntegrationError && err.status === 404
        ? new IntegrationError(notFoundMessage(repo, options.token))
        : err;
    });
    if (batch.length === 0) break;

    let reachedSince = false;
    for (const pr of batch) {
      // Ordered by updatedAt desc and a merged PR's updatedAt ≥ mergedAt, so once
      // updatedAt is before `since`, every later PR is too.
      if (options.since && pr.updated_at < options.since) {
        reachedSince = true;
        break;
      }
      if (!pr.merged_at) continue; // closed without merging
      if (options.since && pr.merged_at < options.since) continue;
      merged.push(pr);
      if (merged.length >= limit) break;
    }
    if (reachedSince || batch.length < PAGE_SIZE) break;
    page += 1;
  }

  // Each PR needs its own detail call for additions/deletions (the list endpoint omits them),
  // plus its commits and reviews. A bot PR is skipped before spending calls on it.
  const prs = await Promise.all(
    merged
      .filter((pr) => !isBot(toActor(pr.user)))
      .map(async (pr): Promise<GithubPullRequest> => {
        const [detail, commits, reviews] = await Promise.all([
          fetchJson<RestPullDetail>("GitHub", `${base}/pulls/${pr.number}`, init, options.fetchImpl),
          fetchJson<RestCommit[]>(
            "GitHub",
            `${base}/pulls/${pr.number}/commits?per_page=100`,
            init,
            options.fetchImpl
          ),
          fetchJson<RestReview[]>(
            "GitHub",
            `${base}/pulls/${pr.number}/reviews?per_page=50`,
            init,
            options.fetchImpl
          ),
        ]);

        return {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          mergedAt: pr.merged_at,
          updatedAt: pr.updated_at,
          additions: detail.additions,
          deletions: detail.deletions,
          author: toActor(pr.user),
          commits: {
            nodes: commits.map((c) => ({
              commit: {
                oid: c.sha,
                messageHeadline: c.commit.message.split("\n")[0],
                additions: 0,
                deletions: 0,
                committedDate: c.commit.author?.date ?? pr.merged_at ?? pr.updated_at,
                url: c.html_url,
                parents: { totalCount: c.parents.length },
                author: { user: toActor(c.author) },
              },
            })),
          },
          reviews: {
            nodes: reviews.map((r) => ({
              author: toActor(r.user),
              state: r.state,
              submittedAt: r.submitted_at,
              // Use GitHub's own link; only reconstruct it if the API ever omits it.
              url: r.html_url || `${pr.html_url}#pullrequestreview-${r.id}`,
            })),
          },
        };
      })
  );

  return prs;
}

/* -------------------------------------------------------------------------- */
/* Direct commits (pushed without a PR)                                       */
/* -------------------------------------------------------------------------- */

interface RestCommitListItem {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
  author: RestUser | null; // the linked GitHub account; null if the commit email isn't linked
  parents: Array<{ sha: string }>;
}

// GitHub's default squash-merge message ends with "... (#123)" — lets a
// squashed commit be recognized as the same work already counted via its PR.
const SQUASH_PR_SUFFIX = /\(#(\d+)\)\s*$/;

/**
 * Commits on the repo's default branch, since `since` if given. These are
 * the commits a PR-only view misses entirely: anyone pushing straight to
 * main without ever opening a pull request.
 */
export async function fetchDirectCommits(
  repo: string,
  options: { token?: string; since?: string; limit?: number; fetchImpl?: FetchLike }
): Promise<RestCommitListItem[]> {
  if (!REPO_PATTERN.test(repo)) throw new IntegrationError(`Invalid repository "${repo}".`);
  const limit = options.limit ?? MAX_COMMITS_PER_REPO;
  const base = `${GITHUB_API}/repos/${repo}`;
  const init = { headers: headers(options.token) };

  const commits: RestCommitListItem[] = [];
  let page = 1;
  while (commits.length < limit) {
    const qs = new URLSearchParams({
      per_page: String(Math.min(100, limit - commits.length)),
      page: String(page),
    });
    if (options.since) qs.set("since", options.since);

    let batch: RestCommitListItem[];
    try {
      batch = await fetchJson<RestCommitListItem[]>(
        "GitHub",
        `${base}/commits?${qs}`,
        init,
        options.fetchImpl
      );
    } catch (err) {
      if (err instanceof IntegrationError && err.status === 409) return []; // empty repository
      if (err instanceof IntegrationError && err.status === 404) throw new IntegrationError(notFoundMessage(repo, options.token));
      throw err;
    }
    if (batch.length === 0) break;
    commits.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return commits.slice(0, limit);
}

/**
 * Map direct commits to contribution items, excluding anything already
 * counted through a PR: an exact sha match (a normal merge keeps the
 * original commits), or a squash-merge commit referencing an already-known
 * PR number. A commit with no linked GitHub account can't be attributed and
 * is skipped, same as a bot.
 */
export function mapDirectCommits(
  commits: RestCommitListItem[],
  exclude: { shas: Set<string>; mergedPrNumbers: Set<number> }
): SyncedItem[] {
  const items: SyncedItem[] = [];
  for (const commit of commits) {
    if (exclude.shas.has(commit.sha)) continue;
    const title = commit.commit.message.split("\n")[0];
    const squashMatch = title.match(SQUASH_PR_SUFFIX);
    if (squashMatch && exclude.mergedPrNumbers.has(Number(squashMatch[1]))) continue;

    const user = commit.author;
    if (!user || isBot(user)) continue;

    items.push({
      type: "commit",
      sourceId: commit.sha,
      title,
      timestamp: commit.commit.author?.date ?? new Date().toISOString(),
      evidenceUrl: commit.html_url,
      linesChanged: 0, // same REST limitation as PR commits: no per-commit stats on the list endpoint
      isMerge: commit.parents.length > 1,
      externalAuthor: author(user.login),
    });
  }
  return items;
}
