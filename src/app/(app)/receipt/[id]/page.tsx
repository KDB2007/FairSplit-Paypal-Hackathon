"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import type { Project } from "@/lib/types";
import { fetchProject } from "@/lib/client";
import { formatDateTime, money } from "@/lib/utils";
import { personColorByName } from "@/lib/person-color";
import { PoolWaterfall } from "@/components/explain/split-visuals";
import { MoneyDonut } from "@/components/charts";
import ReceiptPrinter from "@/components/kokonutui/receipt-printer";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, Avatar, Badge, Button, Card, CardContent, PageShell } from "@/components/ui";

export default function ReceiptPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stamped on the client after load, so the server and client renders agree.
  const [printedAt, setPrintedAt] = useState("");

  useEffect(() => {
    fetchProject(projectId)
      .then((p) => {
        setProject(p);
        setPrintedAt(formatDateTime(new Date().toISOString()));
      })
      .catch((err) => setError(err.message));
  }, [projectId]);

  const colors = useMemo(() => (project ? personColorByName(project.members) : {}), [project]);

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
      <PageShell className="max-w-5xl">
        <Skeleton className="h-[36rem] w-full rounded-xl" />
      </PageShell>
    );
  }

  const lead = project.members.find((m) => m.role === "lead") ?? project.members[0];
  const totalCents = project.payouts.reduce((s, p) => s + Math.round(p.amount * 100), 0);
  const batchId = project.payouts[0]?.paypalBatchId ?? "—";
  const paid = project.payouts.length > 0;

  return (
    <PageShell className="max-w-5xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/project/${project.id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" /> Back to project
          </Button>
        </Link>
        <Button onClick={() => window.print()} disabled={!paid}>
          <Printer className="size-4" /> Print receipt
        </Button>
      </div>

      {!paid && (
        <div className="no-print mb-4">
          <Alert tone="warning" title="Payout not sent yet">
            This receipt fills in once the PayPal batch has been sent.
          </Alert>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Printable statement */}
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                    FS
                  </div>
                  <span className="text-lg font-bold">FairSplit</span>
                </div>
                <p className="text-sm text-muted-foreground">Contribution-based team payout receipt</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tracking-wide">PAYOUT RECEIPT</p>
                <p className="text-muted-foreground">{printedAt}</p>
                <Badge tone={paid ? "emerald" : "slate"}>{paid ? "paid" : "unpaid"}</Badge>
              </div>
            </div>

            <div className="grid gap-4 border-b py-6 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Project</p>
                <p className="font-semibold">{project.name}</p>
                <p className="text-muted-foreground">Total lump sum {money(project.totalAmount)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Payer</p>
                <p className="font-semibold">{lead?.name ?? "Team lead"}</p>
                <p className="text-muted-foreground">{lead?.email ?? ""}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">PayPal batch</p>
                <p className="font-mono">{batchId}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Method</p>
                <p className="text-foreground/80">PayPal Payouts (sandbox)</p>
              </div>
            </div>

            <div className="grid gap-6 py-6 md:grid-cols-[minmax(0,1fr)_11rem] md:items-center">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Recipient</th>
                    <th className="py-2">Share</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!paid ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No payouts recorded.
                      </td>
                    </tr>
                  ) : (
                    project.payouts.map((p) => {
                      const decision = project.decisions.find((d) => d.person === p.person);
                      const member = project.members.find((m) => m.name === p.person);
                      const fees = (p.breakdown?.finderCents ?? 0) + (p.breakdown?.leadCents ?? 0);
                      return (
                        <tr key={p.id}>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={p.person} color={colors[p.person]} className="size-7 text-[10px] print:hidden" />
                              <div>
                                <p className="font-medium">{p.person}</p>
                                <p className="text-xs text-muted-foreground">{member?.email}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{p.paypalTxnId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-foreground/80">
                            {decision?.status === "disputed" ? "fees only" : decision ? `${decision.finalPct}% of work pool` : "—"}
                            {fees > 0 && <span className="block text-xs text-muted-foreground">+ {money(fees / 100)} charter fees</span>}
                          </td>
                          <td className="py-2.5 text-right font-semibold tabular-nums">{money(p.amount)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td className="py-3 font-semibold" colSpan={2}>
                      Total paid
                    </td>
                    <td className="py-3 text-right text-lg font-bold tabular-nums">{money(totalCents / 100)}</td>
                  </tr>
                </tfoot>
              </table>
              {paid && (
                <MoneyDonut
                  caption="paid"
                  className="max-w-44"
                  slices={project.payouts.map((p) => ({
                    key: p.id,
                    name: p.person,
                    cents: Math.round(p.amount * 100),
                    color: colors[p.person],
                  }))}
                />
              )}
            </div>

            {paid && (
              <div className="border-t py-6">
                <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                  Breakdown (charter v{project.charterVersion})
                </p>
                <PoolWaterfall
                  totalCents={Math.round(project.totalAmount * 100)}
                  colors={colors}
                  rows={project.payouts.map((p) => ({
                    person: p.person,
                    finderCents: p.breakdown?.finderCents ?? 0,
                    leadCents: p.breakdown?.leadCents ?? 0,
                    workCents: p.breakdown?.workCents ?? Math.round(p.amount * 100),
                  }))}
                />
              </div>
            )}

            <div className="border-t pt-4 text-xs text-muted-foreground">
              <p>
                Sandbox demonstration — no real money was transferred. Charter fees were agreed by every member up front;
                every work-pool share was AI-proposed and human-approved in FairSplit.
              </p>
              <p className="mt-1">
                Project status: {project.status} · Philosophy: {project.philosophy}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* On-screen extra: the batch as a till receipt you can tear off. Never printed. */}
        {paid && (
          <aside className="no-print hidden lg:block">
            <p className="mb-3 text-center text-xs text-muted-foreground">Pull the slip to tear it off</p>
            <ReceiptPrinter
              merchant="FairSplit"
              order={batchId}
              date={printedAt}
              items={project.payouts.map((p) => ({ name: p.person, quantity: 1, price: p.amount }))}
              tax={0}
              currency="$"
            />
          </aside>
        )}
      </div>
    </PageShell>
  );
}
