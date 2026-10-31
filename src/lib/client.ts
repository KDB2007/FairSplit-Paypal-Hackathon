import type { Project, ProjectSummary, ScoredSplit } from "./types";

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
  members: Array<{ name: string; email: string; role: string; confirmed: boolean }>;
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
): Promise<{ project: Project; synced: number }> {
  const res = await fetch("/api/contributions/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, source }),
  });
  return json<{ project: Project; synced: number }>(res);
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

export async function confirmCharter(projectId: string): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm-charter" }),
  });
  return json<Project>(res);
}
