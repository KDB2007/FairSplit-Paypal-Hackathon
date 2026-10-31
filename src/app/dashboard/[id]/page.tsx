"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Project } from "@/lib/types";
import { fetchProject } from "@/lib/client";
import { amountFor, equalSplit, hoursSplit } from "@/lib/split";
import { formatDateTime, money } from "@/lib/utils";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageShell,
  Progress,
  Spinner,
} from "@/components/ui";
import { SplitPie, type Slice } from "@/components/charts";

export default function DashboardPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merit" | "equal" | "hours">("merit");

  useEffect(() => {
    fetchProject(projectId)
      .then(setProject)
      .catch((err) => setError(err.message));
  }, [projectId]);

  const rows = useMemo(() => {
    if (!project) return [] as Array<{ person: string; pct: number }>;
    if (mode === "equal") return equalSplit(project.members);
    if (mode === "hours") return hoursSplit(project);
    if (project.decisions.length) {
      return project.decisions.map((d) => ({ person: d.person, pct: d.finalPct }));
    }
    return project.proposals.map((p) => ({ person: p.person, pct: p.percentage }));
  }, [project, mode]);

  const slices: Slice[] = useMemo(
    () =>
      project
        ? rows.map((r) => ({
            name: r.person,
            value: r.pct,
            amount: amountFor(r.pct, project.totalAmount),
          }))
        : [],
    [rows, project]
  );

  if (error) {
    return (
      <PageShell>
        <Alert tone="error" title="Could not load dashboard">
          {error}
        </Alert>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Loading dashboard…
        </div>
      </PageShell>
    );
  }

  const totalPaid = project.payouts.reduce((s, p) => s + p.amount, 0);
  const batchId = project.payouts[0]?.paypalBatchId;

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-600">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/project/${project.id}`} className="hover:text-blue-600">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-slate-700">Dashboard</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {project.name} dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Final split and payout history for a {money(project.totalAmount)} lump sum.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="emerald">{project.status}</Badge>
            <Link href={`/project/${project.id}`}>
              <Button variant="outline" size="sm">
                Back to flow
              </Button>
            </Link>
            {project.payouts.length > 0 && (
              <Link href={`/receipt/${project.id}`}>
                <Button size="sm">Receipt</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Split by person</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              Pie chart of the current {mode === "merit" ? "approved/AI" : mode} split.
            </p>
          </CardHeader>
          <CardContent>
            {slices.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No split available yet. Score with AI first.
              </p>
            ) : (
              <SplitPie data={slices} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total lump sum</span>
                <span className="font-semibold text-slate-900">
                  {money(project.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total paid</span>
                <span className="font-semibold text-emerald-600">{money(totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Members</span>
                <span className="font-medium text-slate-800">{project.members.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Batch</span>
                <span className="font-mono text-xs text-slate-600">{batchId ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What-if</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">Live, client-side only.</p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5">
                {(
                  [
                    { value: "equal", label: "Equal" },
                    { value: "merit", label: "Merit" },
                    { value: "hours", label: "Hours" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                      (mode === opt.value
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={row.person}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{row.person}</span>
                      <span className="text-slate-600">
                        {row.pct}% · {money(amountFor(row.pct, project.totalAmount))}
                      </span>
                    </div>
                    <Progress value={row.pct} tone={index % 2 === 0 ? "blue" : "emerald"} />
                  </div>
                ))}
                {rows.length === 0 && (
                  <p className="text-sm text-slate-500">Nothing to preview yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
          <p className="mt-0.5 text-sm text-slate-500">
            Sandbox transactions for this project.
          </p>
        </CardHeader>
        <CardContent>
          {project.payouts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No payouts yet. Approve the split and send payouts to see history here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Recipient</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Transaction</th>
                    <th className="px-2 py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {project.payouts.map((p) => {
                    const decision = project.decisions.find((d) => d.person === p.person);
                    return (
                      <tr key={p.id}>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={p.person} className="h-7 w-7 text-[10px]" />
                            <div>
                              <p className="font-medium text-slate-800">{p.person}</p>
                              <p className="text-xs text-slate-500">
                                {decision ? `${decision.finalPct}%` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 font-semibold text-slate-900">
                          {money(p.amount)}
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={p.status === "completed" ? "emerald" : "amber"}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2.5 font-mono text-xs text-slate-500">
                          {p.paypalTxnId}
                        </td>
                        <td className="px-2 py-2.5">
                          <Link
                            href={`/receipt/${project.id}`}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-400">
                Generated {formatDateTime(new Date().toISOString())} · sandbox only.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
