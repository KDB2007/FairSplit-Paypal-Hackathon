"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ProjectStatus, ProjectSummary } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { NumberTicker } from "@/components/motion/number-ticker";

/** The stage bar keeps all five stages; the row dot below is a simpler three-colour scale. */
const STAGES: Array<{ key: ProjectStatus; label: string; barClass: string }> = [
  { key: "draft", label: "Draft", barClass: "bg-muted-foreground/35" },
  { key: "charter_confirmed", label: "Ready to score", barClass: "bg-info" },
  { key: "scored", label: "Scored", barClass: "bg-chart-1" },
  { key: "approved", label: "Approved", barClass: "bg-warning" },
  { key: "paid", label: "Paid", barClass: "bg-success" },
];

/**
 * Totals and the stage bar. No card: the page is one column, and whitespace
 * plus the thin bar carry the grouping. Both the segments and the legend
 * filter the list below.
 */
export function DashboardStats({
  projects,
  stage,
  onStageChange,
}: {
  projects: ProjectSummary[];
  stage: ProjectStatus | null;
  onStageChange: (stage: ProjectStatus | null) => void;
}) {
  const reduce = useReducedMotion();
  const paid = projects.reduce((sum, project) => sum + project.paidCents, 0);
  const inProgress = projects.filter((project) => project.status !== "paid").length;
  const pool = projects.reduce(
    (sum, project) => sum + Math.round(project.totalAmount * 100),
    0
  );

  const items = [
    { label: "Paid out", value: paid / 100, format: (value: number) => money(value) },
    {
      label: "In progress",
      value: inProgress,
      format: (value: number) => Math.round(value).toString(),
    },
    {
      label: "Total across projects",
      value: pool / 100,
      format: (value: number) => money(value),
    },
  ];

  const counts = STAGES.map((stageDef) => ({
    ...stageDef,
    count: projects.filter((project) => project.status === stageDef.key).length,
  })).filter((stageDef) => stageDef.count > 0);
  const total = Math.max(1, projects.length);

  return (
    <>
      <section aria-label="Totals" className="mt-12">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
          {items.map((item, index) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-2 text-3xl font-light tracking-tight sm:text-4xl">
                <NumberTicker
                  value={item.value}
                  from={0}
                  format={item.format}
                  delay={index * 0.05}
                />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {counts.length > 0 && (
        <section aria-label="Projects by stage" className="mt-12">
          <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
            {counts.map((stageDef, index) => (
              <motion.button
                key={stageDef.key}
                type="button"
                aria-pressed={stage === stageDef.key}
                aria-label={`Filter by ${stageDef.label} (${stageDef.count})`}
                title={`${stageDef.label} · ${stageDef.count}`}
                onClick={() =>
                  onStageChange(stage === stageDef.key ? null : stageDef.key)
                }
                className={cn(
                  "h-full shrink-0 cursor-pointer transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  stageDef.barClass,
                  stage && stage !== stageDef.key && "opacity-30"
                )}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(stageDef.count / total) * 100}%` }}
                transition={{
                  duration: 0.6,
                  delay: reduce ? 0 : index * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {counts.map((stageDef) => (
              <button
                key={stageDef.key}
                type="button"
                aria-pressed={stage === stageDef.key}
                onClick={() =>
                  onStageChange(stage === stageDef.key ? null : stageDef.key)
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  stage === stageDef.key && "text-foreground"
                )}
              >
                <span
                  className={cn("size-1.5 rounded-full", stageDef.barClass)}
                  aria-hidden
                />
                {stageDef.label}
                <span className="tabular-nums text-muted-foreground/70">
                  {stageDef.count}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
