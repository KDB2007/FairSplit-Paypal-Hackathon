"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { EvidenceChips, EvidenceSheet } from "./evidence-sheet";
import { HowCalculated } from "./how-calculated";
import {
  ConfidencePill,
  MODE_HINT,
  MODE_LABEL,
  MODES,
  ShareBar,
  SplitDonut,
  amountForMode,
  peopleColorMap,
  rankPeople,
  shareFor,
} from "./split-visuals";

type Phase = "idle" | "scoring" | "done" | "error";

const MIN_SCORING_MS = 1500;
const REVEAL_STEP_MS = 120;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

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
  const [messageIndex, setMessageIndex] = useState(0);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [pendingAssignment, setPendingAssignment] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ personId: string; focusId: string | null } | null>(
    null
  );

  const appliedSignature = useRef<string | null>(split?.generatedAt ?? null);

  // A fresh score from the server (reload, re-score) replaces local state.
  useEffect(() => {
    const signature = split?.generatedAt ?? null;
    if (signature === appliedSignature.current) return;
    appliedSignature.current = signature;
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
  }, [split]);

  // Progressive card reveal when a split becomes visible.
  const revealSignature = liveSplit?.generatedAt ?? "none";
  const peopleCount = liveSplit?.people.length ?? 0;
  useEffect(() => {
    if (phase !== "done" || peopleCount === 0) {
      setRevealed(0);
      return;
    }
    if (prefersReducedMotion()) {
      setRevealed(peopleCount);
      return;
    }
    setRevealed(1);
    let current = 1;
    const timer = window.setInterval(() => {
      current += 1;
      setRevealed(current);
      if (current >= peopleCount) window.clearInterval(timer);
    }, REVEAL_STEP_MS);
    return () => window.clearInterval(timer);
  }, [phase, revealSignature, peopleCount]);

  const messages = useMemo(
    () => [
      `Reading ${project.contributions.length} activities…`,
      "Classifying quiet work…",
      "Computing the split…",
    ],
    [project.contributions.length]
  );

  async function runScore() {
    setScoreError(null);
    setPhase("scoring");
    setMessageIndex(0);
    const startedAt = Date.now();
    const ticker = window.setInterval(
      () => setMessageIndex((index) => Math.min(index + 1, messages.length - 1)),
      700
    );

    try {
      const result = await scoreProject(project.id);
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SCORING_MS) await sleep(MIN_SCORING_MS - elapsed);

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
    } finally {
      window.clearInterval(ticker);
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
    ? hidden.amountsByMode.merit - hidden.amountsByMode.equal
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
            <p className="text-base font-semibold text-slate-900">Nothing to score yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
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
            <p className="mt-0.5 text-sm text-slate-500">
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
              <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={runScore} disabled={project.members.length === 0}>
              Score with AI
            </Button>
            <p className="text-xs text-slate-400">
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
        <CardContent className="flex flex-col items-center gap-5 py-20">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-100" />
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
              <Spinner className="h-4 w-4 border-white" />
            </span>
          </span>
          <p className="text-sm font-medium text-slate-700" role="status" aria-live="polite">
            {messages[messageIndex]}
          </p>
          <div className="h-1 w-52 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
              style={{ width: `${((messageIndex + 1) / messages.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">The model judges; code does the maths.</p>
        </CardContent>
      </Card>
    );
  }

  /* -------------------------------- Error --------------------------------- */

  if (phase === "error" || !liveSplit) {
    return (
      <Card>
        <CardContent className="space-y-4 py-12">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-rose-800">Scoring failed</p>
            <p className="mt-1 text-sm text-rose-700">
              {scoreError ?? "The scoring model did not return a usable response."}
            </p>
          </div>
          <p className="text-xs text-slate-500">
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
            <p className="mt-1 text-sm text-slate-500">
              {project.name} · {money(liveSplit.totalAmountCents / 100)} ·{" "}
              {liveSplit.contributions.length} judged activities
              {liveSplit.unassigned.length > 0 && ` · ${liveSplit.unassigned.length} unassigned`}
            </p>
          </div>
          <Button variant="outline" onClick={runScore} disabled={continuing}>
            ↻ Re-score
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  title={MODE_HINT[option]}
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === option
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  )}
                >
                  {MODE_LABEL[option]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Switching is instant — all four splits were computed up front. No new AI call.
            </p>
          </div>
          {mode === "hours" && liveSplit.formula.hoursFallback && (
            <p className="mt-2 text-xs text-amber-700">
              No hours were logged, so Hours mode falls back to an equal split.
            </p>
          )}
        </CardContent>
      </Card>

      {/* The insight banner */}
      {hidden && hiddenShortfallCents > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <span className="text-lg" aria-hidden>
            💡
          </span>
          <p className="min-w-0 flex-1 text-sm text-amber-900">
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
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        {/* Ranked member cards */}
        <div className="space-y-3">
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
                color={colors[person.memberId] ?? "#2563eb"}
                isLead={isLead}
                reveal={index < revealed}
                contributionsById={contributionsById}
                itemCount={itemCounts.get(person.memberId) ?? 0}
                onOpenEvidence={(focusId) =>
                  setSheet({ personId: person.memberId, focusId })
                }
              />
            );
          })}
        </div>

        {/* Donut + legend */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <Card>
            <CardContent>
              <SplitDonut
                people={liveSplit.people}
                mode={mode}
                colors={colors}
                totalCents={liveSplit.totalAmountCents}
              />
              <p className="mt-3 border-t border-slate-100 pt-3 text-center text-xs leading-relaxed text-slate-500">
                {MODE_HINT[mode]}
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
              <p className="mt-0.5 text-sm text-slate-500">
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
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500">
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
              <p className="mt-3 text-xs text-emerald-700">
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
        color={sheetPerson ? colors[sheetPerson.memberId] ?? "#2563eb" : "#2563eb"}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Member card                                                                */
/* -------------------------------------------------------------------------- */

function MemberCard({
  person,
  rank,
  mode,
  share,
  amountCents,
  delta,
  color,
  isLead,
  reveal,
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
  reveal: boolean;
  contributionsById: Map<string, ScoredContribution>;
  itemCount: number;
  onOpenEvidence: (id: string) => void;
}) {
  const showDelta = Math.abs(delta) >= 0.05;

  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-4 transition-all duration-300 ease-out",
        reveal ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        person.hiddenContributor
          ? "border-amber-200 shadow-sm ring-1 ring-amber-100"
          : "border-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: color }}
            title={`Rank ${rank} under ${MODE_LABEL[mode]}`}
          >
            {rank}
          </span>
          <Avatar name={person.person} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-slate-900">{person.person}</p>
              {isLead && <Badge tone="slate">Lead</Badge>}
              {person.hiddenContributor && (
                <Badge
                  tone="amber"
                  className="border-amber-300"
                >
                  ✦ Hidden contribution
                </Badge>
              )}
              {person.zeroActivity && <Badge tone="rose">No activity</Badge>}
            </div>
            <p className="truncate text-xs text-slate-500">
              {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
              {person.activityCountSharePct.toFixed(1)}% of logged items
              {person.quietValueSharePct > 0 &&
                ` · ${Math.round(person.quietValueSharePct)}% quiet value`}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
            {share.toFixed(2)}%
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-700">
            {money(amountCents / 100)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            {MODE_LABEL[mode]}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ShareBar
            value={share}
            equalValue={person.equalPct}
            color={color}
            showEqual={mode !== "equal"}
          />
        </div>
        {showDelta && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
              delta > 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            )}
            title={`Equal split: ${person.equalPct.toFixed(2)}% · ${MODE_LABEL[mode]}: ${share.toFixed(
              2
            )}%`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} pts vs equal
          </span>
        )}
      </div>

      {person.range && (
        <p className="mt-1.5 text-[11px] text-amber-700">
          Range across runs: {person.range.minMeritPct.toFixed(1)}–
          {person.range.maxMeritPct.toFixed(1)}% merit
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-slate-600">{person.reason}</p>

      <div className="mt-3 border-t border-slate-100 pt-2.5">
        {person.zeroActivity ? (
          <p className="text-xs text-slate-400">
            No logged activity yet, so this person earns 0% under merit until work is
            recorded.
          </p>
        ) : (
          <EvidenceChips
            person={person}
            contributionsById={contributionsById}
            onOpen={onOpenEvidence}
          />
        )}
      </div>

      {person.hiddenContributor && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
          {Math.round(person.quietValueSharePct)}% of their value comes from quiet work, and
          merit beats their item-count share by{" "}
          {(person.meritPct - person.activityCountSharePct).toFixed(1)} pts.
        </p>
      )}
    </article>
  );
}
