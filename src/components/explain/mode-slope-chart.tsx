"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import type { ScoreMode, ScoredPerson } from "@/lib/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MODE_LABEL, shareFor } from "./split-visuals";

const ORDER: ScoreMode[] = ["equal", "hours", "hybrid", "merit"];

/**
 * How each person's share moves across the four modes (a slope chart). The
 * selected mode is marked; every value comes from the precomputed split.
 */
export function ModeSlopeChart({
  people,
  colors,
  mode,
}: {
  people: ScoredPerson[];
  colors: Record<string, string>;
  mode: ScoreMode;
}) {
  const reduce = useReducedMotion();
  const data = useMemo(
    () =>
      ORDER.map((m) => ({
        mode: MODE_LABEL[m],
        ...Object.fromEntries(people.map((p) => [p.memberId, Number(shareFor(p, m).toFixed(2))])),
      })),
    [people]
  );
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(people.map((p) => [p.memberId, { label: p.person, color: colors[p.memberId] }])),
    [people, colors]
  );

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Shares across modes</p>
      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="mode" tickLine={false} axisLine={false} tickMargin={6} interval={0} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={40} unit="%" fontSize={11} tickFormatter={(v) => Math.round(v).toString()} />
          <ReferenceLine x={MODE_LABEL[mode]} stroke="var(--foreground)" strokeOpacity={0.25} strokeDasharray="4 3" />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" formatter={(v, name) => (
            <span className="flex w-full justify-between gap-3">
              <span className="text-muted-foreground">{config[name as string]?.label}</span>
              <span className="font-mono tabular-nums">{Number(v).toFixed(1)}%</span>
            </span>
          )} />} />
          {people.map((p) => (
            <Line
              key={p.memberId}
              dataKey={p.memberId}
              stroke={`var(--color-${p.memberId})`}
              strokeWidth={2}
              dot={{ r: 3, fill: `var(--color-${p.memberId})` }}
              activeDot={{ r: 5 }}
              isAnimationActive={!reduce}
              animationDuration={700}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="mt-1 text-xs text-muted-foreground">
        Rising lines gain under merit; falling lines do better split equally.
      </p>
    </div>
  );
}
