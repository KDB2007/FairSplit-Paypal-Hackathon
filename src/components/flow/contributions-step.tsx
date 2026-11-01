"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, GitPullRequest, Lock, NotebookPen, RefreshCw, SquareKanban } from "lucide-react";
import type { Contribution, Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { personColorMap } from "@/lib/person-color";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SourcesPanel } from "@/components/sources-panel";
import { ContributionInsights } from "./contribution-insights";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Spinner } from "@/components/ui";

const TYPE_TONE: Record<Contribution["type"], "blue" | "emerald" | "violet" | "slate"> = {
  commit: "blue",
  pr: "blue",
  review: "slate",
  trello: "emerald",
  manual: "violet",
};

const TYPE_LABEL: Record<Contribution["type"], string> = {
  commit: "Commit",
  pr: "Pull request",
  review: "PR review",
  trello: "Trello",
  manual: "Manual",
};

export interface ManualWork {
  person: string;
  kind: string;
  title: string;
  hours: string;
}

export function ContributionsStep({
  project,
  busy,
  scoringUnlocked,
  onProjectUpdate,
  onError,
  onSync,
  onLogWork,
  onNext,
}: {
  project: Project;
  busy: string | null;
  scoringUnlocked: boolean;
  onProjectUpdate: (project: Project) => void;
  onError: (message: string) => void;
  onSync: (source: "github" | "trello" | "both") => void;
  onLogWork: (work: ManualWork) => Promise<boolean>;
  onNext: () => void;
}) {
  const reduce = useReducedMotion();
  const colors = useMemo(() => personColorMap(project.members), [project.members]);
  const [manual, setManual] = useState<ManualWork>({ person: "", kind: "client_call", title: "", hours: "" });

  const groups = useMemo(() => {
    // Synced items carry a memberId; manual and legacy items fall back to the name.
    const owner = (c: Contribution) =>
      project.members.find((m) => m.id === c.memberId) ??
      (c.externalAuthor ? undefined : project.members.find((m) => m.name.toLowerCase() === c.person.toLowerCase()));
    const newestFirst = (a: Contribution, b: Contribution) => b.timestamp.localeCompare(a.timestamp);
    const list = project.members.map((member) => ({
      key: member.id,
      member,
      items: project.contributions.filter((c) => owner(c)?.id === member.id).sort(newestFirst),
    }));
    const unmatched = project.contributions.filter((c) => !owner(c)).sort(newestFirst);
    return { list, unmatched };
  }, [project]);

  const sourceCounts = useMemo(() => {
    const github = project.contributions.filter((c) => c.type === "pr" || c.type === "commit" || c.type === "review").length;
    const trello = project.contributions.filter((c) => c.type === "trello").length;
    const manualCount = project.contributions.filter((c) => c.type === "manual").length;
    return [
      { key: "github", label: "GitHub", count: github, icon: GitPullRequest },
      { key: "trello", label: "Trello", count: trello, icon: SquareKanban },
      { key: "manual", label: "Manual", count: manualCount, icon: NotebookPen },
    ];
  }, [project.contributions]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await onLogWork(manual)) setManual((m) => ({ ...m, title: "", hours: "" }));
  }

  return (
    <div className="space-y-6">
      <SourcesPanel project={project} onProjectUpdate={onProjectUpdate} onError={onError} />

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Contributions</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Synced activity plus the quiet work automation misses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Counts pulse once when a sync lands (keyed on the sync time). */}
            <div className="mr-1 flex items-center gap-1.5" key={project.lastSync?.at ?? "none"}>
              {sourceCounts.map((source, i) => (
                <motion.span
                  key={source.key}
                  initial={reduce || !project.lastSync ? false : { scale: 1.12, boxShadow: "0 0 0 4px color-mix(in oklch, var(--primary) 25%, transparent)" }}
                  animate={{ scale: 1, boxShadow: "0 0 0 0px transparent" }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
                  title={`${source.count} from ${source.label}`}
                >
                  <source.icon className="size-3 text-muted-foreground" aria-hidden />
                  <span className="tabular-nums font-medium">{source.count}</span>
                  <span className="sr-only">{source.label}</span>
                </motion.span>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => onSync("github")} disabled={busy !== null}>
              {busy === "sync-github" ? <Spinner /> : <GitPullRequest className="size-3.5" />} GitHub
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSync("trello")} disabled={busy !== null}>
              {busy === "sync-trello" ? <Spinner /> : <SquareKanban className="size-3.5" />} Trello
            </Button>
            <Button size="sm" onClick={() => onSync("both")} disabled={busy !== null}>
              {busy === "sync-both" ? <Spinner /> : <RefreshCw className="size-3.5" />} Sync both
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {project.contributions.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RefreshCw />
                </EmptyMedia>
                <EmptyTitle>No activity yet</EmptyTitle>
                <EmptyDescription>
                  Sync GitHub or Trello, or log quiet work below — client calls, reviews, unblocking.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ContributionInsights project={project} />
              <div className="space-y-5">
                {groups.list.map(({ key, member, items }) => (
                  <ActivityGroup
                    key={key}
                    title={member.name}
                    avatar={<Avatar name={member.name} color={colors[member.id]} className="size-7 text-[10px]" />}
                    items={items}
                    reduce={!!reduce}
                  />
                ))}
                {groups.unmatched.length > 0 && (
                  <ActivityGroup
                    title="Not mapped to a member — scored as unassigned"
                    avatar={<Badge tone="amber">Unmatched</Badge>}
                    items={groups.unmatched}
                    showAuthor
                    reduce={!!reduce}
                  />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log quiet work</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Client calls, reviews, admin and unblocking never show up in GitHub.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <Label htmlFor="qw-person">Person</Label>
              <Select id="qw-person" value={manual.person} onChange={(e) => setManual({ ...manual, person: e.target.value })} required>
                <option value="">Choose…</option>
                {project.members.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="qw-kind">Kind</Label>
              <Select id="qw-kind" value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}>
                <option value="work">Work</option>
                <option value="review">Review</option>
                <option value="admin">Admin</option>
                <option value="client_call">Client call</option>
                <option value="unblocking">Unblocking</option>
              </Select>
            </div>
            <div className="sm:col-span-4">
              <Label htmlFor="qw-title">Description</Label>
              <Input
                id="qw-title"
                value={manual.title}
                onChange={(e) => setManual({ ...manual, title: e.target.value })}
                placeholder="e.g. Client call about timeline"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="qw-hours">Hours</Label>
              <Input
                id="qw-hours"
                type="number"
                min="0"
                step="0.5"
                value={manual.hours}
                onChange={(e) => setManual({ ...manual, hours: e.target.value })}
                placeholder="2"
              />
            </div>
            <div className="sm:col-span-12">
              <Button type="submit" disabled={busy === "manual"}>
                {busy === "manual" ? <Spinner /> : <NotebookPen className="size-4" />} Log work
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!scoringUnlocked && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" /> Everyone signs the charter before scoring.
          </span>
        )}
        <Button size="lg" onClick={onNext} disabled={!scoringUnlocked}>
          Next: AI scoring <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ActivityGroup({
  title,
  avatar,
  items,
  showAuthor = false,
  reduce,
}: {
  title: string;
  avatar: React.ReactNode;
  items: Contribution[];
  showAuthor?: boolean;
  reduce: boolean;
}) {
  const hours = items.reduce((s, c) => s + (c.hours ?? 0), 0);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {avatar}
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"}
          {hours > 0 && ` · ${hours}h logged`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {items.map((c, i) => (
            <motion.li
              key={c.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.04 }}
              className="flex flex-wrap items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
              <HoverCard>
                <HoverCardTrigger
                  delay={250}
                  render={<span className="min-w-0 flex-1 cursor-default truncate text-sm text-foreground/85" tabIndex={0} />}
                >
                  {c.title}
                </HoverCardTrigger>
                <HoverCardContent className="w-80" side="top" align="start">
                  <p className="text-sm font-medium leading-snug">{c.title}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{TYPE_LABEL[c.type]}{c.sourceId && !c.sourceId.startsWith("manual") ? ` · ${c.sourceId}` : ""}</dd>
                    {c.externalAuthor && (
                      <>
                        <dt className="text-muted-foreground">Author</dt>
                        <dd>{c.externalAuthor.label}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">When</dt>
                    <dd>{formatDate(c.timestamp)}</dd>
                    {c.linesChanged ? (
                      <>
                        <dt className="text-muted-foreground">Size</dt>
                        <dd>±{c.linesChanged} lines</dd>
                      </>
                    ) : null}
                    {c.hours != null && (
                      <>
                        <dt className="text-muted-foreground">Hours</dt>
                        <dd>{c.hours}h</dd>
                      </>
                    )}
                  </dl>
                  {c.evidenceUrl && (
                    <a href={c.evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Open evidence <ArrowUpRight className="size-3" />
                    </a>
                  )}
                </HoverCardContent>
              </HoverCard>
              {showAuthor && c.externalAuthor && <span className="text-xs text-muted-foreground">{c.externalAuthor.label}</span>}
              {c.linesChanged != null && c.linesChanged > 0 && <span className="text-xs tabular-nums text-muted-foreground">±{c.linesChanged}</span>}
              {c.hours != null && <span className="text-xs tabular-nums text-muted-foreground">{c.hours}h</span>}
              <span className="text-xs text-muted-foreground">{formatDate(c.timestamp)}</span>
              {c.evidenceUrl && (
                <a
                  href={c.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                  aria-label={`Open evidence for ${c.title}`}
                >
                  Evidence <ArrowUpRight className="size-3" />
                </a>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
