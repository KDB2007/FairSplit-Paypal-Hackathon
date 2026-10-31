import type {
  Contribution,
  Member,
  Payout,
  Project,
  ProjectSummary,
  SplitDecision,
  SplitPhilosophy,
  SplitProposal,
} from "./types";
import { amountFor, normalizePercentages, round2 } from "./split";

/**
 * In-memory store. A singleton Map lives on globalThis so it survives
 * hot reloads during development and route/page module duplication.
 */
declare global {
  // eslint-disable-next-line no-var
  var __fairsplitStore: Map<string, Project> | undefined;
}

const store: Map<string, Project> =
  globalThis.__fairsplitStore ?? new Map<string, Project>();
globalThis.__fairsplitStore = store;

export const DEMO_PROJECT_ID = "demo";

export function newId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

export function listProjects(): Project[] {
  return Array.from(store.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function getProject(id: string): Project | undefined {
  if (id === DEMO_PROJECT_ID && !store.has(id)) {
    return seedDemoProject();
  }
  return store.get(id);
}

export function saveProject(project: Project): Project {
  store.set(project.id, project);
  return project;
}

export function summarise(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    totalAmount: project.totalAmount,
    status: project.status,
    philosophy: project.philosophy,
    memberCount: project.members.length,
    createdAt: project.createdAt,
  };
}

export interface CreateProjectInput {
  name: string;
  totalAmount: number;
  philosophy: SplitPhilosophy;
  members: Array<{
    name: string;
    email: string;
    role?: "lead" | "member";
    confirmed?: boolean;
  }>;
}

export function createProject(input: CreateProjectInput): Project {
  const members: Member[] = input.members.map((m, index) => ({
    id: newId("mem"),
    name: m.name.trim(),
    email: m.email.trim(),
    role: m.role ?? (index === 0 ? "lead" : "member"),
    // Lead is confirmed by default so the demo can move forward.
    confirmed: m.confirmed ?? (index === 0 || m.role === "lead"),
  }));

  const allConfirmed = members.every((m) => m.confirmed);

  const project: Project = {
    id: newId("prj"),
    name: input.name.trim(),
    totalAmount: Number(input.totalAmount),
    philosophy: input.philosophy,
    status: allConfirmed ? "charter_confirmed" : "draft",
    members,
    contributions: [],
    proposals: [],
    decisions: [],
    payouts: [],
    createdAt: new Date().toISOString(),
  };

  return saveProject(project);
}

export function confirmCharter(projectId: string): Project | undefined {
  const project = store.get(projectId);
  if (!project) return undefined;
  project.members = project.members.map((m) => ({ ...m, confirmed: true }));
  project.status = project.status === "draft" ? "charter_confirmed" : project.status;
  return saveProject(project);
}

// Pure split maths live in ./split so they can safely be imported by client code.
export {
  amountFor,
  equalSplit,
  hoursSplit,
  normalizePercentages,
  round2,
} from "./split";

/* -------------------------------------------------------------------------- */
/* Demo seed                                                                  */
/* -------------------------------------------------------------------------- */

const DAY = 24 * 60 * 60 * 1000;

function ago(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

export function seedDemoProject(): Project {
  const id = DEMO_PROJECT_ID;

  const members: Member[] = [
    { id: newId("mem"), name: "Priya", email: "priya@example.com", role: "lead", confirmed: true },
    { id: newId("mem"), name: "Leo", email: "leo@example.com", role: "member", confirmed: true },
    { id: newId("mem"), name: "Maya", email: "maya@example.com", role: "member", confirmed: true },
  ];

  const c = (
    person: string,
    type: Contribution["type"],
    sourceId: string,
    title: string,
    days: number,
    hours?: number,
    evidenceUrl?: string
  ): Contribution => ({
    id: newId("con"),
    projectId: id,
    person,
    type,
    sourceId,
    title,
    hours,
    timestamp: ago(days),
    evidenceUrl,
  });

  const contributions: Contribution[] = [
    c("Priya", "commit", "a1b2c3d", "Set up repo, CI and app skeleton", 6, undefined, "https://github.com/fairsplit/demo/commit/a1b2c3d"),
    c("Priya", "pr", "#42", "PayPal payout integration", 5, undefined, "https://github.com/fairsplit/demo/pull/42"),
    c("Priya", "manual", "m-1", "Client call — scope + timeline", 5, 2, undefined),
    c("Leo", "commit", "d4e5f6a", "Auth flow and session handling", 5, undefined, "https://github.com/fairsplit/demo/commit/d4e5f6a"),
    c("Leo", "pr", "#43", "Fix race condition in checkout", 4, undefined, "https://github.com/fairsplit/demo/pull/43"),
    c("Leo", "manual", "m-2", "Unblocked Maya on API contract", 4, 3, undefined),
    c("Maya", "trello", "card-901", "Design system + component library", 4, undefined, "https://trello.com/c/design-system"),
    c("Maya", "commit", "b7c8d9e", "Landing page responsive polish", 3, undefined, "https://github.com/fairsplit/demo/commit/b7c8d9e"),
    c("Maya", "manual", "m-3", "Client comms + weekly status notes", 2, 4, undefined),
  ];

  const project: Project = {
    id,
    name: "Client Website",
    totalAmount: 3000,
    philosophy: "merit",
    status: "charter_confirmed",
    members,
    contributions,
    proposals: [],
    decisions: [],
    payouts: [],
    createdAt: new Date().toISOString(),
  };

  return saveProject(project);
}

export function getOrCreateDemo(): Project {
  const existing = store.get(DEMO_PROJECT_ID);
  if (existing) return existing;
  return seedDemoProject();
}

/* -------------------------------------------------------------------------- */
/* Contribution sync (demo mocks)                                             */
/* -------------------------------------------------------------------------- */

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

export function syncContributions(
  projectId: string,
  source: "github" | "trello" | "both"
): Contribution[] {
  const project = store.get(projectId);
  if (!project) return [];

  const created: Contribution[] = [];
  const people = project.members.map((m) => m.name);

  if (source === "github" || source === "both") {
    GITHUB_MOCK_TITLES.forEach((title, i) => {
      const person = people[i % people.length];
      const isPr = i % 2 === 1;
      const sourceId = isPr ? `#${50 + i}` : newId("sha");
      created.push({
        id: newId("con"),
        projectId,
        person,
        type: isPr ? "pr" : "commit",
        sourceId,
        title,
        timestamp: new Date().toISOString(),
        evidenceUrl: isPr
          ? `https://github.com/fairsplit/demo/pull/${50 + i}`
          : `https://github.com/fairsplit/demo/commit/${sourceId}`,
      });
    });
  }

  if (source === "trello" || source === "both") {
    TRELLO_MOCK_TITLES.forEach((title, i) => {
      const person = people[(i + 1) % people.length];
      created.push({
        id: newId("con"),
        projectId,
        person,
        type: "trello",
        sourceId: newId("card"),
        title,
        timestamp: new Date().toISOString(),
        evidenceUrl: `https://trello.com/c/${newId("card")}`,
      });
    });
  }

  project.contributions.push(...created);
  saveProject(project);
  return created;
}

/* -------------------------------------------------------------------------- */
/* Payout helpers                                                             */
/* -------------------------------------------------------------------------- */

export interface PayoutResult {
  batchId: string;
  payouts: Payout[];
  simulated: boolean;
}

export function buildPayouts(
  project: Project,
  batchId: string,
  simulated: boolean
): Payout[] {
  const approved = project.decisions.filter((d) => d.status !== "disputed");
  return approved.map((d, index) => ({
    id: newId("pay"),
    projectId: project.id,
    person: d.person,
    amount: amountFor(d.finalPct, project.totalAmount),
    paypalBatchId: batchId,
    paypalTxnId: `TXN${(index + 1).toString().padStart(4, "0")}${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`,
    status: simulated ? ("completed" as const) : ("pending" as const),
    receiptUrl: `/receipt/${project.id}`,
  }));
}

export function applyDecisions(
  project: Project,
  decisions: Array<{ person: string; finalPct: number; overrideNote?: string; status?: string }>
): { project: Project; decisions: SplitDecision[] } {
  const existing = new Map(project.decisions.map((d) => [d.person, d]));
  const normalized = normalizePercentages(decisions.map((d) => d.finalPct));

  const next: SplitDecision[] = decisions.map((d, i) => {
    const prior = existing.get(d.person);
    const status =
      d.status === "disputed"
        ? "disputed"
        : d.status === "approved"
          ? "approved"
          : (prior?.status ?? "proposed");
    return {
      id: prior?.id ?? newId("dec"),
      projectId: project.id,
      person: d.person,
      finalPct: normalized[i],
      overrideNote: d.overrideNote ?? prior?.overrideNote,
      status: status as SplitDecision["status"],
    };
  });

  project.decisions = next;
  const allResolved = next.every(
    (d) => d.status === "approved" || d.status === "disputed"
  );
  if (allResolved) {
    project.status = "approved";
  } else if (project.status === "charter_confirmed") {
    project.status = "scored";
  }
  saveProject(project);
  return { project, decisions: next };
}

export function proposalsToDecisions(project: Project): SplitDecision[] {
  const pcts = normalizePercentages(project.proposals.map((p) => p.percentage));
  project.decisions = project.proposals.map((p, i) => ({
    id: newId("dec"),
    projectId: project.id,
    person: p.person,
    finalPct: pcts[i],
    status: "proposed",
  }));
  saveProject(project);
  return project.decisions;
}

export type { Project, SplitProposal, Contribution };
