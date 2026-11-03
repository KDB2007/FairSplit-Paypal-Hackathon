import type {
  Contribution,
  Member,
  Payout,
  PoolConfig,
  Project,
  ProjectSources,
  ProjectSummary,
  SplitDecision,
  SplitPhilosophy,
  SplitProposal,
} from "./types";
import { normalizePercentages } from "./split";
import { allocate, defaultPoolConfig, payableAllocations } from "./layers";
import { reattribute, unmatchedAuthors } from "./integrations/identity";

/**
 * In-memory store. A singleton Map lives on globalThis so it survives
 * hot reloads during development and route/page module duplication.
 */
declare global {
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

/**
 * Remove a project. The demo project is protected: it is seeded on demand, so
 * deleting it would only make it reappear on the next read.
 */
export function deleteProject(id: string): boolean {
  if (id === DEMO_PROJECT_ID) return false;
  return store.delete(id);
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
    members: project.members.map((m) => m.name),
    split: summarySplit(project),
    paidCents: project.payouts.reduce((sum, p) => sum + Math.round(p.amount * 100), 0),
    hasSources: Boolean(project.sources?.github?.repos.length || project.sources?.trello?.boardId),
    lastSyncAt: project.lastSync?.at ?? null,
  };
}

function summarySplit(project: Project): ProjectSummary["split"] {
  const rows = project.decisions.length
    ? project.decisions.map((d) => ({ person: d.person, pct: d.finalPct }))
    : project.proposals.map((p) => ({ person: p.person, pct: p.percentage }));
  if (rows.length === 0) return null;
  return allocate(project, rows).map((a) => ({ person: a.person, cents: a.totalCents }));
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
    githubLogin?: string;
    trelloUsername?: string;
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
    isProjectCreator: index === 0,
    // Self-reported; the Trello username is resolved to its member id on
    // first sync, matched against the board (lib/integrations/identity.ts).
    githubLogin: m.githubLogin,
    trelloUsername: m.trelloUsername,
  }));

  const allConfirmed = members.every((m) => m.confirmed);
  const now = new Date().toISOString();

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
    createdAt: now,
    charterVersion: 1,
    // No fees until the team sets them; the whole amount is the work pool.
    poolConfig: defaultPoolConfig(input.philosophy),
    charterConfirmedAt: allConfirmed ? now : undefined,
  };

  return saveProject(project);
}

function refreshCharterStatus(project: Project): void {
  const allConfirmed = project.members.every((m) => m.confirmed);
  project.charterConfirmedAt = allConfirmed
    ? (project.charterConfirmedAt ?? new Date().toISOString())
    : undefined;
  if (project.status === "draft" && allConfirmed) project.status = "charter_confirmed";
  if (project.status === "charter_confirmed" && !allConfirmed) project.status = "draft";
}

/** Confirm the charter on behalf of every member (demo shortcut). */
export function confirmCharter(projectId: string): Project | undefined {
  const project = store.get(projectId);
  if (!project) return undefined;
  project.members = project.members.map((m) => ({ ...m, confirmed: true }));
  refreshCharterStatus(project);
  return saveProject(project);
}

/** Confirm or withdraw one member's sign-off on the current charter version. */
export function setMemberConfirmation(
  projectId: string,
  memberId: string,
  confirmed: boolean
): Project | undefined {
  const project = store.get(projectId);
  if (!project) return undefined;
  project.members = project.members.map((m) =>
    m.id === memberId ? { ...m, confirmed } : m
  );
  refreshCharterStatus(project);
  return saveProject(project);
}

/**
 * Replace the pool config. Any change is a new charter version, so every
 * member's confirmation is reset and any earlier scoring is discarded — the
 * old split was computed against different fees.
 */
export function updatePoolConfig(
  projectId: string,
  config: Omit<PoolConfig, "version">
): Project | undefined {
  const project = store.get(projectId);
  if (!project) return undefined;
  if (project.status === "paid") return project;

  project.charterVersion = (project.charterVersion ?? 1) + 1;
  project.poolConfig = { ...config, version: project.charterVersion };
  project.members = project.members.map((m) => ({ ...m, confirmed: false }));
  project.charterConfirmedAt = undefined;
  project.scoredSplit = undefined;
  project.proposals = [];
  project.decisions = [];
  project.status = "draft";

  return saveProject(project);
}

/** Scoring needs a pool config and every member signed off on it. */
export function isScoringUnlocked(project: Project): boolean {
  return Boolean(project.poolConfig) && project.members.every((m) => m.confirmed);
}

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
    charterVersion: 1,
    poolConfig: {
      version: 1,
      finderBps: 1000,      // 10%
      finderMemberId: "mem_priya",
      leadBps: 500,         // 5%
      leadMemberId: "mem_priya",
      workPhilosophy: "merit",
    },
    charterConfirmedAt: new Date().toISOString(),
  };

  return saveProject(project);
}

export function getOrCreateDemo(): Project {
  const existing = store.get(DEMO_PROJECT_ID);
  if (existing) return existing;
  return seedDemoProject();
}

/* -------------------------------------------------------------------------- */
/* Integrations: sources + identities                                         */
/* -------------------------------------------------------------------------- */

export function updateSources(projectId: string, sources: ProjectSources): Project | undefined {
  const project = store.get(projectId);
  if (!project) return undefined;
  project.sources = sources;
  return saveProject(project);
}

export type IdentityResult =
  | { ok: true; project: Project }
  | { ok: false; status: number; error: string };

/**
 * Map a member to their GitHub login / Trello member id, then re-attribute
 * every synced item so earlier syncs pick up the mapping without refetching.
 * Pass an empty string to clear a handle.
 */
export function setMemberIdentity(
  projectId: string,
  memberId: string,
  identity: { githubLogin?: string; trelloMemberId?: string; trelloUsername?: string }
): IdentityResult {
  const project = store.get(projectId);
  if (!project) return { ok: false, status: 404, error: "Project not found." };
  const member = project.members.find((m) => m.id === memberId);
  if (!member) return { ok: false, status: 404, error: "Member not found." };

  const clash = (pick: (m: Member) => string | undefined, value: string | undefined) =>
    value
      ? project.members.find(
          (m) => m.id !== memberId && pick(m)?.toLowerCase() === value.toLowerCase()
        )
      : undefined;

  const github = identity.githubLogin?.trim();
  const trello = identity.trelloMemberId?.trim();
  const githubClash = clash((m) => m.githubLogin, github);
  if (githubClash) {
    return { ok: false, status: 409, error: `${github} is already mapped to ${githubClash.name}.` };
  }
  const trelloClash = clash((m) => m.trelloMemberId, trello);
  if (trelloClash) {
    return { ok: false, status: 409, error: `That Trello member is already mapped to ${trelloClash.name}.` };
  }

  if (identity.githubLogin !== undefined) member.githubLogin = github || undefined;
  if (identity.trelloMemberId !== undefined) {
    member.trelloMemberId = trello || undefined;
    member.trelloUsername = trello ? identity.trelloUsername?.trim() || undefined : undefined;
  }

  project.contributions = reattribute(project.contributions, project.members);
  if (project.lastSync) {
    project.lastSync = {
      ...project.lastSync,
      report: {
        ...project.lastSync.report,
        unmatched: unmatchedAuthors(project.contributions, project.members),
      },
    };
  }
  return { ok: true, project: saveProject(project) };
}

/* -------------------------------------------------------------------------- */
/* Payout helpers                                                             */
/* -------------------------------------------------------------------------- */

export interface PayoutResult {
  batchId: string;
  payouts: Payout[];
  simulated: boolean;
}

export interface PayoutLine {
  person: string;
  email: string;
  amountCents: number;
  breakdown: Payout["breakdown"];
}

export function payoutLines(project: Project): PayoutLine[] {
  return payableAllocations(project, project.decisions).map((a) => ({
    person: a.person,
    email: project.members.find((m) => m.name === a.person)?.email ?? "",
    amountCents: a.totalCents,
    breakdown: { finderCents: a.finderCents, leadCents: a.leadCents, workCents: a.workCents },
  }));
}

export function buildPayouts(
  project: Project,
  batchId: string,
  simulated: boolean,
  lines: PayoutLine[] = payoutLines(project)
): Payout[] {
  return lines.map((line, index) => ({
    id: newId("pay"),
    projectId: project.id,
    person: line.person,
    amount: line.amountCents / 100,
    paypalBatchId: batchId,
    paypalTxnId: `TXN${(index + 1).toString().padStart(4, "0")}${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`,
    status: simulated ? ("completed" as const) : ("pending" as const),
    receiptUrl: `/receipt/${project.id}`,
    breakdown: line.breakdown,
  }));
}

/**
 * Work-pool percentages → decisions with cents attached. Percentages are
 * normalised to 100 across the work pool; charter fees are never touched here.
 */
function withAmounts(
  project: Project,
  rows: Array<Omit<SplitDecision, "feeCents" | "amountCents">>
): SplitDecision[] {
  const pcts = normalizePercentages(rows.map((r) => r.finalPct));
  const allocations = allocate(
    project,
    rows.map((r, i) => ({ person: r.person, pct: pcts[i] }))
  );
  return rows.map((r, i) => ({
    ...r,
    finalPct: pcts[i],
    feeCents: allocations[i].finderCents + allocations[i].leadCents,
    amountCents: allocations[i].totalCents,
  }));
}

export function applyDecisions(
  project: Project,
  decisions: Array<{ person: string; finalPct: number; overrideNote?: string; status?: string }>
): { project: Project; decisions: SplitDecision[] } {
  const existing = new Map(project.decisions.map((d) => [d.person, d]));

  const next = withAmounts(
    project,
    decisions.map((d) => {
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
        finalPct: Number(d.finalPct),
        overrideNote: d.overrideNote ?? prior?.overrideNote,
        status: status as SplitDecision["status"],
      };
    })
  );

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
  project.decisions = withAmounts(
    project,
    project.proposals.map((p) => ({
      id: newId("dec"),
      projectId: project.id,
      person: p.person,
      finalPct: p.percentage,
      status: "proposed" as const,
    }))
  );
  saveProject(project);
  return project.decisions;
}

export type { Project, SplitProposal, Contribution };
