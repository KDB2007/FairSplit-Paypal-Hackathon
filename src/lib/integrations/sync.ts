import type { Contribution, Project, SyncReport } from "../types";
import { fetchDirectCommits, fetchMergedPullRequests, mapDirectCommits, mapGithubPullRequests } from "./github";
import { fetchTrelloBoard, mapTrelloCards } from "./trello";
import { mockActivity } from "./mock";
import { memberForAuthor, resolveTrelloUsernames, unmatchedAuthors } from "./identity";
import { IntegrationError, type FetchLike } from "./http";
import type { SyncedItem } from "./types";

/**
 * Pull activity from GitHub / Trello into a project.
 *
 * - DEMO_MODE=true always uses stable mock activity (safe for a live demo).
 * - GitHub needs no token for a public repo (60 req/hr, unauthenticated);
 *   GITHUB_TOKEN raises that to 5,000/hr and is required for a private repo.
 * - Trello always needs TRELLO_KEY + TRELLO_TOKEN in the server env.
 * - A problem with one connected source is reported without failing the other.
 * - Items are upserted by (type, sourceId), so re-syncing never duplicates.
 *   Manual work is never touched.
 */

export type SyncSource = "github" | "trello" | "both";

export interface SyncEnv {
  [key: string]: string | undefined;
  DEMO_MODE?: string;
  GITHUB_TOKEN?: string;
  TRELLO_KEY?: string;
  TRELLO_TOKEN?: string;
}

export interface SyncDeps {
  env?: SyncEnv;
  fetchImpl?: FetchLike;
  newId: (prefix: string) => string;
  now?: () => string;
}

export function integrationStatus(env: SyncEnv = process.env) {
  return {
    demoMode: env.DEMO_MODE === "true",
    // GitHub works without a token (public repos, lower rate limit); this just
    // reports whether one is configured, for the UI to show rate-limit headroom.
    githubToken: Boolean(env.GITHUB_TOKEN),
    trello: Boolean(env.TRELLO_KEY && env.TRELLO_TOKEN),
  };
}

async function liveItems(
  project: Project,
  source: "github" | "trello",
  env: SyncEnv,
  fetchImpl?: FetchLike
): Promise<SyncedItem[]> {
  if (source === "github") {
    const config = project.sources?.github;
    if (!config?.repos.length) throw new IntegrationError("GitHub: connect a repository first.");
    const perRepo = await Promise.all(
      config.repos.map(async (repo) => {
        const prs = await fetchMergedPullRequests(repo, { token: env.GITHUB_TOKEN, since: config.since, fetchImpl });
        const prItems = mapGithubPullRequests(prs, repo);

        // Pick up commits pushed straight to the default branch, without a PR.
        // Anything already surfaced via a PR (an exact sha, or — for a squash
        // merge — a matching "(#N)" commit message) is excluded so it isn't
        // double-counted.
        const knownShas = new Set(prs.flatMap((pr) => pr.commits.nodes.map((node) => node.commit.oid)));
        const mergedPrNumbers = new Set(prs.map((pr) => pr.number));
        const commits = await fetchDirectCommits(repo, { token: env.GITHUB_TOKEN, since: config.since, fetchImpl });
        const commitItems = mapDirectCommits(commits, { shas: knownShas, mergedPrNumbers });

        return [...prItems, ...commitItems];
      })
    );
    return perRepo.flat();
  }

  const config = project.sources?.trello;
  if (!config?.boardId) throw new IntegrationError("Trello: connect a board first.");
  if (!env.TRELLO_KEY || !env.TRELLO_TOKEN) {
    throw new IntegrationError("Trello: TRELLO_KEY and TRELLO_TOKEN are not set on the server.");
  }
  const board = await fetchTrelloBoard(config.boardId, {
    key: env.TRELLO_KEY,
    token: env.TRELLO_TOKEN,
    fetchImpl,
  });
  // A member may only know their Trello username, not Trello's internal id.
  // Resolve it against the board's own member list before attributing anything.
  project.members = resolveTrelloUsernames(project.members, board.members);
  return mapTrelloCards(board, config.doneListPattern);
}

function attribute(project: Project, item: SyncedItem): Omit<Contribution, "id"> {
  const member = memberForAuthor(project.members, item.externalAuthor);
  return {
    ...item,
    projectId: project.id,
    memberId: member?.id,
    person: member?.name ?? item.externalAuthor?.label ?? "Unassigned",
  };
}

const keyOf = (c: Pick<Contribution, "type" | "sourceId">) => `${c.type}:${c.sourceId}`;

/** Upsert items into the project in place. Returns how many were added / updated. */
export function upsertContributions(
  project: Project,
  incoming: Array<Omit<Contribution, "id">>,
  newId: (prefix: string) => string
): { added: number; updated: number } {
  const index = new Map<string, number>();
  project.contributions.forEach((c, i) => {
    if (c.type !== "manual") index.set(keyOf(c), i);
  });

  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const at = index.get(keyOf(item));
    if (at === undefined) {
      project.contributions.push({ ...item, id: newId("con") });
      index.set(keyOf(item), project.contributions.length - 1);
      added += 1;
    } else {
      project.contributions[at] = { ...item, id: project.contributions[at].id };
      updated += 1;
    }
  }
  return { added, updated };
}

/** Sync a project in place and record the report on it. The caller saves. */
export async function syncProject(
  project: Project,
  source: SyncSource,
  deps: SyncDeps
): Promise<SyncReport> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date().toISOString());
  const sources: Array<"github" | "trello"> = source === "both" ? ["github", "trello"] : [source];
  const demo = env.DEMO_MODE === "true";
  const errors: string[] = [];
  const incoming: Array<Omit<Contribution, "id">> = [];

  if (demo) {
    for (const s of sources) incoming.push(...mockActivity(project, s, now()));
  } else {
    const results = await Promise.allSettled(sources.map((s) => liveItems(project, s, env, deps.fetchImpl)));
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        incoming.push(...result.value.map((item) => attribute(project, item)));
      } else {
        const error = result.reason;
        errors.push(
          error instanceof IntegrationError
            ? error.message
            : `${sources[i] === "github" ? "GitHub" : "Trello"}: sync failed.`
        );
        if (!(error instanceof IntegrationError)) console.error("Sync failed", sources[i], error);
      }
    });
  }

  const { added, updated } = upsertContributions(project, incoming, deps.newId);
  const report: SyncReport = {
    mode: demo ? "demo" : "live",
    added,
    updated,
    unmatched: unmatchedAuthors(project.contributions, project.members),
    errors,
  };
  project.lastSync = { at: now(), report };
  return report;
}
