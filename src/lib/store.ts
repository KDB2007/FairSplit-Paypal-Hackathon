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
    { id: "mem_priya", name: "Priya", email: "priya@example.com", role: "lead", confirmed: true },
    { id: "mem_leo", name: "Leo", email: "leo@example.com", role: "member", confirmed: true },
    { id: "mem_maya", name: "Maya", email: "maya@example.com", role: "member", confirmed: true },
  ];

  const memberIdFor = (person: string): string | undefined =>
    members.find((m) => m.name === person)?.id;

  interface SeedInput {
    id: string;
    person: string;
    type: Contribution["type"];
    sourceId: string;
    title: string;
    days: number;
    hours?: number;
    linesChanged?: number;
    evidenceUrl?: string;
    prRef?: string;
    isMerge?: boolean;
    trivial?: boolean;
  }

  const make = (input: SeedInput): Contribution => ({
    id: input.id,
    projectId: id,
    person: input.person,
    memberId: memberIdFor(input.person),
    type: input.type,
    sourceId: input.sourceId,
    title: input.title,
    hours: input.hours,
    linesChanged: input.linesChanged,
    timestamp: ago(input.days),
    evidenceUrl: input.evidenceUrl,
    prRef: input.prRef,
    isMerge: input.isMerge,
    trivial: input.trivial,
  });

  // 30 raw activities. Normalization folds commits into their PRs (two commits
  // into #42, one into #43) and drops two merges + one whitespace-level typo,
  // leaving 23 assigned items plus 2 unassigned ones for the tray.
  const contributions: Contribution[] = [
    /* ---- Priya — lead: architecture, client comms, planning, admin ---- */
    make({
      id: "con_p01",
      person: "Priya",
      type: "commit",
      sourceId: "p-01",
      title: "Set up repo, CI and deploy pipeline",
      days: 21,
      hours: 3,
      linesChanged: 420,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/p01",
    }),
    make({
      id: "con_p02",
      person: "Priya",
      type: "commit",
      sourceId: "p-02",
      title: "Draft project charter and milestone plan",
      days: 20,
      hours: 2,
      linesChanged: 60,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/p02",
    }),
    make({
      id: "con_p03",
      person: "Priya",
      type: "pr",
      sourceId: "#42",
      title: "PayPal payout integration",
      days: 17,
      hours: 6,
      linesChanged: 640,
      evidenceUrl: "https://github.com/fairsplit/demo/pull/42",
    }),
    make({
      id: "con_p04",
      person: "Priya",
      type: "commit",
      sourceId: "p-04",
      title: "Guard payout retries against duplicate capture",
      days: 17.5,
      linesChanged: 180,
      prRef: "#42",
      evidenceUrl: "https://github.com/fairsplit/demo/commit/p04",
    }),
    make({
      id: "con_p05",
      person: "Priya",
      type: "commit",
      sourceId: "p-05",
      title: "Merge pull request #42 from payouts",
      days: 17,
      isMerge: true,
    }),
    make({
      id: "con_p06",
      person: "Priya",
      type: "manual",
      sourceId: "m-01",
      title: "Client kickoff — scope, budget and success criteria",
      days: 20,
      hours: 2,
    }),
    make({
      id: "con_p07",
      person: "Priya",
      type: "trello",
      sourceId: "card-77",
      title: "Sprint planning and estimates for milestone 2",
      days: 13,
      hours: 1,
      evidenceUrl: "https://trello.com/c/card-77",
    }),
    make({
      id: "con_p08",
      person: "Priya",
      type: "manual",
      sourceId: "m-02",
      title: "Contractor onboarding and invoice setup",
      days: 12,
      hours: 1.5,
    }),
    make({
      id: "con_p09",
      person: "Priya",
      type: "commit",
      sourceId: "p-09",
      title: "Fix typo in README",
      days: 19,
      linesChanged: 1,
      trivial: true,
    }),

    /* ---- Leo — developer: high commit volume, mostly one category ---- */
    make({
      id: "con_l01",
      person: "Leo",
      type: "commit",
      sourceId: "l-01",
      title: "Auth flow and session handling",
      days: 19,
      hours: 3,
      linesChanged: 380,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l01",
    }),
    make({
      id: "con_l02",
      person: "Leo",
      type: "commit",
      sourceId: "l-02",
      title: "Checkout state machine",
      days: 16,
      hours: 4,
      linesChanged: 520,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l02",
    }),
    make({
      id: "con_l03",
      person: "Leo",
      type: "commit",
      sourceId: "l-03",
      title: "Fix null guard in cart totals",
      days: 15,
      hours: 0.5,
      linesChanged: 12,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l03",
    }),
    make({
      id: "con_l04",
      person: "Leo",
      type: "commit",
      sourceId: "l-04",
      title: "Correct invoice rounding on partial refunds",
      days: 14,
      hours: 1,
      linesChanged: 40,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l04",
    }),
    make({
      id: "con_l05",
      person: "Leo",
      type: "commit",
      sourceId: "l-05",
      title: "Add loading skeletons to dashboard",
      days: 13,
      hours: 1,
      linesChanged: 120,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l05",
    }),
    make({
      id: "con_l06",
      person: "Leo",
      type: "commit",
      sourceId: "l-06",
      title: "Wire receipt PDF export",
      days: 11,
      hours: 2,
      linesChanged: 180,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l06",
    }),
    make({
      id: "con_l07",
      person: "Leo",
      type: "commit",
      sourceId: "l-07",
      title: "Payout retry queue",
      days: 10,
      hours: 2,
      linesChanged: 220,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l07",
    }),
    make({
      id: "con_l08",
      person: "Leo",
      type: "commit",
      sourceId: "l-08",
      title: "Add end-to-end checkout test",
      days: 8,
      hours: 2,
      linesChanged: 260,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l08",
    }),
    make({
      id: "con_l09",
      person: "Leo",
      type: "pr",
      sourceId: "#43",
      title: "Fix race condition in checkout",
      days: 10,
      hours: 2,
      linesChanged: 140,
      evidenceUrl: "https://github.com/fairsplit/demo/pull/43",
    }),
    make({
      id: "con_l10",
      person: "Leo",
      type: "commit",
      sourceId: "l-10",
      title: "Reset checkout lock on failure",
      days: 9.5,
      linesChanged: 60,
      prRef: "#43",
      evidenceUrl: "https://github.com/fairsplit/demo/commit/l10",
    }),
    make({
      id: "con_l11",
      person: "Leo",
      type: "commit",
      sourceId: "l-11",
      title: "Merge branch 'checkout-lock'",
      days: 9.5,
      isMerge: true,
    }),
    make({
      id: "con_l12",
      person: "Leo",
      type: "manual",
      sourceId: "m-11",
      title: "Pair-debugged payout webhook with Priya",
      days: 7,
      hours: 1.5,
    }),

    /* ---- Maya — ops/design: few commits, heavy quiet work ---- */
    make({
      id: "con_m21",
      person: "Maya",
      type: "manual",
      sourceId: "m-21",
      title: "Design system and component library",
      days: 18,
      hours: 6,
    }),
    make({
      id: "con_m22",
      person: "Maya",
      type: "commit",
      sourceId: "m-22",
      title: "Landing page responsive polish",
      days: 6,
      hours: 2,
      linesChanged: 150,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/m22",
    }),
    make({
      id: "con_m23",
      person: "Maya",
      type: "manual",
      sourceId: "m-23",
      title: "Reviewed every checkout PR before merge",
      days: 12,
      hours: 5,
    }),
    make({
      id: "con_m24",
      person: "Maya",
      type: "manual",
      sourceId: "m-24",
      title: "Walked Leo through the API contract",
      days: 18,
      hours: 2,
    }),
    make({
      id: "con_m25",
      person: "Maya",
      type: "manual",
      sourceId: "m-25",
      title: "Client comms — weekly notes and demo prep",
      days: 8,
      hours: 3,
    }),
    make({
      id: "con_m26",
      person: "Maya",
      type: "manual",
      sourceId: "m-26",
      title: "Accessibility audit and QA checklist",
      days: 5,
      hours: 3,
    }),
    make({
      id: "con_m27",
      person: "Maya",
      type: "manual",
      sourceId: "m-27",
      title: "Invoice and contractor paperwork",
      days: 13,
      hours: 2,
    }),

    /* ---- Unassigned — land in the tray for the lead to route ---- */
    make({
      id: "con_u01",
      person: "Jordan",
      type: "trello",
      sourceId: "card-99",
      title: "Move QA checklist to Done",
      days: 4,
      evidenceUrl: "https://trello.com/c/card-99",
    }),
    make({
      id: "con_u02",
      person: "Alex",
      type: "commit",
      sourceId: "x-01",
      title: "Polish empty states",
      days: 3.5,
      linesChanged: 45,
      evidenceUrl: "https://github.com/fairsplit/demo/commit/x01",
    }),
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
