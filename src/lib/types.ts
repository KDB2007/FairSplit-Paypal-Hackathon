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

export type ContribType = "commit" | "pr" | "trello" | "manual";

export type ManualWorkType =
  | "work"
  | "review"
  | "admin"
  | "client_call"
  | "unblocking";

export type DecisionStatus = "proposed" | "approved" | "disputed" | "paid";

export type PayoutStatus = "pending" | "completed" | "failed";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  confirmed: boolean;
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
  finalPct: number;
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
}

export interface ProjectSummary {
  id: string;
  name: string;
  totalAmount: number;
  status: ProjectStatus;
  philosophy: SplitPhilosophy;
  memberCount: number;
  createdAt: string;
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

export interface MeritRange {
  minMeritPct: number;
  maxMeritPct: number;
}

export interface ScoredPerson {
  memberId: string;
  person: string;
  meritPct: number;
  hybridPct: number;
  hoursPct: number;
  equalPct: number;
  amountsByMode: AmountsByMode;
  reason: string;
  evidenceIds: string[];
  hiddenContributor: boolean;
  zeroActivity: boolean;
  activityCountSharePct: number;
  quietValueSharePct: number;
  valueByCategory: Partial<Record<ContributionCategory, number>>;
  range?: MeritRange;
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
  defaultMode: ScoreMode;
  confidence: Confidence;
  people: ScoredPerson[];
  contributions: ScoredContribution[];
  unassigned: UnassignedContribution[];
  formula: ScoreFormula;
  generatedAt: string;
}
