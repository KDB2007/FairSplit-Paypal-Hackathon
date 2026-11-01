"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart } from "recharts";
import { cn, money } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { NumberTicker } from "@/components/motion/number-ticker";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export interface MoneySlice {
  key: string;
  name: string;
  cents: number;
  color: string;
}

/** Person-coloured donut with the total ticking up in the middle. */
export function MoneyDonut({
  slices,
  caption = "total",
  className,
}: {
  slices: MoneySlice[];
  caption?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const totalCents = slices.reduce((s, x) => s + x.cents, 0);
  const config: ChartConfig = Object.fromEntries(slices.map((s) => [s.key, { label: s.name, color: s.color }]));
  const data = slices.filter((s) => s.cents > 0).map((s) => ({ key: s.key, name: s.name, value: s.cents / 100, fill: s.color }));

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[260px]", className)}>
      <ChartContainer config={config} className="aspect-square h-full w-full">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{(item.payload as { name: string }).name}</span>
                    <span className="font-mono tabular-nums">{money(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={data.length > 1 ? 2 : 0}
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={!reduce}
            animationDuration={800}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{caption}</span>
        <NumberTicker value={totalCents / 100} from={0} duration={0.9} format={(v) => money(v)} className="mt-1 text-xl font-bold" />
      </div>
    </div>
  );
}

export interface EarningsRow {
  key: string;
  name: string;
  color: string;
  feeCents: number;
  workCents: number;
}

/** Leaderboard of what each person earns: charter fees (hatched) + work-pool share. */
export function EarningsBars({ rows }: { rows: EarningsRow[] }) {
  const reduce = useReducedMotion();
  const sorted = [...rows].sort((a, b) => b.feeCents + b.workCents - (a.feeCents + a.workCents));
  const max = Math.max(1, ...sorted.map((r) => r.feeCents + r.workCents));
  return (
    <ol className="space-y-3">
      {sorted.map((row, i) => {
        const total = row.feeCents + row.workCents;
        return (
          <li key={row.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
                <span className="font-medium">{row.name}</span>
              </span>
              <NumberTicker value={total / 100} from={0} delay={reduce ? 0 : i * 0.08} format={(v) => money(v)} className="font-semibold" />
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: "100%" }}>
              <motion.div
                className="flex h-full overflow-hidden rounded-full"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(total / max) * 100}%` }}
                transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.08, ease: EASE_OUT }}
              >
                {row.feeCents > 0 && (
                  <span
                    className="h-full"
                    style={{
                      width: `${(row.feeCents / total) * 100}%`,
                      backgroundColor: row.color,
                      backgroundImage:
                        "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklch, var(--background) 45%, transparent) 4px 6px)",
                    }}
                    title={`Charter fees ${money(row.feeCents / 100)}`}
                  />
                )}
                <span className="h-full flex-1" style={{ backgroundColor: row.color }} title={`Work pool ${money(row.workCents / 100)}`} />
              </motion.div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** KPI tile with a count-up value. */
export function KpiCard({
  label,
  value,
  format,
  hint,
  icon,
  delay = 0,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  hint?: ReactNode;
  icon?: ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : delay, ease: EASE_OUT }}
      className="rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <NumberTicker value={value} from={0} delay={reduce ? 0 : delay} duration={0.9} format={format} className="mt-2 block text-2xl font-semibold tracking-tight" />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}
