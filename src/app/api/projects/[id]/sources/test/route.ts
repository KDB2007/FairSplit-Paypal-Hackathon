import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import {
  fetchDirectCommits,
  fetchMergedPullRequests,
  mapDirectCommits,
  mapGithubPullRequests,
} from "@/lib/integrations/github";
import { fetchTrelloBoard, donePattern } from "@/lib/integrations/trello";
import { IntegrationError } from "@/lib/integrations/http";
import { integrationStatus } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface Person {
  id: string;
  label: string;
}

const message = (error: unknown, service: string) =>
  error instanceof IntegrationError ? error.message : `${service}: connection failed.`;

/**
 * GET /api/projects/[id]/sources/test
 * Which tokens are configured (never the tokens themselves), whether each
 * connected source is reachable, and the people found there so they can be
 * mapped to members before the first full sync.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const status = integrationStatus();
  const result: {
    status: typeof status;
    github?: { ok: boolean; error?: string; people: Person[] };
    trello?: { ok: boolean; error?: string; doneLists: string[]; people: Person[] };
  } = { status };

  const github = project.sources?.github;
  if (github) {
    try {
      const people = new Map<string, Person>();
      for (const repo of github.repos) {
        const prs = await fetchMergedPullRequests(repo, {
          token: process.env.GITHUB_TOKEN,
          since: github.since,
          limit: 25,
        });
        const items = mapGithubPullRequests(prs, repo);

        // Also probe direct commits — a repo with no PRs at all would
        // otherwise always report "0 people found" even with real activity.
        const knownShas = new Set(prs.flatMap((pr) => pr.commits.nodes.map((node) => node.commit.oid)));
        const mergedPrNumbers = new Set(prs.map((pr) => pr.number));
        const commits = await fetchDirectCommits(repo, {
          token: process.env.GITHUB_TOKEN,
          since: github.since,
          limit: 25,
        });
        items.push(...mapDirectCommits(commits, { shas: knownShas, mergedPrNumbers }));

        for (const item of items) {
          if (item.externalAuthor) people.set(item.externalAuthor.id, item.externalAuthor);
        }
      }
      result.github = { ok: true, people: [...people.values()].map(({ id, label }) => ({ id, label })) };
    } catch (error) {
      result.github = { ok: false, error: message(error, "GitHub"), people: [] };
    }
  }

  const trello = project.sources?.trello;
  if (trello && status.trello) {
    try {
      const board = await fetchTrelloBoard(trello.boardId, {
        key: process.env.TRELLO_KEY!,
        token: process.env.TRELLO_TOKEN!,
      });
      const matcher = donePattern(trello.doneListPattern);
      result.trello = {
        ok: true,
        doneLists: board.lists.filter((l) => matcher.test(l.name)).map((l) => l.name),
        people: board.members.map((m) => ({ id: m.id, label: `@${m.username}` })),
      };
    } catch (error) {
      result.trello = { ok: false, error: message(error, "Trello"), doneLists: [], people: [] };
    }
  }

  return NextResponse.json(result);
}
