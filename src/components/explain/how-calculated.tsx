"use client";

import { useState } from "react";
import type { ScoredSplit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "./evidence-sheet";

const STEPS = [
  {
    title: "Judge each activity",
    body: "The model reads one activity at a time and returns an impact score (1–5), a complexity score (1–5) and a category. It never returns a percentage or an amount.",
    code: "value = impact × complexity × categoryWeight",
  },
  {
    title: "Score each person",
    body: "Values are summed per category, square-rooted, then added across categories. The square root means breadth beats volume: twenty trivial commits cannot outrank one hard deliverable.",
    code: "score = Σ √( Σ value in category )",
  },
  {
    title: "Turn scores into shares",
    body: "Merit is a person's score divided by the team total. Hybrid blends that with logged hours. Equal ignores contribution entirely. Every mode is derived from the same judged items.",
    code: "merit = score / Σ score   ·   hybrid = 0.7·merit + 0.3·hours",
  },
  {
    title: "Round to real money",
    body: "Shares become integer cents with the largest-remainder method, so the parts always add up to the project total exactly — never $2,999.99.",
    code: "Σ cents = totalAmount",
  },
];

export function HowCalculated({ split }: { split: ScoredSplit }) {
  const [open, setOpen] = useState(false);
  const weights = Object.entries(split.formula.categoryWeights) as Array<
    [keyof typeof CATEGORY_LABEL, number]
  >;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="text-slate-400" aria-hidden>
            ƒ
          </span>
          How this was calculated
        </span>
        <span className="flex items-center gap-3 text-xs text-slate-400">
          <span className="hidden sm:inline">
            {split.contributions.length} items judged · {split.formula.runs} runs
          </span>
          <span
            className={cn("transition-transform duration-300", open && "rotate-180")}
            aria-hidden
          >
            ▾
          </span>
        </span>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-4 py-4">
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.body}</p>
                    <code className="mt-1 inline-block rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {step.code}
                    </code>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Category weights
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {weights.map(([category, weight]) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {CATEGORY_LABEL[category]}
                    <span className="font-semibold tabular-nums text-slate-800">
                      {weight.toFixed(1)}×
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-700">Run variance:</span> widest merit
                swing {split.formula.maxMeritDeltaPct.toFixed(2)} pts across{" "}
                {split.formula.runs} independent reads (limit 5).
              </p>
              <p>
                <span className="font-semibold text-slate-700">Judgments:</span>{" "}
                {split.formula.source === "canned"
                  ? "DEMO_MODE fixtures, replayed through the real formula"
                  : split.formula.source === "llm"
                    ? "live model output, validated server-side"
                    : "deterministic fallback"}
                . Took {split.formula.durationMs} ms.
              </p>
            </div>

            {split.formula.notes.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {split.formula.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
