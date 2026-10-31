import { NextResponse } from "next/server";
import { amountFor, getProject, listProjects, summarise } from "@/lib/store";
import type { Payout } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/dashboard?projectId=... — chart data + payout history. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const project = projectId ? getProject(projectId) : undefined;
  if (!project) {
    return NextResponse.json(
      { projects: listProjects().map(summarise) },
      { status: projectId ? 404 : 200 }
    );
  }

  const chartData = (project.decisions.length
    ? project.decisions
    : project.proposals.map((p) => ({
        person: p.person,
        finalPct: p.percentage,
        status: "proposed",
      }))
  ).map((d) => ({
    person: d.person,
    percentage: "finalPct" in d ? d.finalPct : 0,
    amount: amountFor("finalPct" in d ? d.finalPct : 0, project.totalAmount),
  }));

  const payoutHistory = project.payouts.map((p: Payout) => ({
    id: p.id,
    person: p.person,
    amount: p.amount,
    status: p.status,
    batchId: p.paypalBatchId,
    txnId: p.paypalTxnId,
    receiptUrl: p.receiptUrl,
  }));

  return NextResponse.json({
    project: summarise(project),
    chartData,
    payoutHistory,
    totalPaid: payoutHistory
      .filter((p) => p.status === "completed" || p.status === "pending")
      .reduce((s, p) => s + p.amount, 0),
    projects: listProjects().map(summarise),
  });
}
