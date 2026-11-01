"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowLeft, Banknote, ReceiptText, Users, Wallet } from "lucide-react";
import type { Project } from "@/lib/types";
import { fetchProject } from "@/lib/client";
import { equalSplit, hoursSplit } from "@/lib/split";
import { allocate, layerAmounts } from "@/lib/layers";
import { toCents } from "@/lib/explain/rounding";
import { formatDateTime, money } from "@/lib/utils";
import { personColorByName } from "@/lib/person-color";
import { EarningsBars, KpiCard, MoneyDonut } from "@/components/charts";
import { ContributionInsights } from "@/components/flow/contribution-insights";
import { ShareBar } from "@/components/explain/split-visuals";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, PageShell } from "@/components/ui";

type WhatIf = "current" | "equal" | "hours";

const STATUS_TONE: Record<string, "slate" | "blue" | "emerald" | "amber" | "violet"> = {
  draft: "slate",
  charter_confirmed: "blue",
  scored: "violet",
  approved: "amber",
  paid: "emerald",
};

export default function DashboardPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const reduce = useReducedMotion();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIf>("current");

  useEffect(() => {
    fetchProject(projectId)
      .then(setProject)
      .catch((err) => setError(err.message));
  }, [projectId]);

  const colors = useMemo(() => (project ? personColorByName(project.members) : {}), [project]);

  // The split everything on this page reads from: decisions > AI proposal > equal.
  const current = useMemo(() => {
    if (!project) return null;
    const source = project.decisions.length
      ? {
          label:
            project.status === "paid" ? "Paid split" : project.status === "approved" ? "Approved split" : "Draft decisions",
          rows: project.decisions.map((d) => ({ person: d.person, pct: d.finalPct })),
        }
      : project.proposals.length
        ? { label: "AI proposal", rows: project.proposals.map((p) => ({ person: p.person, pct: p.percentage })) }
        : { label: "Equal (not scored yet)", rows: equalSplit(project.members) };
    return { ...source, cents: allocate(project, source.rows) };
  }, [project]);

  const whatIfRows = useMemo(() => {
    if (!project || !current) return [];
    const rows = whatIf === "equal" ? equalSplit(project.members) : whatIf === "hours" ? hoursSplit(project) : current.rows;
    const cents = allocate(project, rows);
    const equal = equalSplit(project.members);
    return rows.map((r, i) => ({
      ...r,
      cents: cents[i].totalCents,
      equalPct: equal.find((e) => e.person === r.person)?.pct ?? 0,
    }));
  }, [project, current, whatIf]);

  if (error) {
    return (
      <PageShell>
        <Alert tone="error" title="Could not load dashboard">
          {error}
        </Alert>
      </PageShell>
    );
  }

  if (!project || !current) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-72" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72 rounded-xl" />
      </PageShell>
    );
  }

  const totalCents = toCents(project.totalAmount);
  const layers = layerAmounts(totalCents, project.poolConfig);
  const paidCents = project.payouts.reduce((s, p) => s + Math.round(p.amount * 100), 0);
  const quiet = project.contributions.filter(
    (c) => c.type === "review" || /\[(review|client call|unblocking|admin)\]/i.test(c.title)
  ).length;
  const batchId = project.payouts[0]?.paypalBatchId;
  // Largest work-pool share relative to an equal one, e.g. "1.4× equal".
  const topWorkPct = Math.max(0, ...current.cents.map((c) => c.workPct));
  const equalPct = 100 / Math.max(1, current.cents.length);
  const spread = topWorkPct > 0 ? `${(topWorkPct / equalPct).toFixed(1)}× equal` : "—";

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {current.label} · {money(project.totalAmount)} lump sum
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[project.status] ?? "slate"}>{project.status.replace("_", " ")}</Badge>
          {project.status !== "paid" && (
            <Link href={`/project/${project.id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="size-3.5" /> Workflow
              </Button>
            </Link>
          )}
          {project.payouts.length > 0 && (
            <Link href={`/receipt/${project.id}`}>
              <Button size="sm">
                <ReceiptText className="size-3.5" /> Receipt
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Lump sum"
          value={totalCents / 100}
          format={(v) => money(v)}
          icon={<Wallet />}
          hint={`${project.members.length} people`}
        />
        <KpiCard
          label="Paid out"
          value={paidCents / 100}
          format={(v) => money(v)}
          icon={<Banknote />}
          delay={0.06}
          hint={project.payouts.length ? `${project.payouts.length} PayPal payouts` : "Not paid yet"}
        />
        <KpiCard
          label="Work pool"
          value={layers.workPoolCents / 100}
          format={(v) => money(v)}
          icon={<Users />}
          delay={0.12}
          hint={
            layers.finderCents + layers.leadCents > 0
              ? `after ${money((layers.finderCents + layers.leadCents) / 100)} charter fees`
              : "no charter fees"
          }
        />
        <KpiCard
          label="Activities captured"
          value={project.contributions.length}
          format={(v) => Math.round(v).toString()}
          icon={<Activity />}
          delay={0.18}
          hint={quiet > 0 ? `${quiet} quiet-work items` : "synced + logged work"}
        />
      </div>

      {/* Split overview */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{current.label}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">Who gets what, fees included.</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <MoneyDonut
              caption={project.status === "paid" ? "paid out" : "to pay"}
              slices={current.cents.map((c) => ({
                key: c.person,
                name: c.person,
                cents: c.totalCents,
                color: colors[c.person],
              }))}
            />
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {current.cents.map((c) => (
                <li key={c.person} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: colors[c.person] }} aria-hidden />
                  {c.person}
                  <span className="text-muted-foreground">{c.workPct}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="flex flex-col lg:col-span-3">
          <CardHeader>
            <CardTitle>Earnings</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ranked by total. Hatched = charter fees, solid = share of the work pool.
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <EarningsBars
              rows={current.cents.map((c) => ({
                key: c.person,
                name: c.person,
                color: colors[c.person],
                feeCents: c.finderCents + c.leadCents,
                workCents: c.workCents,
              }))}
            />
            <dl className="mt-auto grid grid-cols-3 gap-4 border-t pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Charter fees</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {money((layers.finderCents + layers.leadCents) / 100)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Work pool</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{money(layers.workPoolCents / 100)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Top share</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{spread}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {project.contributions.length > 0 && (
        <div className="mt-6">
          <ContributionInsights project={project} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* What-if */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>What if…</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">Preview only. Marker = equal split.</p>
            </div>
            <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="group" aria-label="What-if mode">
              {(
                [
                  ["current", "Current"],
                  ["equal", "Equal"],
                  ["hours", "Hours"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={whatIf === value}
                  onClick={() => setWhatIf(value)}
                  className="relative rounded-md px-2.5 py-1 text-xs font-medium"
                >
                  {whatIf === value && (
                    <motion.span
                      layoutId="whatif-pill"
                      className="absolute inset-0 rounded-md bg-foreground"
                      transition={{ type: "spring", duration: reduce ? 0 : 0.35, bounce: 0.15 }}
                    />
                  )}
                  <span className={whatIf === value ? "relative text-background" : "relative text-foreground/80"}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {whatIfRows.map((row) => (
              <div key={row.person}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.person}</span>
                  <span className="tabular-nums text-foreground/80">
                    {row.pct}% · {money(row.cents / 100)}
                  </span>
                </div>
                <ShareBar
                  value={row.pct}
                  equalValue={row.equalPct}
                  color={colors[row.person]}
                  showEqual={whatIf !== "equal"}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Payout history */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Payout history</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">PayPal sandbox transactions for this project.</p>
            </div>
            {batchId && <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{batchId}</code>}
          </CardHeader>
          <CardContent>
            {project.payouts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No payouts yet. Approve the split and send payouts to see them here.
              </p>
            ) : (
              <ul className="divide-y">
                {project.payouts.map((p, i) => {
                  const decision = project.decisions.find((d) => d.person === p.person);
                  return (
                    <motion.li
                      key={p.id}
                      initial={reduce ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.06 }}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <Avatar name={p.person} color={colors[p.person]} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.person}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {p.paypalTxnId} {decision ? `· ${decision.finalPct}% of work pool` : ""}
                        </p>
                      </div>
                      <Badge tone={p.status === "completed" ? "emerald" : "amber"}>
                        {p.status === "completed" ? "Sent" : p.status}
                      </Badge>
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{money(p.amount)}</span>
                    </motion.li>
                  );
                })}
              </ul>
            )}
            {project.payouts.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Viewed {formatDateTime(new Date().toISOString())} · sandbox, no live money moved.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
