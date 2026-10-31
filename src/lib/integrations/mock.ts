import type { Contribution, Project } from "../types";

/**
 * Demo-mode activity. Source ids are stable, so syncing twice updates the same
 * items instead of piling up duplicates.
 */

const GITHUB_MOCK_TITLES = [
  "Add loading states to dashboard",
  "Refactor invoice calculations",
  "Wire up receipt PDF export",
  "Improve error handling on payout API",
];

const TRELLO_MOCK_TITLES = [
  "Moved 'QA checklist' to Done",
  "Moved 'Copywriting pass' to Done",
  "Moved 'Accessibility audit' to Done",
];

export function mockActivity(
  project: Project,
  source: "github" | "trello",
  now = new Date().toISOString()
): Array<Omit<Contribution, "id">> {
  const people = project.members;
  if (people.length === 0) return [];

  if (source === "github") {
    return GITHUB_MOCK_TITLES.map((title, i) => {
      const member = people[i % people.length];
      const isPr = i % 2 === 1;
      const sourceId = isPr ? `#${50 + i}` : `mocksha${i}`;
      return {
        projectId: project.id,
        person: member.name,
        memberId: member.id,
        type: isPr ? "pr" : "commit",
        sourceId,
        title,
        timestamp: now,
        evidenceUrl: isPr
          ? `https://github.com/fairsplit/demo/pull/${50 + i}`
          : `https://github.com/fairsplit/demo/commit/${sourceId}`,
      };
    });
  }

  return TRELLO_MOCK_TITLES.map((title, i) => {
    const member = people[(i + 1) % people.length];
    return {
      projectId: project.id,
      person: member.name,
      memberId: member.id,
      type: "trello",
      sourceId: `mockcard${i}`,
      title,
      timestamp: now,
      evidenceUrl: `https://trello.com/c/mockcard${i}`,
    };
  });
}
