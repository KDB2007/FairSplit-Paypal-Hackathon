"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ContributionCategory, Project } from "@/lib/types";
import { normalizeContributions } from "@/lib/explain/normalize";
import { personColorMap } from "@/lib/person-color";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export const CATEGORY_META: Record<ContributionCategory, { label: string; color: string; quiet: boolean }> = {
  code: { label: "Code", color: "var(--primary)", quiet: false },
  design: { label: "Design", color: "var(--chart-5)", quiet: false },
  review: { label: "Review", color: "var(--info)", quiet: true },
  client_comms: { label: "Client", color: "var(--highlight)", quiet: true },
  unblocking: { label: "Unblocking", color: "var(--success)", quiet: true },
  planning: { label: "Planning", color: "var(--chart-4)", quiet: true },
  admin: { label: "Admin", color: "var(--muted-foreground)", quiet: true },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_META) as ContributionCategory[];

/** Diagonal hatch over a person's own colour marks quiet work, so person colours stay unique. */
const HATCH =
  "repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in oklch, var(--card) 55%, transparent) 3px 5px)";

const dayKey = (iso: string) => iso.slice(0, 10);
const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Two small charts above the activity list:
 * - when the work happened (items per day, stacked per member), and
 * - what kind of work each person did, with the quiet work highlighted.
 * Categories come from the same title heuristics the scorer starts from;
 * AI scoring later replaces them with judged categories.
 */
export function ContributionInsights({ project }: { project: Project }) {
  const reduce = useReducedMotion();
  const colors = useMemo(() => personColorMap(project.members), [project.members]);
  const normalized = useMemo(
    () => normalizeContributions(project.contributions, project.members),
    [project.contributions, project.members]
  );

  const timeline = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const item of normalized.assigned) {
      const key = dayKey(item.timestamp);
      const row = byDay.get(key) ?? {};
      row[item.memberId!] = (row[item.memberId!] ?? 0) + 1;
      byDay.set(key, row);
    }
    const keys = [...byDay.keys()].sort();
    if (keys.length === 0) return [];
    // Pad the ends so even a single busy day reads as a shape, not a dot.
    const shift = (key: string, days: number) => {
      const d = new Date(`${key}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const all = [shift(keys[0], -1), ...keys, shift(keys[keys.length - 1], 1)];
    return all.map((key) => {
      const counts = byDay.get(key) ?? {};
      return {
        day: dayLabel(key),
        ...Object.fromEntries(project.members.map((m) => [m.id, counts[m.id] ?? 0])),
      };
    });
  }, [normalized, project.members]);

  const breakdown = useMemo(
    () =>
      project.members.map((member) => {
        const items = normalized.assigned.filter((item) => item.memberId === member.id);
        const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<ContributionCategory, number>;
        for (const item of items) counts[item.categoryHint ?? "code"] += 1;
        const quiet = CATEGORY_ORDER.filter((c) => CATEGORY_META[c].quiet).reduce((s, c) => s + counts[c], 0);
        return { member, total: items.length, counts, quietPct: items.length ? (quiet / items.length) * 100 : 0 };
      }),
    [normalized, project.members]
  );

  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(project.members.map((m) => [m.id, { label: m.name, color: colors[m.id] }])),
    [project.members, colors]
  );

  if (normalized.assigned.length === 0) return null;
  const maxTotal = Math.max(1, ...breakdown.map((b) => b.total));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section className="rounded-xl border bg-card p-4 lg:col-span-3" aria-label="Activity over time">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">When the work happened</h3>
          <span className="text-xs text-muted-foreground">{normalized.assigned.length} items</span>
        </div>
        <ChartContainer config={config} className="aspect-auto h-40 w-full">
          <AreaChart data={timeline} margin={{ left: -24, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            {project.members.map((m) => (
              <Area
                key={m.id}
                dataKey={m.id}
                stackId="a"
                type="monotone"
                stroke={`var(--color-${m.id})`}
                fill={`var(--color-${m.id})`}
                fillOpacity={0.25}
                strokeWidth={1.5}
                isAnimationActive={!reduce}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </section>

      <section className="rounded-xl border bg-card p-4 lg:col-span-2" aria-label="Kinds of work per person">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">What kind of work</h3>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-foreground/70" aria-hidden /> code &amp; design
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-foreground/70" style={{ backgroundImage: HATCH }} aria-hidden /> quiet work
            </span>
          </span>
        </div>
        <ul className="space-y-3">
          {breakdown.map(({ member, total, counts, quietPct }, row) => {
            const quietCount = CATEGORY_ORDER.filter((c) => CATEGORY_META[c].quiet).reduce((s, c) => s + counts[c], 0);
            const builtCount = total - quietCount;
            const kinds = CATEGORY_ORDER.filter((c) => counts[c] > 0)
              .map((c) => `${counts[c]} ${CATEGORY_META[c].label.toLowerCase()}`)
              .join(" · ");
            return (
              <li key={member.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full" style={{ backgroundColor: colors[member.id] }} aria-hidden />
                    {member.name}
                  </span>
                  <span className="text-muted-foreground">
                    {total} item{total === 1 ? "" : "s"}
                    {quietPct > 0 && (
                      <>
                        {" "}· <span className="text-foreground">{Math.round(quietPct)}% quiet</span>
                      </>
                    )}
                  </span>
                </div>
                <div
                  className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted"
                  style={{ width: `${(total / maxTotal) * 100}%`, minWidth: total ? "1.5rem" : 0 }}
                  role="img"
                  aria-label={`${member.name}: ${kinds || "no activity"}`}
                >
                  {[
                    { key: "built", count: builtCount, hatch: false },
                    { key: "quiet", count: quietCount, hatch: true },
                  ]
                    .filter((seg) => seg.count > 0)
                    .map((seg, i) => (
                      <motion.span
                        key={seg.key}
                        className="h-full"
                        style={{ backgroundColor: colors[member.id], backgroundImage: seg.hatch ? HATCH : undefined }}
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: `${(seg.count / total) * 100}%` }}
                        transition={{ duration: 0.5, delay: reduce ? 0 : row * 0.06 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      />
                    ))}
                </div>
                {kinds && <p className="mt-1 text-[11px] text-muted-foreground">{kinds}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
