"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import type { ScoredContribution, ScoredPerson } from "@/lib/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const CATEGORY_COUNT = 7;

/** 0–100 profile of one person, from their judged contributions. */
function profile(person: ScoredPerson, items: ScoredContribution[], maxHoursPct: number) {
  const own = items.filter((c) => c.memberId === person.memberId);
  const avg = (pick: (c: ScoredContribution) => number) =>
    own.length ? own.reduce((s, c) => s + pick(c), 0) / own.length : 0;
  return {
    impact: (avg((c) => c.impact) / 5) * 100,
    complexity: (avg((c) => c.complexity) / 5) * 100,
    quiet: person.quietValueSharePct,
    hours: maxHoursPct > 0 ? (person.hoursPct / maxHoursPct) * 100 : 0,
    breadth: (Object.keys(person.valueByCategory).length / CATEGORY_COUNT) * 100,
  };
}

const AXES = [
  { key: "impact", label: "Impact" },
  { key: "complexity", label: "Complexity" },
  { key: "quiet", label: "Quiet work" },
  { key: "hours", label: "Hours" },
  { key: "breadth", label: "Breadth" },
] as const;

/**
 * A contributor's shape at a glance, against the team average. Every axis is
 * derived from data already on the split (judged impact/complexity, quiet-work
 * share, hours share, and how many kinds of work they did).
 */
export function ContributorRadar({
  person,
  peers,
  contributions,
  color,
}: {
  person: ScoredPerson;
  peers: ScoredPerson[];
  contributions: ScoredContribution[];
  color: string;
}) {
  const reduce = useReducedMotion();
  const data = useMemo(() => {
    const maxHours = Math.max(0, ...peers.map((p) => p.hoursPct));
    const me = profile(person, contributions, maxHours);
    const all = peers.filter((p) => !p.zeroActivity).map((p) => profile(p, contributions, maxHours));
    const team = (key: keyof typeof me) => (all.length ? all.reduce((s, p) => s + p[key], 0) / all.length : 0);
    return AXES.map((axis) => ({ axis: axis.label, person: Math.round(me[axis.key]), team: Math.round(team(axis.key)) }));
  }, [person, peers, contributions]);

  const config: ChartConfig = {
    person: { label: person.person, color },
    team: { label: "Team average", color: "var(--muted-foreground)" },
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Contribution profile</span>
        <span className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} /> {person.person}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/60" /> Team avg
          </span>
        </span>
      </div>
      <ChartContainer config={config} className="mx-auto aspect-square h-56">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Radar
            dataKey="team"
            stroke="var(--color-team)"
            fill="var(--color-team)"
            fillOpacity={0.08}
            strokeDasharray="4 3"
            isAnimationActive={!reduce}
          />
          <Radar
            dataKey="person"
            stroke="var(--color-person)"
            fill="var(--color-person)"
            fillOpacity={0.28}
            strokeWidth={2}
            isAnimationActive={!reduce}
          />
        </RadarChart>
      </ChartContainer>
    </div>
  );
}
