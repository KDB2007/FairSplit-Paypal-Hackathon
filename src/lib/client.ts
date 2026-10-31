import type { PoolConfig, Project, ProjectSummary, ScoredSplit, SyncReport } from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch("/api/projects", { cache: "no-store" });
  const data = await json<{ projects: ProjectSummary[] }>(res);
  return data.projects;
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
  return json<Project>(res);
}

export async function createProject(input: {
  name: string;
  totalAmount: number;
  philosophy: string;
  members: Array<{
    name: string;
    email: string;
    role: string;
    confirmed: boolean;
    githubLogin?: string;
    trelloUsername?: string;
  }>;
}): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json<Project>(res);
}

export async function syncActivity(
  projectId: string,
  source: "github" | "trello" | "both"
): Promise<{ project: Project; synced: number; report: SyncReport }> {
  const res = await fetch("/api/contributions/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, source }),
  });
  return json<{ project: Project; synced: number; report: SyncReport }>(res);
}

export async function saveSources(
  projectId: string,
  input: {
    github: { repos: string; since?: string } | null;
    trello: { board: string; doneListPattern?: string } | null;
  }
): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}/sources`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ project: Project }>(res)).project;
}

export interface SourcesTestResult {
  status: { demoMode: boolean; githubToken: boolean; trello: boolean };
  github?: { ok: boolean; error?: string; people: Array<{ id: string; label: string }> };
  trello?: { ok: boolean; error?: string; doneLists: string[]; people: Array<{ id: string; label: string }> };
}

export async function testSources(projectId: string): Promise<SourcesTestResult> {
  const res = await fetch(`/api/projects/${projectId}/sources/test`, { cache: "no-store" });
  return json<SourcesTestResult>(res);
}

export async function setIdentity(
  projectId: string,
  input: { memberId: string; githubLogin?: string; trelloMemberId?: string; trelloUsername?: string }
): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}/identities`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ project: Project }>(res)).project;
}

export async function logContribution(input: {
  projectId: string;
  person: string;
  type: string;
  title: string;
  hours?: number;
}): Promise<{ project: Project }> {
  const res = await fetch("/api/contributions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json<{ project: Project }>(res);
}

export async function scoreProject(projectId: string): Promise<{
  project: Project;
  split: ScoredSplit;
  source: "llm" | "canned";
}> {
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  return json<{ project: Project; split: ScoredSplit; source: "llm" | "canned" }>(res);
}

export async function saveSplit(
  projectId: string,
  decisions: Array<{
    person: string;
    finalPct: number;
    overrideNote?: string;
    status?: string;
  }>
): Promise<{ project: Project }> {
  const res = await fetch("/api/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, decisions }),
  });
  return json<{ project: Project }>(res);
}

export async function sendPayout(projectId: string): Promise<{
  project: Project;
  batchId: string;
  simulated: boolean;
  message: string;
}> {
  const res = await fetch("/api/payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  return json<{
    project: Project;
    batchId: string;
    simulated: boolean;
    message: string;
  }>(res);
}

export async function savePoolConfig(
  projectId: string,
  poolConfig: Omit<PoolConfig, "version">
): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}/pool-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poolConfig }),
  });
  return (await json<{ project: Project }>(res)).project;
}

export async function setMemberConfirmation(
  projectId: string,
  memberId: string,
  confirmed: boolean
): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}/confirm-charter`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, action: confirmed ? "confirm" : "unconfirm" }),
  });
  return (await json<{ project: Project }>(res)).project;
}

/** Confirms on behalf of every member — demo shortcut. */
export async function confirmCharter(projectId: string): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm-charter" }),
  });
  return json<Project>(res);
}
