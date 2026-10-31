"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { ScoreMode, ScoredPerson, ScoredSplit } from "@/lib/types";
import { cn, money } from "@/lib/utils";

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

const PERSON_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

/** Colour is tied to a person, not to their rank, so it survives re-sorting. */
export function peopleColorMap(people: ScoredPerson[]): Record<string, string> {
  return Object.fromEntries(
    people.map((person, index) => [
      person.memberId,
      PERSON_COLORS[index % PERSON_COLORS.length],
    ])
  );
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
            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            lower ? "bg-amber-500" : "bg-emerald-500"
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
        className="pointer-events-none invisible absolute right-0 top-full z-40 mt-2 w-72 translate-y-1 rounded-xl border border-slate-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <p className="text-xs font-semibold text-slate-900">
          {lower ? "Shares are softer this time" : "The model agreed with itself"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {lower
            ? `Across ${split.formula.runs} independent reads of every activity, merit shares moved more than 5 points. Ranges are shown on each card.`
            : `Across ${split.formula.runs} independent reads of every activity, merit shares stayed within ${delta.toFixed(
                2
              )} points of each other (limit: 5).`}
        </p>
        {lower && ranged.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {ranged.map((person) => (
              <li key={person.memberId} className="flex justify-between text-xs text-slate-600">
                <span>{person.person}</span>
                <span className="font-medium text-slate-800">
                  {person.range!.minMeritPct.toFixed(1)}–{person.range!.maxMeritPct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] uppercase tracking-wide text-slate-400">
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
}: {
  value: number;
  equalValue: number;
  color: string;
  showEqual?: boolean;
}) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100"
      title={showEqual ? `Equal split would be ${equalValue.toFixed(2)}%` : undefined}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
      {showEqual && (
        <span
          className="absolute top-0 h-full w-px bg-slate-400/70"
          style={{ left: `${Math.min(100, Math.max(0, equalValue))}%` }}
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
    color: colors[person.memberId] ?? PERSON_COLORS[0],
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
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {MODE_LABEL[mode]} split
          </span>
          <span className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            {money(totalCents / 100)}
          </span>
          <span className="mt-0.5 text-[10px] text-slate-400">{caption}</span>
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
            <span className="min-w-0 flex-1 truncate text-slate-600">{entry.name}</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {entry.value.toFixed(2)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">
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

/**
 * Total → charter fees → work pool → people. Fees come off the top and are
 * fixed by the charter; the work pool is what the AI scored and humans edited.
 */
export function PoolWaterfall({
  totalCents,
  rows,
}: {
  totalCents: number;
  rows: WaterfallRow[];
}) {
  const finder = rows.filter((row) => row.finderCents > 0);
  const lead = rows.filter((row) => row.leadCents > 0);
  const finderCents = finder.reduce((sum, row) => sum + row.finderCents, 0);
  const leadCents = lead.reduce((sum, row) => sum + row.leadCents, 0);
  const workCents = rows.reduce((sum, row) => sum + row.workCents, 0);
  const unpaidCents = Math.max(0, totalCents - finderCents - leadCents - workCents);
  const pct = (cents: number) => (totalCents > 0 ? (cents / totalCents) * 100 : 0);

  const segments = [
    { key: "finder", label: `Finder fee${finder.length ? ` · ${finder.map((r) => r.person).join(", ")}` : ""}`, cents: finderCents, className: "bg-amber-400" },
    { key: "lead", label: `Lead fee${lead.length ? ` · ${lead.map((r) => r.person).join(", ")}` : ""}`, cents: leadCents, className: "bg-violet-400" },
    { key: "work", label: "Work pool", cents: workCents, className: "bg-blue-500" },
    { key: "held", label: "Withheld (disputed)", cents: unpaidCents, className: "bg-slate-300" },
  ].filter((segment) => segment.cents > 0);

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${money(s.cents / 100)}`).join(", ")}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn("h-full", segment.className)}
            style={{ width: `${pct(segment.cents)}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", segment.className)} aria-hidden />
            {segment.label}
            <span className="font-semibold tabular-nums text-slate-800">
              {money(segment.cents / 100)}
            </span>
          </li>
        ))}
      </ul>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-1.5 font-medium">Person</th>
            <th className="py-1.5 text-right font-medium">Fees</th>
            <th className="py-1.5 text-right font-medium">Work pool</th>
            <th className="py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const fees = row.finderCents + row.leadCents;
            return (
              <tr key={row.person}>
                <td className="py-1.5 text-slate-700">{row.person}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {fees > 0 ? money(fees / 100) : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">
                  {money(row.workCents / 100)}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                  {money((fees + row.workCents) / 100)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200">
            <td className="py-1.5 font-medium text-slate-700" colSpan={3}>
              Total
            </td>
            <td className="py-1.5 text-right font-bold tabular-nums text-slate-900">
              {money((finderCents + leadCents + workCents) / 100)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
