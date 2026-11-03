"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { contributionsInWindow } from "@/lib/contribution-window";
import { normalizeContributions } from "@/lib/explain/normalize";
import { judgeRunCount } from "@/lib/explain/limits";
import AILoadingState, { type AgentStep } from "@/components/kokonutui/ai-loading";

/**
 * The scoring pipeline as it actually runs on the server:
 * normalize → judge ×3 → compute → explain.
 *
 * Labels and counts are real (computed here with the same normalizer the
 * server uses). The request is a single call, so the step a user sees as
 * "running" is paced by an estimate while it's in flight; `done` flips every
 * step complete the moment the server answers, and `failed` marks the current
 * step as the one that stopped.
 */
export function ScoringProgress({
  project,
  done,
  failed,
}: {
  project: Project;
  done: boolean;
  failed: boolean;
}) {
  const plan = useMemo(() => {
    const scoped = contributionsInWindow(project);
    const normalized = normalizeContributions(scoped, project.members);
    const items = normalized.contributions.length;
    const merges = normalized.dropped.filter((d) => d.reason === "merge_commit").length;
    const trivial = normalized.dropped.filter((d) => d.reason === "trivial_change").length;
    const folded = scoped.length - items - normalized.dropped.length;
    const excluded = project.contributions.length - scoped.length;
    const runs = judgeRunCount(items);
    return [
      {
        id: "read",
        label: `Reading ${scoped.length} activities`,
        detail: [
          excluded > 0
            ? `${excluded} older than the GitHub date skipped`
            : folded > 0
              ? `${folded} commits folded into their pull requests`
              : "matching items to members",
          merges + trivial > 0 ? `${merges + trivial} dropped (merge commits, typo fixes)` : "nothing dropped",
          normalized.unassigned.length > 0
            ? `${normalized.unassigned.length} not mapped to a member`
            : `${items} items attributed`,
        ],
      },
      {
        id: "judge",
        label: `Judging ${items} items · ${runs} independent runs`,
        detail: [
          "impact and complexity, 1–5 each",
          "quiet work scored on the same scale as code",
          "median across runs to check confidence",
        ],
      },
      {
        id: "compute",
        label: "Computing the split in code",
        detail: ["value = impact × complexity × category weight", "every mode sums to exactly 100%"],
      },
      {
        id: "explain",
        label: `Writing a reason for each of ${project.members.length} people`,
        detail: ["citing only the evidence it was given"],
      },
    ];
  }, [project]);

  // Estimated pacing while the request is in flight; never reaches the last step on its own.
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (done || failed) return;
    const timer = window.setInterval(() => setIndex((i) => Math.min(i + 1, plan.length - 1)), 1100);
    return () => window.clearInterval(timer);
  }, [done, failed, plan]);

  const steps: AgentStep[] = plan.map((step, i) => ({
    ...step,
    status: done ? "done" : i < index ? "done" : i === index ? (failed ? "error" : "running") : "pending",
  }));

  return <AILoadingState steps={steps} collapseWhenDone={false} className="mx-auto w-full max-w-md" />;
}
