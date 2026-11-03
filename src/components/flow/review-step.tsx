"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Lock, LockOpen, ShieldAlert } from "lucide-react";
import type { Project } from "@/lib/types";
import { redistribute } from "@/lib/split";
import { allocate } from "@/lib/layers";
import { cn, money } from "@/lib/utils";
import { personColorByName } from "@/lib/person-color";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NumberTicker } from "@/components/motion/number-ticker";
import { PoolWaterfall } from "@/components/explain/split-visuals";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Spinner } from "@/components/ui";

export interface DecisionRow {
  person: string;
  pct: number;
  note: string;
  status: "proposed" | "approved" | "disputed";
  locked: boolean;
}

/** The "work pool = 100%" ring: fills as shares add up and turns green at exactly 100. */
function TotalRing({ total }: { total: number }) {
  const reduce = useReducedMotion();
  const exact = Math.abs(total - 100) < 0.01;
  const r = 15;
  const c = 2 * Math.PI * r;
  const fill = Math.min(100, Math.max(0, total)) / 100;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <motion.circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - fill) }}
          transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={exact ? "stroke-success" : "stroke-destructive"}
        />
      </svg>
      <div className="text-sm leading-tight">
        <p className={cn("flex items-center gap-1 font-semibold", exact ? "text-success" : "text-destructive")}>
          {exact && <Check className="size-3.5" />}
          Work pool <NumberTicker value={total} format={(v) => `${v.toFixed(2)}%`} />
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" /> Charter fees locked
        </p>
      </div>
    </div>
  );
}

export function ReviewStep({
  project,
  decisions,
  setDecisions,
  busy,
  onSave,
  onApprove,
  onBack,
}: {
  project: Project;
  decisions: DecisionRow[];
  setDecisions: React.Dispatch<React.SetStateAction<DecisionRow[]>>;
  busy: string | null;
  onSave: () => void;
  onApprove: () => void;
  onBack: () => void;
}) {
  const reduce = useReducedMotion();
  const colors = useMemo(() => personColorByName(project.members), [project.members]);
  const [disputing, setDisputing] = useState<{ index: number; note: string } | null>(null);
  // Rows the user didn't touch but which moved because another share changed.
  const [flash, setFlash] = useState<Record<string, number>>({});
  const flashSeq = useRef(0);

  const allocations = useMemo(
    () => allocate(project, decisions.map((d) => ({ person: d.person, pct: d.pct }))),
    [project, decisions]
  );
  const total = decisions.reduce((s, d) => s + d.pct, 0);
  const paidCents = allocations.reduce((sum, a) => sum + a.totalCents, 0);

  function updatePct(index: number, value: number) {
    setDecisions((prev) => {
      const next = redistribute(prev.map((d) => d.pct), index, value, prev.map((d) => d.locked));
      const moved: Record<string, number> = {};
      prev.forEach((d, i) => {
        if (i !== index && Math.abs(next[i] - d.pct) >= 0.01) moved[d.person] = ++flashSeq.current;
      });
      if (Object.keys(moved).length) setFlash((f) => ({ ...f, ...moved }));
      // A human-edited share is pinned; later edits rescale the rest around it.
      return prev.map((d, i) => ({ ...d, pct: next[i], locked: i === index ? true : d.locked }));
    });
  }

  const patch = (index: number, change: Partial<DecisionRow>) =>
    setDecisions((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));

  if (decisions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Score with AI first to generate a proposal.
          <div className="mt-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4" /> AI scoring
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <CardTitle>Review the split</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              AI proposes, you decide. Shares are of the work pool; charter fees are fixed and paid on top. An edited
              share is pinned and the others rescale around it.
            </p>
          </div>
          <TotalRing total={total} />
        </CardHeader>
        <CardContent className="space-y-3">
          {project.scoredSplit && project.scoredSplit.formula.notes.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-foreground/80">Scoring notes</p>
              <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
                {project.scoredSplit.formula.notes.map((note) => (
                  <li key={note} className="flex gap-1.5">
                    <span className="text-muted-foreground/60" aria-hidden>
                      ·
                    </span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {decisions.map((d, index) => {
            const proposal = project.proposals.find((p) => p.person === d.person);
            const cents = allocations[index];
            const feeCents = cents ? cents.finderCents + cents.leadCents : 0;
            const color = colors[d.person];
            return (
              <motion.div
                key={d.person}
                layout={!reduce}
                className={cn(
                  "relative overflow-hidden rounded-xl border p-4 transition-colors",
                  d.status === "disputed" && "border-destructive/40 bg-destructive/5",
                  d.status === "approved" && "border-success/40"
                )}
              >
                {/* Brief highlight when this row was rescaled by an edit elsewhere. */}
                {flash[d.person] && !reduce && (
                  <motion.span
                    key={flash[d.person]}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-warning"
                    initial={{ opacity: 0.22 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                  />
                )}
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={d.person} color={color} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {d.person}
                        {cents?.finderCents ? <Badge tone="amber">Finder</Badge> : null}
                        {cents?.leadCents ? <Badge tone="blue">Lead</Badge> : null}
                        {d.status === "approved" && <Badge tone="emerald"><Check className="size-3" /> Approved</Badge>}
                        {d.status === "disputed" && <Badge tone="rose">Disputed</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        AI proposed {proposal ? `${proposal.percentage}%` : "—"} ·{" "}
                        <NumberTicker value={(cents?.workCents ?? 0) / 100} format={(v) => money(v)} /> work
                        {feeCents > 0 && ` + ${money(feeCents / 100)} fees`} ={" "}
                        <NumberTicker
                          value={(cents?.totalCents ?? 0) / 100}
                          format={(v) => money(v)}
                          className="font-semibold text-foreground"
                        />
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => patch(index, { locked: !d.locked })}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        d.locked && "text-primary"
                      )}
                      title={d.locked ? "Pinned — others rescale around this share. Click to unpin." : "Not pinned"}
                      aria-pressed={d.locked}
                      aria-label={d.locked ? `Unpin ${d.person}'s share` : `Pin ${d.person}'s share`}
                    >
                      {d.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                    </button>
                    <div className="relative w-24">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={d.pct}
                        onChange={(e) => updatePct(index, Number(e.target.value))}
                        className="pr-7 text-right font-semibold tabular-nums"
                        aria-label={`${d.person}'s share of the work pool`}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <Slider
                  className="relative mt-3 py-1.5 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-range]]:bg-(--range)"
                  style={{ "--range": color } as React.CSSProperties}
                  min={0}
                  max={100}
                  step={0.5}
                  value={[d.pct]}
                  onValueChange={(value) => updatePct(index, Array.isArray(value) ? value[0] : value)}
                  aria-label={`${d.person}'s share slider`}
                />

                {proposal && <p className="relative mt-2 text-sm text-foreground/80">{proposal.reason}</p>}

                <div className="relative mt-3 grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-8">
                    <Label htmlFor={`note-${index}`}>Override / dispute note (optional)</Label>
                    <Input
                      id={`note-${index}`}
                      value={d.note}
                      onChange={(e) => patch(index, { note: e.target.value })}
                      placeholder="e.g. Maya handled more client comms than logged"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Label>Decision</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={d.status === "approved" ? "primary" : "outline"}
                        onClick={() => patch(index, { status: "approved" })}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant={d.status === "disputed" ? "danger" : "outline"}
                        onClick={() => setDisputing({ index, note: d.note })}
                      >
                        <ShieldAlert className="size-3.5" /> Dispute
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <span className="text-foreground/80">Paid out in total (fees + work pool)</span>
            <NumberTicker value={paidCents / 100} format={(v) => money(v)} className="font-semibold" />
          </div>

          <div className="flex flex-wrap justify-between gap-3 pt-2">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="size-4" /> AI scoring
              </Button>
              <Button variant="outline" onClick={onSave} disabled={busy !== null}>
                {busy === "save" ? <Spinner /> : "Save review"}
              </Button>
            </div>
            <Button size="lg" onClick={onApprove} disabled={busy !== null || Math.abs(total - 100) > 0.5}>
              {busy === "approve" ? (
                <>
                  <Spinner /> Approving…
                </>
              ) : (
                <>
                  Approve all & continue <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where the money goes</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Charter fees come off the top; the work pool follows the shares above, live as you edit.
          </p>
        </CardHeader>
        <CardContent>
          <PoolWaterfall totalCents={Math.round(project.totalAmount * 100)} rows={allocations} colors={colors} />
        </CardContent>
      </Card>

      <AlertDialog open={disputing !== null} onOpenChange={(open) => !open && setDisputing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispute {disputing ? decisions[disputing.index]?.person : ""}&apos;s share?</AlertDialogTitle>
            <AlertDialogDescription>
              A disputed share is withheld at payout; their charter fees are still paid. Say why so the team can
              resolve it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={disputing?.note ?? ""}
            onChange={(e) => setDisputing((d) => (d ? { ...d, note: e.target.value } : d))}
            placeholder="e.g. Commits were pair-programmed with Leo"
            aria-label="Reason for the dispute"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              disabled={!disputing?.note.trim()}
              onClick={() => {
                if (!disputing) return;
                patch(disputing.index, { status: "disputed", note: disputing.note.trim() });
                setDisputing(null);
              }}
            >
              Mark as disputed
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
