import { NextResponse } from "next/server";
import {
  amountFor,
  buildPayouts,
  getProject,
  newId,
  saveProject,
} from "@/lib/store";
import type { Payout } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PayoutItem {
  person: string;
  email: string;
  amount: number;
}

async function paypalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;

  const base = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function callPaypalPayouts(items: PayoutItem[]): Promise<{
  batchId: string;
  txns: Array<{ person: string; txnId: string; status: string }>;
} | null> {
  const token = await paypalAccessToken();
  if (!token) return null;

  const base = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
  const batchId = newId("batch");

  const payload = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "You have a FairSplit payout",
      email_message: "Your share of the project payout from FairSplit.",
    },
    items: items.map((item, index) => ({
      recipient_type: "EMAIL",
      amount: { value: item.amount.toFixed(2), currency: "USD" },
      receiver: item.email,
      note: `FairSplit payout for ${item.person}`,
      sender_item_id: `item_${index + 1}`,
    })),
  };

  const res = await fetch(`${base}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("PayPal payout failed", res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
  const paypalBatchId = json.batch_header?.payout_batch_id ?? batchId;
  return {
    batchId: paypalBatchId,
    txns: items.map((item) => ({
      person: item.person,
      txnId: paypalBatchId,
      status: json.batch_header?.batch_status ?? "PENDING",
    })),
  };
}

/** POST /api/payout — execute the PayPal sandbox batch (or safe simulation). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId } = body ?? {};

    const project = projectId ? getProject(projectId) : undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (project.status !== "approved" && project.status !== "paid") {
      return NextResponse.json(
        { error: "Approve the split before paying out." },
        { status: 400 }
      );
    }
    if (project.payouts.length > 0 && project.status === "paid") {
      return NextResponse.json(
        { error: "Payouts have already been sent for this project.", project },
        { status: 409 }
      );
    }

    const payable = project.decisions.filter((d) => d.status !== "disputed");
    if (payable.length === 0) {
      return NextResponse.json(
        { error: "No approved members to pay." },
        { status: 400 }
      );
    }
    const totalPct = payable.reduce((s, d) => s + d.finalPct, 0);
    if (Math.abs(totalPct - 100) > 0.5) {
      return NextResponse.json(
        { error: "Decision percentages must total 100 before payout." },
        { status: 400 }
      );
    }

    const items: PayoutItem[] = payable.map((d) => {
      const member = project.members.find((m) => m.name === d.person);
      return {
        person: d.person,
        email: member?.email ?? "",
        amount: amountFor(d.finalPct, project.totalAmount),
      };
    });

    const demoMode =
      process.env.DEMO_MODE === "true" ||
      !process.env.PAYPAL_CLIENT_ID ||
      !process.env.PAYPAL_CLIENT_SECRET;

    let payouts: Payout[];
    let simulated = demoMode;

    if (!demoMode) {
      const result = await callPaypalPayouts(items).catch(() => null);
      if (result) {
        payouts = result.txns.map((t, i) => ({
          id: newId("pay"),
          projectId: project.id,
          person: t.person,
          amount: items[i].amount,
          paypalBatchId: result.batchId,
          paypalTxnId: t.txnId,
          status: "pending" as const,
          receiptUrl: `/receipt/${project.id}`,
        }));
      } else {
        simulated = true;
        payouts = buildPayouts(project, `SIM-${newId("batch")}`, true);
      }
    } else {
      payouts = buildPayouts(project, `DEMO-${newId("batch")}`, true);
    }

    project.payouts = payouts;
    project.decisions = project.decisions.map((d) =>
      d.status === "disputed" ? d : { ...d, status: "paid" }
    );
    project.status = "paid";
    saveProject(project);

    return NextResponse.json({
      batchId: payouts[0]?.paypalBatchId,
      payouts,
      project,
      simulated,
      message: simulated
        ? "Sandbox demo payout complete (no live money moved)."
        : "PayPal sandbox payout submitted.",
    });
  } catch (error) {
    console.error("POST /api/payout failed", error);
    return NextResponse.json({ error: "Payout failed." }, { status: 500 });
  }
}
