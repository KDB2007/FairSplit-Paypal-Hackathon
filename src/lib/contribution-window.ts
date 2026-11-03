import type { Contribution, Project } from "./types";

const GITHUB_TYPES = new Set<Contribution["type"]>(["pr", "commit", "review"]);

/**
 * Contributions that belong to the project's configured source window.
 *
 * `sources.github.since` is sent to the GitHub API on sync, but items synced
 * before the date was moved stay in the project. Scoring filters them here so
 * the model only sees work after the chosen date. Manual work is always kept,
 * and Trello has no date setting.
 */
export function contributionsInWindow(project: Project): Contribution[] {
  const since = project.sources?.github?.since;
  if (!since) return project.contributions;
  const cutoff = Date.parse(since);
  if (Number.isNaN(cutoff)) return project.contributions;

  return project.contributions.filter((contribution) => {
    if (!GITHUB_TYPES.has(contribution.type)) return true;
    const at = Date.parse(contribution.timestamp);
    // An item with no usable timestamp can't be proven outside the window.
    return Number.isNaN(at) || at >= cutoff;
  });
}

/** Stored items the GitHub date window excludes from scoring. */
export function excludedByWindow(project: Project): number {
  return project.contributions.length - contributionsInWindow(project).length;
}
