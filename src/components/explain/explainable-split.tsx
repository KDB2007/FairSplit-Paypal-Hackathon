"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import type {
  Project,
  ScoreMode,
  ScoredContribution,
  ScoredPerson,
  ScoredSplit,
} from "@/lib/types";
import { scoreProject } from "@/lib/client";
import { recomputeWithAssignments } from "@/lib/explain/recompute";
import { cn, money } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Spinner,
} from "@/components/ui";
import AICitations, { type AnswerPart, type CitationSource } from "@/components/kokonutui/ai-citations";
import { NumberTicker } from "@/components/motion/number-ticker";
import { useTasks } from "@/components/app-shell/tasks";
import { EvidenceChips, EvidenceSheet } from "./evidence-sheet";
import { ScoringProgress } from "./scoring-progress";
import { cleanReason } from "./clean-reason";
import { ModeSlopeChart } from "./mode-slope-chart";
import { HowCalculated } from "./how-calculated";
import {
  ConfidencePill,
  MODE_HINT,
  MODE_LABEL,
  MODES,
  ShareBar,
  amountForMode,
  peopleColorMap,
  rankPeople,
  shareFor,
} from "./split-visuals";

type Phase = "idle" | "scoring" | "done" | "error";

const MIN_SCORING_MS = 2400;
const CARD_STAGGER_S = 0.12;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ExplainableSplit({
  project,
  split,
  onProjectUpdate,
  onContinue,
  onBack,
  continuing,
}: {
  project: Project;
  split: ScoredSplit | null;
  onProjectUpdate: (project: Project) => void;
  onContinue: (split: ScoredSplit, mode: ScoreMode) => Promise<void> | void;
  onBack: () => void;
  continuing: boolean;
}) {
  const [baseSplit, setBaseSplit] = useState<ScoredSplit | null>(split);
  const [liveSplit, setLiveSplit] = useState<ScoredSplit | null>(split);
  const [phase, setPhase] = useState<Phase>(split ? "done" : "idle");
  const [mode, setMode] = useState<ScoreMode>(split?.defaultMode ?? "merit");
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreDone, setScoreDone] = useState(false);
  const reduce = useReducedMotion();
  const { track } = useTasks();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [pendingAssignment, setPendingAssignment] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ personId: string; focusId: string | null } | null>(
    null
  );

  const [appliedSignature, setAppliedSignature] = useState<string | null>(split?.generatedAt ?? null);

  // A fresh score from the server (reload, re-score) replaces local state.
  // Adjusted during render rather than in an effect, so there's no extra paint with stale state.
  const signature = split?.generatedAt ?? null;
  if (signature !== appliedSignature) {
    setAppliedSignature(signature);
    setBaseSplit(split);
    setLiveSplit(split);
    setAssignments({});
    setPendingAssignment({});
    if (split) {
      setMode(split.defaultMode);
      setPhase("done");
    } else {
      setPhase("idle");
    }
  }

  async function runScore() {
    setScoreError(null);
    setScoreDone(false);
    setPhase("scoring");
    const startedAt = Date.now();

    try {
      const result = await track("AI scoring", scoreProject(project.id), `${project.contributions.length} activities`);
      const elapsed = Date.now() - startedAt;
      // Let the pipeline read before the reveal, without inventing extra work.
      if (!reduce && elapsed < MIN_SCORING_MS) await sleep(MIN_SCORING_MS - elapsed);
      setScoreDone(true);
      if (!reduce) await sleep(650);

      setBaseSplit(result.split);
      setLiveSplit(result.split);
      setAssignments({});
      setPendingAssignment({});
      setMode(result.split.defaultMode);
      onProjectUpdate(result.project);
      setPhase("done");
    } catch (error) {
      setScoreError(error instanceof Error ? error.message : "Scoring failed.");
      setPhase("error");
    }
  }

  function assign(itemId: string) {
    const memberId = pendingAssignment[itemId];
    if (!memberId || !baseSplit) return;
    const next = { ...assignments, [itemId]: memberId };
    setAssignments(next);
    setLiveSplit(
      recomputeWithAssignments(
        baseSplit,
        next,
        project.members.map((member) => ({ id: member.id, name: member.name }))
      )
    );
    setPendingAssignment((previous) => {
      const copy = { ...previous };
      delete copy[itemId];
      return copy;
    });
  }

  const contributionsById = useMemo(() => {
    const map = new Map<string, ScoredContribution>();
    liveSplit?.contributions.forEach((contribution) => map.set(contribution.id, contribution));
    return map;
  }, [liveSplit]);

  const colors = useMemo(
    () => peopleColorMap(liveSplit?.people ?? []),
    [liveSplit]
  );

  const ranked = useMemo(
    () => (liveSplit ? rankPeople(liveSplit.people, mode) : []),
    [liveSplit, mode]
  );

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    liveSplit?.contributions.forEach((contribution) => {
      if (!contribution.memberId) return;
      counts.set(contribution.memberId, (counts.get(contribution.memberId) ?? 0) + 1);
    });
    return counts;
  }, [liveSplit]);

  const hidden = liveSplit?.people.find((person) => person.hiddenContributor) ?? null;
  const hiddenShortfallCents = hidden
    ? // Splits saved before the layered pool have no workAmountsByMode; fall back to totals.
      (hidden.workAmountsByMode ?? hidden.amountsByMode).merit -
      (hidden.workAmountsByMode ?? hidden.amountsByMode).equal
    : 0;

  const sheetPerson =
    (sheet && liveSplit?.people.find((person) => person.memberId === sheet.personId)) || null;

  /* ------------------------------ Empty state ----------------------------- */

  if (project.contributions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="text-3xl" aria-hidden>
            📥
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">Nothing to score yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Sync GitHub or Trello, or log quiet work, then come back. The scorer needs
              at least one activity to explain.
            </p>
          </div>
          <Button onClick={onBack}>Capture contributions →</Button>
        </CardContent>
      </Card>
    );
  }

  /* -------------------------------- Idle ---------------------------------- */

  if (phase === "idle" || (!liveSplit && phase !== "scoring" && phase !== "error")) {
    return (
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Explainable split</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {project.contributions.length} activities across {project.members.length} members.
              The model judges each one; code does the maths.
            </p>
          </div>
          <Badge tone="slate">{money(project.totalAmount)} lump sum</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Judge",
                body: "Impact, complexity and a one-line rationale per activity — quiet work scored like code.",
              },
              {
                title: "Compute",
                body: "Pure TypeScript turns judgments into merit, hybrid and hours shares that sum to exactly 100%.",
              },
              {
                title: "Explain",
                body: "Every share gets a plain-language reason and clickable evidence you can audit.",
              },
            ].map((item, index) => (
              <div key={item.title} className="rounded-xl border border-border bg-muted/40 p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                  {index + 1}
                </span>
                <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={runScore} disabled={project.members.length === 0}>
              Score with AI
            </Button>
            <p className="text-xs text-muted-foreground">
              Runs three independent judgments to check its own confidence.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ------------------------------- Scoring -------------------------------- */

  if (phase === "scoring") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-14">
          <div className="text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> Scoring {project.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">The model judges each item; code does the maths.</p>
          </div>
          <ScoringProgress project={project} done={scoreDone} failed={false} />
        </CardContent>
      </Card>
    );
  }

  /* -------------------------------- Error --------------------------------- */

  if (phase === "error" || !liveSplit) {
    return (
      <Card>
        <CardContent className="space-y-4 py-12">
          <ScoringProgress project={project} done={false} failed />
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-semibold text-destructive">Scoring failed</p>
            <p className="mt-1 text-sm text-foreground/80">
              {scoreError ?? "The scoring model did not return a usable response."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Your contributions are untouched. Retry, or go back and check the activity list.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runScore}>Retry</Button>
            <Button variant="outline" onClick={onBack}>
              ← Contributions
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* -------------------------------- Result -------------------------------- */

  const leadIds = new Set(
    project.members.filter((member) => member.role === "lead").map((member) => member.id)
  );
  const requestedShare = (person: ScoredPerson) => shareFor(person, mode);
  const requestedAmount = (person: ScoredPerson) => amountForMode(person, mode);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Explainable split</CardTitle>
              <ConfidencePill split={liveSplit} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.name} · {money(liveSplit.totalAmountCents / 100)} ·{" "}
              {liveSplit.contributions.length} judged activities
              {liveSplit.unassigned.length > 0 && ` · ${liveSplit.unassigned.length} unassigned`}
            </p>
          </div>
          <Button variant="outline" onClick={runScore} disabled={continuing}>
            <RotateCcw className="size-4" /> Re-score
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LayoutGroup id="mode-toggle">
              <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5" role="group" aria-label="Split mode">
                {MODES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    title={MODE_HINT[option]}
                    aria-pressed={mode === option}
                    onClick={() => setMode(option)}
                    className={cn(
                      "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      mode === option ? "text-background" : "text-foreground/80 hover:text-foreground"
                    )}
                  >
                    {mode === option && (
                      <motion.span
                        layoutId="mode-pill"
                        className="absolute inset-0 rounded-md bg-foreground shadow-sm"
                        transition={{ type: "spring", duration: reduce ? 0 : 0.35, bounce: 0.15 }}
                      />
                    )}
                    <span className="relative">{MODE_LABEL[option]}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
            <p className="text-xs text-muted-foreground">
              Switching is instant — all four splits were computed up front. No new AI call.
            </p>
          </div>
          {mode === "hours" && liveSplit.formula.hoursFallback && (
            <p className="mt-2 text-xs text-warning-foreground dark:text-warning">
              No hours were logged, so Hours mode falls back to an equal split.
            </p>
          )}
        </CardContent>
      </Card>

      {/* The insight banner */}
      {hidden && hiddenShortfallCents > 0 && (
        <motion.div
          role="status"
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.5, ease: EASE_OUT }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <Lightbulb className="size-5 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">
              Equal split would underpay {hidden.person} by{" "}
              {money(hiddenShortfallCents / 100)}.
            </span>{" "}
            {Math.round(hidden.quietValueSharePct)}% of their judged value is quiet work —
            reviews, unblocking and client comms that never show up as commits.
          </p>
          {mode !== "merit" && (
            <Button size="sm" variant="outline" onClick={() => setMode("merit")}>
              Show merit split
            </Button>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        {/* Ranked member cards */}
        <LayoutGroup id="member-cards">
        <div className="space-y-3" key={liveSplit.generatedAt}>
          {ranked.map((person, index) => {
            const share = requestedShare(person);
            const amount = requestedAmount(person);
            const delta = share - person.equalPct;
            const isLead = leadIds.has(person.memberId);
            return (
              <MemberCard
                key={person.memberId}
                person={person}
                rank={index + 1}
                mode={mode}
                share={share}
                amountCents={amount}
                delta={delta}
                color={colors[person.memberId] ?? "var(--color-person-1)"}
                isLead={isLead}
                order={liveSplit.people.findIndex((p) => p.memberId === person.memberId)}
                contributionsById={contributionsById}
                itemCount={itemCounts.get(person.memberId) ?? 0}
                onOpenEvidence={(focusId) =>
                  setSheet({ personId: person.memberId, focusId })
                }
              />
            );
          })}
        </div>
        </LayoutGroup>

        {/* Shares across modes */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <Card>
            <CardContent>
              <ModeSlopeChart people={liveSplit.people} colors={colors} mode={mode} />
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{MODE_LABEL[mode]}:</span> {MODE_HINT[mode]}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <HowCalculated split={liveSplit} />

      {/* Unassigned tray */}
      {liveSplit.unassigned.length > 0 && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Unassigned activity</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                These items were judged but no member matches. Route them to a person and the
                split recomputes locally — no AI call.
              </p>
            </div>
            <Badge tone="amber">
              {liveSplit.unassigned.length} item
              {liveSplit.unassigned.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {liveSplit.unassigned.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      from {item.person} · {item.type} · impact {item.impact}/5 · complexity{" "}
                      {item.complexity}/5
                      {item.hours > 0 ? ` · ${item.hours}h` : ""}
                    </p>
                  </div>
                  <Select
                    aria-label={`Assign ${item.title}`}
                    value={pendingAssignment[item.id] ?? ""}
                    onChange={(event) =>
                      setPendingAssignment((previous) => ({
                        ...previous,
                        [item.id]: event.target.value,
                      }))
                    }
                    className="h-9 w-36"
                  >
                    <option value="">Assign to…</option>
                    {project.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!pendingAssignment[item.id]}
                    onClick={() => assign(item.id)}
                  >
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
            {Object.keys(assignments).length > 0 && (
              <p className="mt-3 text-xs text-success">
                Reassigned {Object.keys(assignments).length} item
                {Object.keys(assignments).length === 1 ? "" : "s"} locally — percentages and
                cents were recalculated in the browser.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Contributions
        </Button>
        <Button
          size="lg"
          disabled={continuing}
          onClick={() => {
            void onContinue(liveSplit, mode);
          }}
        >
          {continuing ? (
            <>
              <Spinner /> Saving split…
            </>
          ) : (
            `Review ${MODE_LABEL[mode].toLowerCase()} split →`
          )}
        </Button>
      </div>

      <EvidenceSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        person={sheetPerson}
        modeLabel={MODE_LABEL[mode]}
        sharePct={sheetPerson ? requestedShare(sheetPerson) : 0}
        amountCents={sheetPerson ? requestedAmount(sheetPerson) : 0}
        contributionsById={contributionsById}
        focusId={sheet?.focusId ?? null}
        color={sheetPerson ? colors[sheetPerson.memberId] ?? "var(--color-person-1)" : "var(--color-person-1)"}
        peers={liveSplit.people}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Member card                                                                */
/* -------------------------------------------------------------------------- */

const SOURCE_SITE: Record<ScoredContribution["type"], string> = {
  pr: "GitHub PR",
  commit: "GitHub commit",
  review: "PR review",
  trello: "Trello",
  manual: "Logged work",
};

/** The reason as citation parts: every linkable evidence item is cited after the last sentence. */
function reasonWithCitations(
  person: ScoredPerson,
  contributionsById: Map<string, ScoredContribution>
): { parts: AnswerPart[]; sources: CitationSource[] } {
  const sources: CitationSource[] = person.evidenceIds
    .map((id) => contributionsById.get(id))
    .filter((c): c is ScoredContribution & { evidenceUrl: string } => Boolean(c?.evidenceUrl))
    .map((c) => ({ id: c.id, title: c.title, url: c.evidenceUrl, site: SOURCE_SITE[c.type], snippet: c.rationale }));
  const reason = cleanReason(person.reason);
  const sentences = reason.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [reason];
  const parts = sentences.map((text, i) => ({
    text: text.trim() + (i < sentences.length - 1 ? " " : ""),
    cite: i === sentences.length - 1 && sources.length ? sources.map((s) => s.id) : undefined,
  }));
  return { parts, sources };
}

function MemberCard({
  person,
  rank,
  mode,
  share,
  amountCents,
  delta,
  color,
  isLead,
  order,
  contributionsById,
  itemCount,
  onOpenEvidence,
}: {
  person: ScoredPerson;
  rank: number;
  mode: ScoreMode;
  share: number;
  amountCents: number;
  delta: number;
  color: string;
  isLead: boolean;
  /** Position in the member list: drives the one-time entrance stagger. */
  order: number;
  contributionsById: Map<string, ScoredContribution>;
  itemCount: number;
  onOpenEvidence: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const showDelta = Math.abs(delta) >= 0.05;
  const enterDelay = reduce ? 0 : order * CARD_STAGGER_S;
  const citations = useMemo(() => reasonWithCitations(person, contributionsById), [person, contributionsById]);

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: enterDelay, ease: EASE_OUT, layout: { duration: 0.4, ease: EASE_OUT } }}
      className={cn(
        "relative rounded-xl border bg-card p-4",
        person.hiddenContributor ? "border-warning/50 shadow-sm" : "border-border"
      )}
    >
      {/* The hidden contributor pulses once, after the cards have landed. */}
      {person.hiddenContributor && !reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl"
          initial={{ boxShadow: "0 0 0 0px color-mix(in oklch, var(--warning) 0%, transparent)" }}
          animate={{
            boxShadow: [
              "0 0 0 0px color-mix(in oklch, var(--warning) 45%, transparent)",
              "0 0 0 10px color-mix(in oklch, var(--warning) 0%, transparent)",
            ],
          }}
          transition={{ duration: 1.2, delay: enterDelay + 0.7, ease: "easeOut" }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: color }}
            title={`Rank ${rank} under ${MODE_LABEL[mode]}`}
          >
            {rank}
          </span>
          <Avatar name={person.person} color={color} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold">{person.person}</p>
              {isLead && <Badge tone="slate">Lead</Badge>}
              {person.hiddenContributor && <Badge tone="amber">✦ Hidden contribution</Badge>}
              {person.zeroActivity && <Badge tone="rose">No activity</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {itemCount} item{itemCount === 1 ? "" : "s"} · {person.activityCountSharePct.toFixed(1)}% of logged items
              {person.quietValueSharePct > 0 && ` · ${Math.round(person.quietValueSharePct)}% quiet value`}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold leading-none" style={{ color }}>
            <NumberTicker value={share} from={0} delay={enterDelay} duration={0.8} format={(v) => `${v.toFixed(2)}%`} />
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground/80">
            <NumberTicker value={amountCents / 100} from={0} delay={enterDelay} duration={0.8} format={(v) => money(v)} />
          </p>
          {person.finderAmountCents + person.leadAmountCents > 0 && (
            <p className="text-[10px] tabular-nums text-muted-foreground">
              incl. {money((person.finderAmountCents + person.leadAmountCents) / 100)} charter fees
            </p>
          )}
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{MODE_LABEL[mode]} · of work pool</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ShareBar value={share} equalValue={person.equalPct} color={color} showEqual={mode !== "equal"} delay={enterDelay} />
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {showDelta && (
            <motion.span
              key={delta > 0 ? "up" : "down"}
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                delta > 0 ? "border-success/25 bg-success/10 text-success" : "border-destructive/25 bg-destructive/10 text-destructive"
              )}
              title={`Equal split: ${person.equalPct.toFixed(2)}% · ${MODE_LABEL[mode]}: ${share.toFixed(2)}%`}
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)} pts vs equal
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {person.range && (
        <p className="mt-1.5 text-[11px] text-warning-foreground dark:text-warning">
          Range across runs: {person.range.minMeritPct.toFixed(1)}–{person.range.maxMeritPct.toFixed(1)}% merit
        </p>
      )}

      {citations.sources.length > 0 ? (
        <AICitations parts={citations.parts} sources={citations.sources} className="mt-3 max-w-none text-sm leading-relaxed text-foreground/85" />
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-foreground/85">{cleanReason(person.reason)}</p>
      )}

      <div className="mt-3 border-t border-border pt-2.5">
        {person.zeroActivity ? (
          <p className="text-xs text-muted-foreground">
            No logged activity yet, so this person earns 0% under merit until work is recorded.
          </p>
        ) : (
          <EvidenceChips person={person} contributionsById={contributionsById} onOpen={onOpenEvidence} />
        )}
      </div>

      {person.hiddenContributor && (
        <p className="mt-2 text-[11px] leading-relaxed text-warning-foreground dark:text-warning">
          {Math.round(person.quietValueSharePct)}% of their value comes from quiet work, and merit beats their item-count
          share by {(person.meritPct - person.activityCountSharePct).toFixed(1)} pts.
        </p>
      )}
    </motion.article>
  );
}
