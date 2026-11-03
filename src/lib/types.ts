/**
 * FairSplit domain types — derived from PRD.md section 8.
 * In-memory store, demo-oriented, no database.
 */

export type SplitPhilosophy = "equal" | "merit" | "hybrid";

export type ProjectStatus =
  | "draft"
  | "charter_confirmed"
  | "scored"
  | "approved"
  | "paid";

export type MemberRole = "lead" | "member";

export type ContribType = "commit" | "pr" | "review" | "trello" | "manual";

export type ManualWorkType =
  | "work"
  | "review"
  | "admin"
  | "client_call"
  | "unblocking";

export type DecisionStatus = "proposed" | "approved" | "disputed" | "paid";

export type PayoutStatus = "pending" | "completed" | "failed";

export interface PoolConfig {
  version: number;
  finderBps: number;        // 0–1500 (0–15%), basis points integer
  finderMemberId: string | null;
  leadBps: number;          // 0–1000 (0–10%), basis points integer
  leadMemberId: string | null;
  workPhilosophy: SplitPhilosophy;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  confirmed: boolean;
  /** Set to true if this member created the project (first member). */
  isProjectCreator?: boolean;
  /** GitHub login used to attribute synced PRs, commits and reviews. */
  githubLogin?: string;
  /** Trello member id used to attribute synced cards. */
  trelloMemberId?: string;
  /** Trello username, for display only. */
  trelloUsername?: string;
}

export type IntegrationSource = "github" | "trello";

/** Who did the work in the source system — kept so a later mapping can re-attribute it. */
export interface ExternalAuthor {
  source: IntegrationSource;
  /** GitHub login or Trello member id. */
  id: string;
  /** Human-readable handle (GitHub login / Trello username or full name). */
  label: string;
}

export interface Contribution {
  id: string;
  projectId: string;
  person: string; // member name
  type: ContribType;
  sourceId: string; // GitHub SHA / PR # / Trello card ID / manual id
  title: string;
  hours?: number;
  timestamp: string;
  evidenceUrl?: string; // link to PR / Trello card
  /* ---- Explainable Split additions (all optional, additive) ---- */
  memberId?: string; // preferred over name matching when present
  linesChanged?: number; // size signal, used by normalize
  prRef?: string; // links a commit to the PR that shipped it
  isMerge?: boolean; // dropped by normalize
  trivial?: boolean; // whitespace / typo only, dropped by normalize
  /** Set on synced items; absent on manual work. */
  externalAuthor?: ExternalAuthor;
}

export interface SplitProposal {
  id: string;
  projectId: string;
  person: string;
  impact: number; // 1-10
  complexity: number; // 1-10
  effort: number; // 1-10
  percentage: number; // AI-proposed %
  reason: string;
  evidenceRefs: string[]; // contribution IDs
  aiGenerated: boolean;
}

export interface SplitDecision {
  id: string;
  projectId: string;
  person: string;
  /** Share of the WORK POOL (charter fees excluded). Decisions sum to 100. */
  finalPct: number;
  /** Charter fees (finder + lead) owed to this person, in cents. */
  feeCents: number;
  /** Fees + work-pool slice, in cents. Decisions sum to the project total. */
  amountCents: number;
  overrideNote?: string;
  status: DecisionStatus;
}

export interface Payout {
  id: string;
  projectId: string;
  person: string;
  amount: number;
  paypalBatchId?: string;
  paypalTxnId?: string;
  status: PayoutStatus;
  receiptUrl?: string;
  /** How this payout splits across the pool layers, in cents. */
  breakdown: PayoutBreakdown;
}

export interface PayoutBreakdown {
  finderCents: number;
  leadCents: number;
  workCents: number;
}

export interface Project {
  id: string;
  name: string;
  totalAmount: number;
  philosophy: SplitPhilosophy;
  status: ProjectStatus;
  members: Member[];
  contributions: Contribution[];
  proposals: SplitProposal[];
  decisions: SplitDecision[];
  payouts: Payout[];
  createdAt: string;
  /** Last Explainable Split result, persisted so a reload keeps the screen. */
  scoredSplit?: ScoredSplit;
  /** Pool configuration for layered splitting (set after charter step 2). */
  poolConfig?: PoolConfig;
  /** ISO timestamp when all members last confirmed the charter. */
  charterConfirmedAt?: string;
  /** Charter version — increments on any edit to the pool config. */
  charterVersion: number;
  /** Where real activity is synced from. Tokens live in server env, never here. */
  sources?: ProjectSources;
  lastSync?: { at: string; report: SyncReport };
}

export interface ProjectSources {
  github?: { repos: string[]; since?: string };
  trello?: { boardId: string; doneListPattern?: string };
}

export interface SyncReport {
  mode: "live" | "demo";
  added: number;
  updated: number;
  /** External handles with no mapped member, and how many items each owns. */
  unmatched: Array<ExternalAuthor & { count: number }>;
  errors: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  totalAmount: number;
  status: ProjectStatus;
  philosophy: SplitPhilosophy;
  memberCount: number;
  createdAt: string;
  /** Member names, in member order (which drives each person's colour). */
  members: string[];
  /** Cents per person under the current split (decisions, else AI proposal); null before scoring. */
  split: Array<{ person: string; cents: number }> | null;
  /** Total actually paid out, in cents. */
  paidCents: number;
  /** Whether a GitHub repo or Trello board is configured for this project. */
  hasSources: boolean;
  /** ISO timestamp of the last sync, if any has run. */
  lastSyncAt: string | null;
}

export interface ScoreResult {
  person: string;
  impact: number;
  complexity: number;
  effort: number;
  percentage: number;
  reason: string;
  evidenceRefs: string[];
}

/* -------------------------------------------------------------------------- */
/* Explainable Split                                                           */
/* The LLM judges and explains; code does the maths. Nothing below is ever     */
/* produced verbatim by the model — it is derived by pure functions.           */
/* -------------------------------------------------------------------------- */

export type ContributionCategory =
  | "code"
  | "review"
  | "design"
  | "client_comms"
  | "unblocking"
  | "admin"
  | "planning";

/** The four ways a lump sum can be divided. */
export type ScoreMode = "equal" | "merit" | "hybrid" | "hours";

export type Confidence = "high" | "lower";

/** Step 1 output for a single contribution (model-authored, validated). */
export interface ContributionJudgment {
  id: string; // stable normalized id (c_001…)
  category: ContributionCategory;
  impact: number; // 1-5
  complexity: number; // 1-5
  isQuietWork: boolean;
  rationale: string; // <= 20 words
}

/** Step 0 output: one normalized work item. */
export interface NormalizedContribution {
  id: string; // c_001…
  sourceContributionIds: string[]; // raw Contribution.id(s) folded into this item
  sourceId: string; // PR # / SHA / card id — stable per project
  memberId: string | null; // null => unassigned
  person: string; // raw attribution from the source system
  type: ContribType;
  title: string;
  linesChanged: number;
  hours: number;
  timestamp: string;
  evidenceUrl?: string;
  categoryHint?: ContributionCategory;
}

/** A normalized item joined with its judgment and computed value. */
export interface ScoredContribution {
  id: string;
  memberId: string | null;
  person: string;
  title: string;
  sourceId: string;
  type: ContribType;
  category: ContributionCategory;
  impact: number;
  complexity: number;
  isQuietWork: boolean;
  rationale: string;
  value: number; // impact * complexity * categoryWeight[category]
  linesChanged: number;
  hours: number;
  timestamp: string;
  evidenceUrl?: string;
}

export interface UnassignedContribution {
  id: string;
  title: string;
  person: string;
  sourceId: string;
  type: ContribType;
  category: ContributionCategory;
  impact: number;
  complexity: number;
  hours: number;
  timestamp: string;
  evidenceUrl?: string;
  reason: "no_matching_member";
}

/** Integer cents per mode — never floating point money. */
export type AmountsByMode = Record<ScoreMode, number>;

/** The charter's fixed fees and the remaining work pool, in cents. */
export interface LayerAmounts {
  finderCents: number;
  leadCents: number;
  workPoolCents: number;
  finderMemberId: string | null;
  leadMemberId: string | null;
}

export interface MeritRange {
  minMeritPct: number;
  maxMeritPct: number;
}

export interface ScoredPerson {
  memberId: string;
  person: string;
  meritPct: number;           // % of work pool only
  hybridPct: number;          // % of work pool only
  hoursPct: number;           // % of work pool only
  equalPct: number;           // % of work pool only
  /** Total cents per mode: charter fees + work-pool slice. Sums to the project total. */
  amountsByMode: AmountsByMode;
  /** Work-pool cents only, per mode. */
  workAmountsByMode: AmountsByMode;
  reason: string;
  evidenceIds: string[];
  hiddenContributor: boolean;
  zeroActivity: boolean;
  activityCountSharePct: number;
  quietValueSharePct: number;
  valueByCategory: Partial<Record<ContributionCategory, number>>;
  range?: MeritRange;
  /** Finder fee in cents (0 unless this person is the charter's finder). */
  finderAmountCents: number;
  /** Lead fee in cents (0 unless this person is the charter's lead). */
  leadAmountCents: number;
}

export interface ScoreFormula {
  categoryWeights: Record<ContributionCategory, number>;
  hybridMeritWeight: number;
  hybridHoursWeight: number;
  runs: number;
  source: "canned" | "llm" | "heuristic";
  hoursFallback: boolean;
  durationMs: number;
  notes: string[];
  /** Widest run-to-run swing in any member's merit share, in points. */
  maxMeritDeltaPct: number;
}

export interface ScoredSplit {
  projectId: string;
  totalAmountCents: number;
  currency: "USD";
  /** Charter fees carved off the top; people's mode percentages apply to workPoolCents. */
  layers: LayerAmounts;
  defaultMode: ScoreMode;
  confidence: Confidence;
  people: ScoredPerson[];
  contributions: ScoredContribution[];
  unassigned: UnassignedContribution[];
  formula: ScoreFormula;
  generatedAt: string;
}
