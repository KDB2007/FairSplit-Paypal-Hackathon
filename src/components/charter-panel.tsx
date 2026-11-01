"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, ChevronDown, PenLine, RotateCcw } from "lucide-react";
import type { PoolConfig, Project, SplitPhilosophy } from "@/lib/types";
import { confirmCharter, savePoolConfig, setMemberConfirmation } from "@/lib/client";
import { MAX_FINDER_BPS, MAX_LEAD_BPS, layerAmounts } from "@/lib/layers";
import { toCents } from "@/lib/explain/rounding";
import { cn, money } from "@/lib/utils";
import { personColorByName } from "@/lib/person-color";
import { Slider } from "@/components/ui/slider";
import HoldButton from "@/components/kokonutui/hold-button";
import { NumberTicker } from "@/components/motion/number-ticker";
import { PoolWaterfall } from "@/components/explain/split-visuals";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Select, Spinner } from "@/components/ui";

type Draft = Omit<PoolConfig, "version">;

function draftFrom(project: Project): Draft {
  const config = project.poolConfig;
  return {
    finderBps: config?.finderBps ?? 0,
    finderMemberId: config?.finderMemberId ?? null,
    leadBps: config?.leadBps ?? 0,
    leadMemberId: config?.leadMemberId ?? null,
    workPhilosophy: config?.workPhilosophy ?? project.philosophy,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.finderBps === b.finderBps &&
    a.finderMemberId === b.finderMemberId &&
    a.leadBps === b.leadBps &&
    a.leadMemberId === b.leadMemberId &&
    a.workPhilosophy === b.workPhilosophy
  );
}

const PHILOSOPHY_LABEL: Record<SplitPhilosophy, string> = {
  merit: "Merit (AI-judged)",
  hybrid: "Hybrid (merit + hours)",
  equal: "Equal",
};

/**
 * The charter: fixed fees off the top (finder, lead), how the work pool is
 * split, and every member's sign-off on this exact version. Scoring stays
 * locked until all members confirm; any edit starts a new version.
 *
 * Key this component by charter version so a saved edit resets the draft.
 */
export function CharterPanel({
  project,
  onProjectUpdate,
  onError,
}: {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  onError: (message: string) => void;
}) {
  const reduce = useReducedMotion();
  const saved = useMemo(() => draftFrom(project), [project]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState<string | null>(null);

  const confirmedCount = project.members.filter((m) => m.confirmed).length;
  const unlocked = Boolean(project.poolConfig) && confirmedCount === project.members.length;
  const paid = project.status === "paid";
  const [open, setOpen] = useState(!unlocked);

  const dirty = !sameDraft(draft, saved);
  const totalCents = toCents(project.totalAmount);
  const layers = layerAmounts(totalCents, draft);
  const colors = personColorByName(project.members);

  // Rows for the waterfall: each fee recipient, plus the shared work pool.
  const rows = project.members
    .map((m) => ({
      person: m.name,
      finderCents: m.id === layers.finderMemberId ? layers.finderCents : 0,
      leadCents: m.id === layers.leadMemberId ? layers.leadCents : 0,
      workCents: 0,
    }))
    .filter((row) => row.finderCents + row.leadCents > 0);

  async function act(key: string, action: () => Promise<Project>) {
    setBusy(key);
    try {
      onProjectUpdate(await action());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the charter.");
    } finally {
      setBusy(null);
    }
  }

  const fees = [
    {
      key: "finder" as const,
      label: "Finder fee",
      hint: "For whoever brought in the work",
      bps: draft.finderBps,
      max: MAX_FINDER_BPS,
      cents: layers.finderCents,
      memberId: draft.finderMemberId,
      track: "[&_[data-slot=slider-range]]:bg-highlight",
      dot: "bg-highlight",
      none: "No finder",
    },
    {
      key: "lead" as const,
      label: "Lead fee",
      hint: "For running the project",
      bps: draft.leadBps,
      max: MAX_LEAD_BPS,
      cents: layers.leadCents,
      memberId: draft.leadMemberId,
      track: "[&_[data-slot=slider-range]]:bg-info",
      dot: "bg-info",
      none: "No lead fee",
    },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            Charter <span className="text-muted-foreground">v{project.charterVersion ?? 1}</span>
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {money(layers.finderCents / 100)} finder · {money(layers.leadCents / 100)} lead ·{" "}
            {money(layers.workPoolCents / 100)} work pool, split by {PHILOSOPHY_LABEL[saved.workPhilosophy].toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={unlocked ? "emerald" : "amber"}>
            {unlocked ? (
              <>
                <Check className="size-3" /> Scoring unlocked
              </>
            ) : (
              `${confirmedCount}/${project.members.length} signed`
            )}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "Edit"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <CardContent className="space-y-6">
              {/* Live waterfall */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <PoolWaterfall
                  totalCents={totalCents}
                  rows={rows}
                  colors={colors}
                  workPoolCents={layers.workPoolCents}
                  showTable={false}
                />
              </div>

              <fieldset disabled={paid || busy !== null} className="grid gap-5 md:grid-cols-3">
                {fees.map((fee) => (
                  <div key={fee.key} className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label className="mb-0 flex items-center gap-2 text-foreground">
                        <span className={cn("size-2 rounded-full", fee.dot)} aria-hidden />
                        {fee.label}
                      </Label>
                      <span className="text-sm font-semibold tabular-nums">
                        {(fee.bps / 100).toFixed(1)}% ·{" "}
                        <NumberTicker value={fee.cents / 100} format={(v) => money(v)} className="text-muted-foreground" />
                      </span>
                    </div>
                    <Slider
                      className={cn(
                        fee.track,
                        "py-1.5 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:shadow-sm [&_[data-slot=slider-track]]:h-1.5"
                      )}
                      min={0}
                      max={fee.max / 100}
                      step={0.5}
                      value={[fee.bps / 100]}
                      onValueChange={(value) => {
                        const pct = Array.isArray(value) ? value[0] : value;
                        setDraft((d) => ({ ...d, [`${fee.key}Bps`]: Math.round(pct * 100) }));
                      }}
                      aria-label={`${fee.label} percent`}
                    />
                    <Select
                      value={fee.memberId ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [`${fee.key}MemberId`]: e.target.value || null }))}
                      aria-label={`${fee.label} recipient`}
                    >
                      <option value="">{fee.none}</option>
                      {project.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {fee.hint}. Max {fee.max / 100}%{fee.bps > 0 && !fee.memberId ? " — pick a recipient, or it stays in the work pool." : "."}
                    </p>
                  </div>
                ))}
                <div className="space-y-3">
                  <Label className="mb-0 flex items-center gap-2 text-foreground">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    Work pool split
                  </Label>
                  <Select
                    value={draft.workPhilosophy}
                    onChange={(e) => setDraft((d) => ({ ...d, workPhilosophy: e.target.value as SplitPhilosophy }))}
                  >
                    {(Object.keys(PHILOSOPHY_LABEL) as SplitPhilosophy[]).map((p) => (
                      <option key={p} value={p}>
                        {PHILOSOPHY_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The AI proposes shares of what&apos;s left; you can override every one in review.
                  </p>
                </div>
              </fieldset>

              {/* Who gets what */}
              <div>
                <Label className="text-foreground">Who gets what</Label>
                <ul className="flex flex-wrap gap-2">
                  {project.members.map((m) => {
                    const finder = m.id === layers.finderMemberId ? layers.finderCents : 0;
                    const lead = m.id === layers.leadMemberId ? layers.leadCents : 0;
                    return (
                      <motion.li
                        layout={!reduce}
                        key={m.id}
                        className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-xs"
                      >
                        <Avatar name={m.name} color={colors[m.name]} className="size-6 text-[10px]" />
                        <span className="font-medium">{m.name}</span>
                        {finder > 0 && <Badge tone="amber">Finder {money(finder / 100)}</Badge>}
                        {lead > 0 && <Badge tone="blue">Lead {money(lead / 100)}</Badge>}
                        <span className="text-muted-foreground">+ work share</span>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>

              <AnimatePresence>
                {dirty && (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
                  >
                    <span>
                      Saving starts charter v{(project.charterVersion ?? 1) + 1}. Everyone signs again and any
                      existing scoring is discarded.
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
                        <RotateCcw className="size-3.5" /> Discard
                      </Button>
                      <Button size="sm" onClick={() => act("save", () => savePoolConfig(project.id, draft))} disabled={busy !== null}>
                        {busy === "save" ? <Spinner /> : "Save charter"}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sign-off */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Label className="mb-0 text-foreground">Sign-off on v{project.charterVersion ?? 1}</Label>
                  {!unlocked && !paid && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act("all", () => confirmCharter(project.id))}
                      disabled={busy !== null || dirty}
                    >
                      {busy === "all" ? <Spinner /> : "Sign for everyone (demo)"}
                    </Button>
                  )}
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {project.members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
                      <Avatar name={m.name} color={colors[m.name]} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="truncate font-medium text-foreground">{m.name}</p>
                        <p className="text-muted-foreground">{m.role === "lead" ? "Lead" : "Member"}</p>
                      </div>
                      {m.confirmed ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-60"
                          onClick={() => act(`member-${m.id}`, () => setMemberConfirmation(project.id, m.id, false))}
                          disabled={paid || busy !== null || dirty}
                          title="Withdraw signature"
                        >
                          {busy === `member-${m.id}` ? <Spinner className="size-3" /> : <Check className="size-3" />}
                          Signed
                        </button>
                      ) : (
                        <HoldButton
                          variant="green"
                          icon={PenLine}
                          holdDuration={900}
                          holdingLabel="Signing…"
                          completeLabel="Signed"
                          resetAfter={0}
                          disabled={paid || busy !== null || dirty}
                          onHoldComplete={() => act(`member-${m.id}`, () => setMemberConfirmation(project.id, m.id, true))}
                          aria-label={`Hold to sign the charter as ${m.name}`}
                        >
                          Hold to sign
                        </HoldButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
