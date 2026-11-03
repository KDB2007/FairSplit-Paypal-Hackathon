"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Clock, Copy, LayoutDashboard, ReceiptText } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import type { Project } from "@/lib/types";
import { payableAllocations } from "@/lib/layers";
import { cn, money } from "@/lib/utils";
import { personColorByName } from "@/lib/person-color";
import SlideToConfirm from "@/components/kokonutui/slide-to-confirm";
import { NumberTicker } from "@/components/motion/number-ticker";
import { Alert, Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

type Stage = "ready" | "flowing" | "done";

const STAGGER_MS = 260;

/**
 * Payout, the second hero moment: slide to confirm, then the total breaks
 * into one stream per person that lands on their card (a shared-layout
 * animation, so each segment really travels), each card flips from Pending to
 * Sent, and one small confetti burst closes it. A project that is already paid
 * renders the finished state with no animation.
 */
export function PayoutStep({
  project,
  onPay,
  onBack,
  result,
}: {
  project: Project;
  /** Sends the batch; resolves once the server has answered. */
  onPay: () => Promise<boolean>;
  onBack: () => void;
  result: { batchId: string; simulated: boolean; message: string } | null;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const colors = useMemo(() => personColorByName(project.members), [project.members]);
  const lines = useMemo(() => payableAllocations(project, project.decisions), [project]);
  const totalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const alreadyPaid = project.status === "paid" && result === null;

  const [stage, setStage] = useState<Stage>(alreadyPaid ? "done" : "ready");
  /** How many people's streams have landed so far. */
  const [landed, setLanded] = useState(alreadyPaid ? lines.length : 0);
  const timers = useRef<number[]>([]);
  const redirectTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    },
    []
  );

  // The receipt is the record of a paid project: once the payout has visibly
  // settled, move there automatically instead of leaving the user on a
  // completed payout screen. The pause lets the confirmation and confetti read.
  //
  // Next's client router keeps this page mounted during a transition, so a
  // manual click on "Dashboard" doesn't unmount it (and doesn't cancel this
  // effect) until the new route is ready — this timer could otherwise fire
  // mid-transition and yank the user back to the receipt. cancelAutoRedirect,
  // called from both buttons below, closes that race explicitly.
  useEffect(() => {
    if (stage !== "done") return;
    const timer = window.setTimeout(() => {
      redirectTimer.current = null;
      router.replace(`/receipt/${project.id}`);
    }, reduce ? 900 : 1800);
    redirectTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [stage, reduce, router, project.id]);

  function cancelAutoRedirect() {
    if (redirectTimer.current !== null) {
      window.clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
    }
  }

  async function pay() {
    const ok = await onPay();
    if (!ok) throw new Error("Payout failed"); // keeps the slider from showing "Paid"
    if (reduce) {
      setLanded(lines.length);
      setStage("done");
      return;
    }
    setStage("flowing");
    lines.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setLanded(i + 1), 350 + i * STAGGER_MS));
    });
    timers.current.push(
      window.setTimeout(() => {
        setStage("done");
        confetti({
          particleCount: 70,
          spread: 70,
          startVelocity: 32,
          origin: { y: 0.55 },
          scalar: 0.85,
          ticks: 140,
          disableForReducedMotion: true,
        });
      }, 350 + lines.length * STAGGER_MS + 450)
    );
  }

  const batchId = result?.batchId ?? project.payouts[0]?.paypalBatchId;
  const simulated = result ? result.simulated : project.payouts.every((p) => p.status === "completed");

  if (project.decisions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <Alert tone="warning">Approve a split before paying out.</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>PayPal payout</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              One batch pays every approved member their fees plus their share of the work pool.
            </p>
          </div>
          <Badge tone={stage === "done" ? "emerald" : "slate"}>
            {stage === "done" ? (simulated ? "Simulated sandbox" : "PayPal sandbox") : `${lines.length} recipients`}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-8">
          <LayoutGroup id="money-flow">
            {/* The total, as one bar of per-person streams */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <NumberTicker value={totalCents / 100} format={(v) => money(v)} className="text-2xl font-semibold" />
              </div>
              <div className="flex h-5 gap-1 rounded-full bg-muted p-0.5" role="img" aria-label="Payout split by person">
                {lines.map((line, i) =>
                  i >= landed ? (
                    <motion.div
                      key={line.person}
                      layoutId={`stream-${line.person}`}
                      className="h-full rounded-full"
                      style={{ backgroundColor: colors[line.person], width: `${(line.totalCents / Math.max(1, totalCents)) * 100}%` }}
                      transition={{ type: "spring", stiffness: 140, damping: 20 }}
                    />
                  ) : (
                    // Emptied slot: dashed while money is still moving, a faint tint once it's all settled.
                    <div
                      key={line.person}
                      className={cn(
                        "h-full rounded-full transition-colors duration-500",
                        stage !== "done" && "border border-dashed border-muted-foreground/30"
                      )}
                      style={{
                        width: `${(line.totalCents / Math.max(1, totalCents)) * 100}%`,
                        backgroundColor:
                          stage === "done" ? `color-mix(in oklch, ${colors[line.person]} 28%, transparent)` : undefined,
                      }}
                    />
                  )
                )}
              </div>
            </div>

            {/* One card per recipient: the stream lands here */}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lines.map((line, i) => {
                const member = project.members.find((m) => m.name === line.person);
                const decision = project.decisions.find((d) => d.person === line.person);
                const payout = project.payouts.find((p) => p.person === line.person);
                const sent = i < landed;
                const fees = line.finderCents + line.leadCents;
                return (
                  <li
                    key={line.person}
                    className={cn(
                      "relative rounded-xl border bg-card p-4 transition-colors duration-500",
                      sent && "border-success/40"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={line.person} color={colors[line.person]} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{line.person}</p>
                        <p className="truncate text-xs text-muted-foreground">{member?.email || "no email"}</p>
                      </div>
                      <AnimatePresence mode="wait" initial={false}>
                        {sent ? (
                          <motion.span
                            key="sent"
                            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          >
                            <motion.span
                              initial={reduce ? false : { pathLength: 0, scale: 0.4 }}
                              animate={{ pathLength: 1, scale: 1 }}
                              className="inline-flex"
                            >
                              <Check className="size-3" />
                            </motion.span>
                            {payout?.status === "pending" ? "Processing" : "Sent"}
                          </motion.span>
                        ) : (
                          <motion.span
                            key="pending"
                            exit={reduce ? undefined : { opacity: 0, scale: 0.8 }}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            <Clock className="size-3" /> Pending
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="mt-3 h-2 rounded-full bg-muted">
                      {sent && (
                        <motion.div
                          layoutId={`stream-${line.person}`}
                          className="h-full w-full rounded-full"
                          style={{ backgroundColor: colors[line.person] }}
                          transition={{ type: "spring", stiffness: 140, damping: 20 }}
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {decision?.status === "disputed" ? "Disputed — fees only" : `${line.workPct}% of work pool`}
                        {fees > 0 && <span className="block">+ {money(fees / 100)} charter fees</span>}
                      </div>
                      <span className="text-lg font-semibold tabular-nums">{money(line.totalCents / 100)}</span>
                    </div>
                    {sent && payout?.paypalTxnId && (
                      <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{payout.paypalTxnId}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </LayoutGroup>

          {stage === "ready" && (
            <div className="mx-auto max-w-md">
              <SlideToConfirm
                label={`Slide to pay ${money(totalCents / 100)}`}
                confirmingLabel="Sending the PayPal batch…"
                doneLabel="Paid"
                resetAfter={null}
                onConfirm={pay}
                className="w-full"
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Sandbox only. No live money moves.
              </p>
            </div>
          )}

          <AnimatePresence>
            {stage === "done" && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <Alert tone="success" title="Payout complete">
                  {result?.message ?? "Sandbox payout already sent. No live money moved."}
                  <span className="mt-1 block text-xs opacity-80">Opening the receipt…</span>
                </Alert>
                {batchId && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                    <span className="text-muted-foreground">PayPal batch</span>
                    <span className="flex items-center gap-2">
                      <code className="font-mono">{batchId}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Copy batch ID"
                        onClick={() => {
                          void navigator.clipboard?.writeText(batchId).then(() => toast.success("Batch ID copied"));
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/receipt/${project.id}`} onClick={cancelAutoRedirect}>
                    <Button>
                      <ReceiptText className="size-4" /> Receipt
                    </Button>
                  </Link>
                  <Link href={`/dashboard/${project.id}`} onClick={cancelAutoRedirect}>
                    <Button variant="outline">
                      <LayoutDashboard className="size-4" /> Dashboard
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {stage === "ready" && (
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back to review
        </Button>
      )}
    </div>
  );
}
