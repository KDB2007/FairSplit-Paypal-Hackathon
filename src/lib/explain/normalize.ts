import type {
  Contribution,
  ContributionCategory,
  Member,
  NormalizedContribution,
} from "../types";

/**
 * Step 0 — merge GitHub / Trello / manual activity into one clean list with
 * stable ids (c_001…), fold commits into the PR that shipped them, drop work
 * that carries no signal, and park anything we can't attribute to a member in
 * the unassigned tray.
 *
 * Pure and deterministic: same project in, same output out.
 */

const TRIVIAL_TITLE =
  /(^|\b)(typo|whitespace|whitespace-only|format(ting)?|lint|linting|prettier|spacing|indent(ation)?|rename variable|code comment)(\b|$)/i;
const MERGE_TITLE = /^(merge|revert "merge) (pull request|branch|remote-tracking|branch ')/i;
const PR_PREFIX = /^(#|pr[-_ ]?)/i;

export type DropReason = "merge_commit" | "trivial_change";

export interface DroppedItem {
  contribution: Contribution;
  reason: DropReason;
}

export interface NormalizeResult {
  /** Every surviving item, assigned or not, in canonical order. */
  contributions: NormalizedContribution[];
  assigned: NormalizedContribution[];
  unassigned: NormalizedContribution[];
  dropped: DroppedItem[];
  /** member name (normalized) -> member id, for the unambiguous cases. */
  memberIndex: Map<string, string>;
}

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(PR_PREFIX, "")
    .replace(/\s+/g, " ");
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Best-effort category from the source system, used only to help the judge. */
export function categoryHint(item: {
  type: Contribution["type"];
  title: string;
}): ContributionCategory {
  const title = item.title.toLowerCase();
  if (/unblock|blocked|pair(ed)?|debug(ging)? (session|help)|help(ed)? .*(ship|fix)/.test(title)) {
    return "unblocking";
  }
  if (/review|feedback|pr comments?|code review|critique/.test(title)) return "review";
  if (/client|customer|stakeholder|status (note|update|call)|demo call|kickoff|scope/.test(title)) {
    return "client_comms";
  }
  if (/admin|invoice|billing|contract|onboard|tooling|setup|set up|expense|paperwork/.test(title)) {
    return "admin";
  }
  if (/plan|roadmap|estimate|sprint|prioriti|charter|timeline|spec/.test(title)) return "planning";
  if (/design|figma|component library|wireframe|mockup|brand|ux|ui kit/.test(title)) return "design";
  if (item.type === "trello") return "planning";
  return "code";
}

function isMergeCommit(contribution: Contribution): boolean {
  return contribution.isMerge === true || MERGE_TITLE.test(contribution.title);
}

function isTrivialChange(contribution: Contribution): boolean {
  if (contribution.trivial === true) return true;
  const lines = contribution.linesChanged;
  const tiny = typeof lines === "number" && lines <= 2;
  if (TRIVIAL_TITLE.test(contribution.title) && (tiny || lines === undefined)) {
    return true;
  }
  return false;
}

interface Group {
  base: Contribution;
  parts: Contribution[];
}

function composeItem(group: Group, memberId: string | null): NormalizedContribution {
  const all = [group.base, ...group.parts];
  const hours = all.reduce((sum, c) => sum + Math.max(0, Number(c.hours) || 0), 0);
  const linesChanged = all.reduce(
    (sum, c) => sum + Math.max(0, Number(c.linesChanged) || 0),
    0
  );
  const timestamps = all
    .map((c) => c.timestamp)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const evidenceUrl = group.base.evidenceUrl ?? all.find((c) => c.evidenceUrl)?.evidenceUrl;

  return {
    id: "",
    sourceContributionIds: all.map((c) => c.id),
    sourceId: group.base.sourceId,
    memberId,
    person: group.base.person,
    type: group.base.type,
    title: group.base.title,
    linesChanged,
    hours,
    timestamp: timestamps[0] ?? group.base.timestamp,
    evidenceUrl,
    categoryHint: categoryHint(group.base),
  };
}

export function normalizeContributions(
  input: Contribution[],
  members: Member[]
): NormalizeResult {
  const byName = new Map<string, string[]>();
  for (const member of members) {
    const key = normalizeName(member.name);
    byName.set(key, [...(byName.get(key) ?? []), member.id]);
  }
  const memberIndex = new Map<string, string>();
  for (const [key, ids] of byName) {
    if (ids.length === 1) memberIndex.set(key, ids[0]);
  }

  const resolveMemberId = (contribution: Contribution): string | null => {
    if (
      contribution.memberId &&
      members.some((member) => member.id === contribution.memberId)
    ) {
      return contribution.memberId;
    }
    const key = normalizeName(contribution.person ?? "");
    // Duplicate names are ambiguous: park the item rather than guess a share.
    return memberIndex.get(key) ?? null;
  };

  const dropped: DroppedItem[] = [];
  const kept: Contribution[] = [];
  for (const contribution of input) {
    if (isMergeCommit(contribution)) {
      dropped.push({ contribution, reason: "merge_commit" });
      continue;
    }
    if (isTrivialChange(contribution)) {
      dropped.push({ contribution, reason: "trivial_change" });
      continue;
    }
    kept.push(contribution);
  }

  // Fold commits into their PR when a link exists (prRef === PR sourceId).
  const prGroups = new Map<string, Group>();
  const committed = new Set<string>();
  for (const contribution of kept) {
    if (contribution.type !== "pr") continue;
    const key = normalizeKey(contribution.sourceId || contribution.id);
    const existing = prGroups.get(key);
    if (!existing) {
      prGroups.set(key, { base: contribution, parts: [] });
    } else {
      existing.parts.push(contribution);
      committed.add(contribution.id);
    }
  }
  for (const contribution of kept) {
    if (contribution.type === "pr" || !contribution.prRef) continue;
    const group = prGroups.get(normalizeKey(contribution.prRef));
    if (!group) continue;
    group.parts.push(contribution);
    committed.add(contribution.id);
  }

  const groups: Group[] = [];
  for (const contribution of kept) {
    if (committed.has(contribution.id)) continue;
    const key = normalizeKey(contribution.sourceId || contribution.id);
    if (contribution.type === "pr" && prGroups.has(key)) {
      groups.push(prGroups.get(key)!);
      continue;
    }
    groups.push({ base: contribution, parts: [] });
  }

  groups.sort((a, b) => {
    const byTime = a.base.timestamp.localeCompare(b.base.timestamp);
    if (byTime !== 0) return byTime;
    const bySource = normalizeKey(a.base.sourceId).localeCompare(normalizeKey(b.base.sourceId));
    if (bySource !== 0) return bySource;
    return a.base.id.localeCompare(b.base.id);
  });

  const contributions: NormalizedContribution[] = groups.map((group, index) => {
    const item = composeItem(group, resolveMemberId(group.base));
    item.id = `c_${String(index + 1).padStart(3, "0")}`;
    return item;
  });

  const assigned = contributions.filter((item) => item.memberId !== null);
  const unassigned = contributions.filter((item) => item.memberId === null);

  return { contributions, assigned, unassigned, dropped, memberIndex };
}
