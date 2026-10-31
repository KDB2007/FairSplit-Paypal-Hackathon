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
