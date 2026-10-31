"use client";

import { useMemo, useState } from "react";
import type { ExternalAuthor, IntegrationSource, Project } from "@/lib/types";
import { saveSources, setIdentity, testSources, type SourcesTestResult } from "@/lib/client";
import { memberForAuthor, unmatchedAuthors } from "@/lib/integrations/identity";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";

const SOURCE_LABEL: Record<IntegrationSource, string> = { github: "GitHub", trello: "Trello" };

interface Person extends Pick<ExternalAuthor, "source" | "id" | "label"> {
  count?: number;
}

/**
 * Connect a project to real GitHub repos and a Trello board, and map the
 * people found there to members. Tokens stay in server env; this panel only
 * ever sees whether they are configured.
 */
export function SourcesPanel({
  project,
  onProjectUpdate,
  onError,
}: {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    repos: project.sources?.github?.repos.join(", ") ?? "",
    since: project.sources?.github?.since?.slice(0, 10) ?? "",
    board: project.sources?.trello?.boardId ?? "",
    doneListPattern: project.sources?.trello?.doneListPattern ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<SourcesTestResult | null>(null);
  const [open, setOpen] = useState(!project.sources);
  const locked = project.status === "paid";

  // Handles still needing a member: unmatched synced authors, plus people the
  // connection test found that nobody is mapped to yet.
  const people = useMemo(() => {
    const list: Person[] = unmatchedAuthors(project.contributions, project.members);
    const seen = new Set(list.map((p) => `${p.source}:${p.id.toLowerCase()}`));
    const discovered: Person[] = [
      ...(test?.github?.people ?? []).map((p) => ({ ...p, source: "github" as const })),
      ...(test?.trello?.people ?? []).map((p) => ({ ...p, source: "trello" as const })),
    ];
    for (const person of discovered) {
      const key = `${person.source}:${person.id.toLowerCase()}`;
      if (seen.has(key) || memberForAuthor(project.members, person)) continue;
      seen.add(key);
      list.push(person);
    }
    return list;
  }, [project, test]);

  const mapped = project.members.filter((m) => m.githubLogin || m.trelloMemberId);

  async function act<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      return await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    const next = await act("save", () =>
      saveSources(project.id, {
        github: form.repos.trim() ? { repos: form.repos, since: form.since || undefined } : null,
        trello: form.board.trim()
          ? { board: form.board, doneListPattern: form.doneListPattern || undefined }
          : null,
      })
    );
    if (next) {
      onProjectUpdate(next);
      setForm((f) => ({ ...f, board: next.sources?.trello?.boardId ?? "" }));
    }
  }

  async function onTest() {
    const result = await act("test", () => testSources(project.id));
    if (result) setTest(result);
  }

  async function onMap(person: Person, memberId: string) {
    if (!memberId) return;
    const next = await act(`map-${person.source}-${person.id}`, () =>
      setIdentity(
        project.id,
        person.source === "github"
          ? { memberId, githubLogin: person.label }
          : { memberId, trelloMemberId: person.id, trelloUsername: person.label.replace(/^@/, "") }
      )
    );
    if (next) onProjectUpdate(next);
  }

  async function onUnmap(memberId: string, source: IntegrationSource) {
    const next = await act(`unmap-${memberId}-${source}`, () =>
      setIdentity(project.id, source === "github" ? { memberId, githubLogin: "" } : { memberId, trelloMemberId: "" })
    );
    if (next) onProjectUpdate(next);
  }

  const summary = [
    project.sources?.github && `${project.sources.github.repos.length} repo${project.sources.github.repos.length === 1 ? "" : "s"}`,
    project.sources?.trello && "1 Trello board",
  ].filter(Boolean);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Sources</CardTitle>
          <p className="mt-0.5 text-sm text-slate-500">
            {summary.length ? `Connected: ${summary.join(" · ")}` : "Connect GitHub and Trello to sync real activity."}
            {project.lastSync && ` · last synced ${new Date(project.lastSync.at).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {people.length > 0 && <Badge tone="amber">{people.length} to map</Badge>}
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Edit"}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5">
          <fieldset disabled={locked || busy !== null} className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <Label>GitHub repositories</Label>
              <Input
                value={form.repos}
                onChange={(e) => setForm({ ...form, repos: e.target.value })}
                placeholder="owner/repo, owner/other-repo"
              />
            </div>
            <div className="sm:col-span-4">
              <Label>Count PRs merged since</Label>
              <Input type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} />
            </div>
            <div className="sm:col-span-8">
              <Label>Trello board</Label>
              <Input
                value={form.board}
                onChange={(e) => setForm({ ...form, board: e.target.value })}
                placeholder="https://trello.com/b/AbCd1234/board-name"
              />
            </div>
            <div className="sm:col-span-4">
              <Label>“Done” list names</Label>
              <Input
                value={form.doneListPattern}
                onChange={(e) => setForm({ ...form, doneListPattern: e.target.value })}
                placeholder="done|complete|shipped"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-12">
              <Button size="sm" onClick={onSave}>
                {busy === "save" ? <Spinner /> : "Save sources"}
              </Button>
              <Button size="sm" variant="outline" onClick={onTest}>
                {busy === "test" ? <Spinner /> : "Test connection"}
              </Button>
            </div>
          </fieldset>

          {test && (
            <ul className="space-y-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {test.status.demoMode && (
                <li className="text-amber-700">DEMO_MODE is on — Sync uses sample activity, not these sources.</li>
              )}
              {(["github", "trello"] as const).map((source) => {
                const result = test[source];
                const connected = Boolean(project.sources?.[source]);
                const tokenConfigured = source === "github" ? test.status.githubToken : test.status.trello;
                return (
                  <li key={source} className={result && !result.ok ? "text-rose-700" : "text-slate-600"}>
                    <span className="font-medium">{SOURCE_LABEL[source]}:</span>{" "}
                    {!connected
                      ? "no source connected."
                      : source === "trello" && !tokenConfigured
                        ? "TRELLO_KEY / TRELLO_TOKEN not set on the server — required for Trello."
                        : result?.ok
                          ? `connected ✓ · ${result.people.length} people found` +
                            (source === "github" && !tokenConfigured
                              ? " · no GITHUB_TOKEN set, so this is rate-limited (60 req/hr) and public repos only"
                              : "") +
                            (source === "trello" && test.trello
                              ? ` · Done lists: ${test.trello.doneLists.join(", ") || "none match"}`
                              : "")
                          : result?.error}
                  </li>
                );
              })}
            </ul>
          )}

          {people.length > 0 && (
            <div>
              <Label>Map people to members</Label>
              <p className="mb-2 text-xs text-slate-500">
                Their synced work stays unassigned until mapped. Mapping re-attributes past items instantly.
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {people.map((person) => (
                  <li key={`${person.source}:${person.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Badge tone={person.source === "github" ? "blue" : "emerald"}>{SOURCE_LABEL[person.source]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{person.label}</span>
                    {person.count != null && (
                      <span className="text-xs text-slate-500">
                        {person.count} item{person.count === 1 ? "" : "s"}
                      </span>
                    )}
                    <Select
                      className="w-40"
                      value=""
                      disabled={locked || busy !== null}
                      onChange={(e) => onMap(person, e.target.value)}
                      aria-label={`Map ${person.label} to a member`}
                    >
                      <option value="">Map to…</option>
                      {project.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mapped.length > 0 && (
            <div>
              <Label>Mapped</Label>
              <ul className="flex flex-wrap gap-2">
                {mapped.flatMap((m) =>
                  (["github", "trello"] as const)
                    .filter((source) => (source === "github" ? m.githubLogin : m.trelloMemberId))
                    .map((source) => (
                      <li
                        key={`${m.id}-${source}`}
                        className="flex items-center gap-1.5 rounded-full border border-slate-200 py-0.5 pl-2.5 pr-1 text-xs text-slate-600"
                      >
                        {m.name} ← {SOURCE_LABEL[source]}{" "}
                        <span className="font-medium text-slate-800">
                          {source === "github" ? m.githubLogin : `@${m.trelloUsername ?? m.trelloMemberId}`}
                        </span>
                        <button
                          type="button"
                          className="rounded-full px-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                          onClick={() => onUnmap(m.id, source)}
                          disabled={locked || busy !== null}
                          aria-label={`Unmap ${m.name} from ${SOURCE_LABEL[source]}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))
                )}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
