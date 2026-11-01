"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { motion, useReducedMotion } from "motion/react";
import type { ScoreMode, ScoredPerson, ScoredSplit } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { personColor } from "@/lib/person-color";
import { NumberTicker } from "@/components/motion/number-ticker";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------- */
/* Shared presentation helpers                                                */
/* -------------------------------------------------------------------------- */

export const MODES: ScoreMode[] = ["equal", "merit", "hybrid", "hours"];

export const MODE_LABEL: Record<ScoreMode, string> = {
  equal: "Equal",
  merit: "Merit",
  hybrid: "Hybrid",
  hours: "Hours",
};

export const MODE_HINT: Record<ScoreMode, string> = {
  equal: "Same amount for everyone, regardless of contribution.",
  merit: "Weighted by judged impact and complexity, quiet work included.",
  hybrid: "70% merit plus 30% logged hours.",
  hours: "Proportional to hours logged on the project.",
};

/**
 * Colour is tied to a person (their place in the member list), not to their
 * rank, so it survives re-sorting and matches every other screen.
 */
export function peopleColorMap(people: ScoredPerson[]): Record<string, string> {
  return Object.fromEntries(people.map((person, index) => [person.memberId, personColor(index)]));
}

export function shareFor(person: ScoredPerson, mode: ScoreMode): number {
  switch (mode) {
    case "equal":
      return person.equalPct;
    case "merit":
      return person.meritPct;
    case "hybrid":
      return person.hybridPct;
    case "hours":
      return person.hoursPct;
  }
}

export function amountForMode(person: ScoredPerson, mode: ScoreMode): number {
  return person.amountsByMode[mode] ?? 0;
}

export function rankPeople(people: ScoredPerson[], mode: ScoreMode): ScoredPerson[] {
  return [...people].sort(
    (a, b) => shareFor(b, mode) - shareFor(a, mode) || a.person.localeCompare(b.person)
  );
}

/* -------------------------------------------------------------------------- */
/* Confidence pill                                                            */
/* -------------------------------------------------------------------------- */

export function ConfidencePill({ split }: { split: ScoredSplit }) {
  const lower = split.confidence === "lower";
  const ranged = split.people.filter((person) => person.range);
  const delta = Math.round(split.formula.maxMeritDeltaPct * 100) / 100;

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-describedby="confidence-tip"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          lower
            ? "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning hover:bg-warning/20"
            : "border-success/25 bg-success/10 text-success hover:bg-success/20"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            lower ? "bg-warning" : "bg-success"
          )}
          aria-hidden
        />
        {lower ? "Confidence: lower" : "High confidence"}
        <span className="text-[10px] opacity-60" aria-hidden>
          ⓘ
        </span>
      </button>

      <div
        id="confidence-tip"
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-40 mt-2 w-72 translate-y-1 rounded-xl border border-border bg-card p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <p className="text-xs font-semibold text-foreground">
          {lower ? "Shares are softer this time" : "The model agreed with itself"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/80">
          {lower
            ? `Across ${split.formula.runs} independent reads of every activity, merit shares moved more than 5 points. Ranges are shown on each card.`
            : `Across ${split.formula.runs} independent reads of every activity, merit shares stayed within ${delta.toFixed(
                2
              )} points of each other (limit: 5).`}
        </p>
        {lower && ranged.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-border pt-2">
            {ranged.map((person) => (
              <li key={person.memberId} className="flex justify-between text-xs text-foreground/80">
                <span>{person.person}</span>
                <span className="font-medium text-foreground">
                  {person.range!.minMeritPct.toFixed(1)}–{person.range!.maxMeritPct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 border-t border-border pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          {split.formula.source === "canned"
            ? "DEMO_MODE · canned judgments, real maths"
            : `Model · ${split.formula.runs} runs · temp 0.2`}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Share bar                                                                  */
/* -------------------------------------------------------------------------- */

export function ShareBar({
  value,
  equalValue,
  color,
  showEqual = true,
  delay = 0,
}: {
  value: number;
  equalValue: number;
  color: string;
  showEqual?: boolean;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      title={showEqual ? `Equal split would be ${equalValue.toFixed(2)}%` : undefined}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: reduce ? 0 : 0.6, delay, ease: EASE_OUT }}
      />
      {showEqual && (
        <motion.span
          className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 rounded-full bg-foreground/45"
          animate={{ left: `${Math.min(100, Math.max(0, equalValue))}%` }}
          transition={{ duration: reduce ? 0 : 0.4, ease: EASE_OUT }}
          aria-hidden
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut                                                                      */
/* -------------------------------------------------------------------------- */

export function SplitDonut({
  people,
  mode,
  colors,
  totalCents,
  caption = "total payout",
}: {
  people: ScoredPerson[];
  mode: ScoreMode;
  colors: Record<string, string>;
  totalCents: number;
  caption?: string;
}) {
  const data = people.map((person) => ({
    name: person.person,
    value: Math.max(0, shareFor(person, mode)),
    color: colors[person.memberId] ?? personColor(0),
  }));

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div
        className="relative aspect-square w-full"
        role="img"
        aria-label={`${MODE_LABEL[mode]} split: ${data
          .map((entry) => `${entry.name} ${entry.value.toFixed(1)} percent`)
          .join(", ")}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 240, height: 240 }}
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive
              animationDuration={520}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Ghost ticks: where each slice would start under an equal split. */}
        {people.length > 1 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            aria-hidden
          >
            {people.map((person, index) => {
              const angle = (90 - ((index + 1) * 360) / people.length) * (Math.PI / 180);
              const inner = 45;
              const outer = 49;
              return (
                <line
                  key={person.memberId}
                  x1={50 + Math.cos(angle) * inner}
                  y1={50 - Math.sin(angle) * inner}
                  x2={50 + Math.cos(angle) * outer}
                  y2={50 - Math.sin(angle) * outer}
                  stroke="#94a3b8"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeDasharray="0.5 1.5"
                />
              );
            })}
          </svg>
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {MODE_LABEL[mode]} split
          </span>
          <span className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {money(totalCents / 100)}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">{caption}</span>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-foreground/80">{entry.name}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {entry.value.toFixed(2)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
        Dashed ticks mark where an equal split would divide the ring.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pool waterfall                                                             */
/* -------------------------------------------------------------------------- */

export interface WaterfallRow {
  person: string;
  finderCents: number;
  leadCents: number;
  workCents: number;
}

interface Segment {
  key: string;
  label: string;
  cents: number;
  color: string;
}

/**
 * Total → finder fee → lead fee → work pool (→ each person). Fees come off the
 * top and are fixed by the charter; the work pool is what the AI scored and
 * humans edited. Segments resize smoothly and the amounts tick as values change.
 *
 * Pass `workPoolCents` to show the work pool as one block (before scoring, as in
 * the charter); otherwise it's broken down per person in their colours.
 */
export function PoolWaterfall({
  totalCents,
  rows,
  colors = {},
  workPoolCents,
  showTable = true,
}: {
  totalCents: number;
  rows: WaterfallRow[];
  /** Person name → colour. */
  colors?: Record<string, string>;
  workPoolCents?: number;
  showTable?: boolean;
}) {
  const reduce = useReducedMotion();
  const finder = rows.filter((row) => row.finderCents > 0);
  const lead = rows.filter((row) => row.leadCents > 0);
  const finderCents = finder.reduce((sum, row) => sum + row.finderCents, 0);
  const leadCents = lead.reduce((sum, row) => sum + row.leadCents, 0);
  const workCents = workPoolCents ?? rows.reduce((sum, row) => sum + row.workCents, 0);
  const heldCents = Math.max(0, totalCents - finderCents - leadCents - workCents);
  const pct = (cents: number) => (totalCents > 0 ? (cents / totalCents) * 100 : 0);
  const names = (list: WaterfallRow[]) => (list.length ? ` · ${list.map((r) => r.person).join(", ")}` : "");

  const segments: Segment[] = [
    { key: "finder", label: `Finder fee${names(finder)}`, cents: finderCents, color: "var(--highlight)" },
    { key: "lead", label: `Lead fee${names(lead)}`, cents: leadCents, color: "var(--info)" },
    ...(workPoolCents !== undefined
      ? [{ key: "work", label: "Work pool", cents: workCents, color: "var(--primary)" }]
      : rows
          .filter((row) => row.workCents > 0)
          .map((row, i) => ({
            key: `work-${row.person}`,
            label: row.person,
            cents: row.workCents,
            color: colors[row.person] ?? personColor(i),
          }))),
    { key: "held", label: "Withheld (disputed)", cents: heldCents, color: "var(--muted-foreground)" },
  ];
  const visible = segments.filter((segment) => segment.cents > 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Total</span>
        <NumberTicker value={totalCents / 100} format={(v) => money(v)} className="font-semibold text-foreground" />
      </div>
      <div
        className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={visible.map((s) => `${s.label} ${money(s.cents / 100)}`).join(", ")}
      >
        {segments.map((segment) => (
          <motion.div
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: segment.color, opacity: segment.key === "held" ? 0.35 : 1 }}
            initial={false}
            animate={{ width: `${pct(segment.cents)}%` }}
            transition={{ duration: reduce ? 0 : 0.45, ease: EASE_OUT }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-foreground/80">
        {visible.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden />
            {segment.label}
            <NumberTicker
              value={segment.cents / 100}
              format={(v) => money(v)}
              className="font-semibold text-foreground"
            />
          </li>
        ))}
      </ul>

      {showTable && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Person</th>
              <th className="py-1.5 text-right font-medium">Fees</th>
              <th className="py-1.5 text-right font-medium">Work pool</th>
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => {
              const fees = row.finderCents + row.leadCents;
              return (
                <tr key={row.person}>
                  <td className="py-1.5 text-foreground/80">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: colors[row.person] ?? personColor(i) }}
                        aria-hidden
                      />
                      {row.person}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fees > 0 ? money(fees / 100) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    <NumberTicker value={row.workCents / 100} format={(v) => money(v)} />
                  </td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    <NumberTicker value={(fees + row.workCents) / 100} format={(v) => money(v)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="py-1.5 font-medium text-foreground/80" colSpan={3}>
                Paid out
              </td>
              <td className="py-1.5 text-right font-bold text-foreground">
                <NumberTicker value={(finderCents + leadCents + workCents) / 100} format={(v) => money(v)} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
