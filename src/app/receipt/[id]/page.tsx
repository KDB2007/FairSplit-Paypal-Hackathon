"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Project } from "@/lib/types";
import { fetchProject } from "@/lib/client";
import { formatDateTime, money } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  PageShell,
  Spinner,
} from "@/components/ui";

export default function ReceiptPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProject(projectId)
      .then(setProject)
      .catch((err) => setError(err.message));
  }, [projectId]);

  if (error) {
    return (
      <PageShell>
        <Alert tone="error" title="Could not load receipt">
          {error}
        </Alert>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Loading receipt…
        </div>
      </PageShell>
    );
  }

  const lead = project.members.find((m) => m.role === "lead") ?? project.members[0];
  const total = project.payouts.reduce((s, p) => s + p.amount, 0);
  const batchId = project.payouts[0]?.paypalBatchId ?? "—";

  return (
    <PageShell className="max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/project/${project.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to project
        </Link>
        <Button onClick={() => window.print()}>Print receipt</Button>
      </div>

      {project.status !== "paid" && (
        <div className="no-print mb-4">
          <Alert tone="warning" title="Payout not sent yet">
            This receipt will populate once payouts are executed.
          </Alert>
        </div>
      )}

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                  FS
                </div>
                <span className="text-lg font-bold text-slate-900">FairSplit</span>
              </div>
              <p className="text-sm text-slate-500">
                Contribution-based team payout receipt
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-900">PAYOUT RECEIPT</p>
              <p className="text-slate-500">{formatDateTime(new Date().toISOString())}</p>
              <Badge tone={project.payouts.length ? "emerald" : "slate"}>
                {project.payouts.length ? "paid" : "unpaid"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 py-6 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Project</p>
              <p className="font-semibold text-slate-900">{project.name}</p>
              <p className="text-slate-500">Total lump sum {money(project.totalAmount)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Payer</p>
              <p className="font-semibold text-slate-900">{lead?.name ?? "Team lead"}</p>
              <p className="text-slate-500">{lead?.email ?? ""}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">PayPal batch</p>
              <p className="font-mono text-slate-800">{batchId}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Method</p>
              <p className="text-slate-700">PayPal Payouts (sandbox)</p>
            </div>
          </div>

          <div className="py-6">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2">Recipient</th>
                  <th className="py-2">Share</th>
                  <th className="py-2">Transaction</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {project.payouts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No payouts recorded.
                    </td>
                  </tr>
                ) : (
                  project.payouts.map((p) => {
                    const decision = project.decisions.find((d) => d.person === p.person);
                    const member = project.members.find((m) => m.name === p.person);
                    return (
                      <tr key={p.id}>
                        <td className="py-2.5">
                          <p className="font-medium text-slate-900">{p.person}</p>
                          <p className="text-xs text-slate-500">{member?.email}</p>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {decision ? `${decision.finalPct}%` : "—"}
                        </td>
                        <td className="py-2.5 font-mono text-xs text-slate-500">
                          {p.paypalTxnId}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {money(p.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td className="py-3 font-semibold text-slate-900" colSpan={3}>
                    Total paid
                  </td>
                  <td className="py-3 text-right text-lg font-bold text-slate-900">
                    {money(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="border-t border-slate-200 pt-4 text-xs text-slate-400">
            <p>
              Sandbox demonstration — no real money was transferred. Every split
              percentage was AI-proposed and human-approved in FairSplit.
            </p>
            <p className="mt-1">
              Project status: {project.status} · Philosophy: {project.philosophy}
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
