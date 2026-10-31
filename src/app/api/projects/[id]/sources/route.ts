import { NextResponse } from "next/server";
import { getProject, updateSources } from "@/lib/store";
import { REPO_PATTERN } from "@/lib/integrations/github";
import { parseBoardId } from "@/lib/integrations/trello";
import type { ProjectSources } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_REPOS = 10;

function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return pattern.length <= 100;
  } catch {
    return false;
  }
}

/**
 * PUT /api/projects/[id]/sources
 * Body: { github?: { repos: string[] | string, since?: string } | null,
 *         trello?: { board: string, doneListPattern?: string } | null }
 * Repos are "owner/name"; the board may be an id, short link or pasted URL.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (project.status === "paid") {
    return NextResponse.json({ error: "This project has already been paid out." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  const errors: string[] = [];
  const sources: ProjectSources = {};

  if (body.github) {
    const raw: unknown[] = Array.isArray(body.github.repos)
      ? body.github.repos
      : String(body.github.repos ?? "").split(/[\s,]+/);
    const repos = [
      ...new Set(
        raw
          .map((r) => String(r).trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/$/g, ""))
          .filter(Boolean)
      ),
    ];
    const invalid = repos.filter((r) => !REPO_PATTERN.test(r));
    if (invalid.length) errors.push(`Not a GitHub repo (owner/name): ${invalid.join(", ")}.`);
    if (repos.length > MAX_REPOS) errors.push(`At most ${MAX_REPOS} repositories.`);

    let since: string | undefined;
    if (body.github.since) {
      const date = new Date(String(body.github.since));
      if (Number.isNaN(date.getTime())) errors.push("since must be a date.");
      else since = date.toISOString();
    }
    if (repos.length > 0) sources.github = { repos, since };
  }

  if (body.trello) {
    const boardInput = String(body.trello.board ?? "").trim();
    if (boardInput) {
      const boardId = parseBoardId(boardInput);
      if (!boardId) errors.push("Trello board must be a board id, short link or trello.com/b/… URL.");
      const pattern = body.trello.doneListPattern ? String(body.trello.doneListPattern).trim() : undefined;
      if (pattern && !isValidPattern(pattern)) {
        errors.push("Done-list pattern is not a valid regular expression.");
      }
      if (boardId) sources.trello = { boardId, doneListPattern: pattern || undefined };
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  const updated = updateSources(id, sources)!;
  return NextResponse.json({ project: updated });
}
