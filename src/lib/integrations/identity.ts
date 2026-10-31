import type { Contribution, ExternalAuthor, IntegrationSource, Member } from "../types";

/**
 * Mapping external handles (GitHub login, Trello username/member id) to
 * members. Pure and client-safe.
 */

export const GITHUB_LOGIN_PATTERN = /^[a-zA-Z0-9-]{1,39}$/;
export const TRELLO_USERNAME_PATTERN = /^[a-zA-Z0-9_]{1,32}$/;
export const TRELLO_MEMBER_ID_PATTERN = /^[a-zA-Z0-9]{1,32}$/;

export function memberForAuthor(
  members: Member[],
  author: Pick<ExternalAuthor, "source" | "id"> | undefined
): Member | undefined {
  if (!author) return undefined;
  const id = author.id.toLowerCase();
  return members.find((m) =>
    author.source === "github"
      ? m.githubLogin?.toLowerCase() === id
      : m.trelloMemberId?.toLowerCase() === id
  );
}

/** Synced handles with no mapped member, most items first. */
export function unmatchedAuthors(
  contributions: Contribution[],
  members: Member[]
): Array<ExternalAuthor & { count: number }> {
  const counts = new Map<string, ExternalAuthor & { count: number }>();
  for (const c of contributions) {
    if (!c.externalAuthor || memberForAuthor(members, c.externalAuthor)) continue;
    const key = `${c.externalAuthor.source}:${c.externalAuthor.id.toLowerCase()}`;
    const entry = counts.get(key) ?? { ...c.externalAuthor, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Re-attribute every synced item according to the current member mappings. */
export function reattribute(contributions: Contribution[], members: Member[]): Contribution[] {
  return contributions.map((c) => {
    if (!c.externalAuthor) return c;
    const member = memberForAuthor(members, c.externalAuthor);
    return member
      ? { ...c, memberId: member.id, person: member.name }
      : { ...c, memberId: undefined, person: c.externalAuthor.label };
  });
}

export function handleFor(member: Member, source: IntegrationSource): string | undefined {
  return source === "github" ? member.githubLogin : member.trelloMemberId;
}

/**
 * A member only knows their Trello *username*, not Trello's internal member
 * id — but card membership is keyed by that id. Resolve any self-reported
 * `trelloUsername` against the board's member list (already fetched for the
 * sync) and fill in `trelloMemberId`, so `memberForAuthor` can match going
 * forward. A member who already has an id, or no username, passes through
 * unchanged. Pure — returns a new array.
 */
export function resolveTrelloUsernames(
  members: Member[],
  boardMembers: Array<{ id: string; username: string }>
): Member[] {
  const byUsername = new Map(boardMembers.map((m) => [m.username.toLowerCase(), m.id]));
  return members.map((m) => {
    if (m.trelloMemberId || !m.trelloUsername) return m;
    const id = byUsername.get(m.trelloUsername.toLowerCase());
    return id ? { ...m, trelloMemberId: id } : m;
  });
}

/**
 * Self-reported handles must be unique within a project — otherwise two
 * different members could silently collide onto the same synced identity.
 * Checked case-insensitively, independently per source.
 */
export function duplicateHandleErrors(
  members: Array<{ name: string; githubLogin?: string; trelloUsername?: string }>
): string[] {
  const errors: string[] = [];
  const seen: Record<"github" | "trello", Map<string, string>> = {
    github: new Map(),
    trello: new Map(),
  };
  const check = (source: "github" | "trello", value: string | undefined, name: string, label: string) => {
    if (!value) return;
    const key = value.toLowerCase();
    const prior = seen[source].get(key);
    if (prior) errors.push(`${label} "${value}" is given for both ${prior} and ${name}.`);
    else seen[source].set(key, name);
  };
  for (const m of members) {
    check("github", m.githubLogin, m.name, "GitHub username");
    check("trello", m.trelloUsername, m.name, "Trello username");
  }
  return errors;
}
