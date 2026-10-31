import { NextResponse } from "next/server";
import type { Project, ScoreMode, SplitProposal } from "@/lib/types";
import { getProject, proposalsToDecisions, saveProject } from "@/lib/store";
import {
  ScoreError,
  modePercentages,
  scoreProjectExplainable,
} from "@/lib/explain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function proposalsFromSplit(
  project: Project,
  split: Awaited<ReturnType<typeof scoreProjectExplainable>>,
  mode: ScoreMode
): SplitProposal[] {
  const percentages = new Map(
    modePercentages(split, mode).map((entry) => [entry.person, entry.percentage])
  );

  return split.people.map((person) => {
    const own = split.contributions.filter(
      (contribution) => contribution.memberId === person.memberId
    );
    const avgImpact =
      own.length > 0
        ? own.reduce((sum, contribution) => sum + contribution.impact, 0) / own.length
        : 1;
    const avgComplexity =
      own.length > 0
        ? own.reduce((sum, contribution) => sum + contribution.complexity, 0) / own.length
        : 1;
    const hours = own.reduce((sum, contribution) => sum + contribution.hours, 0);

    return {
      id: `prop_${project.id}_${person.memberId}`,
      projectId: project.id,
      person: person.person,
      // Existing proposal fields stay on their 1-10 scale for the review screen.
      impact: Math.round(Math.min(10, Math.max(1, avgImpact * 2))),
      complexity: Math.round(Math.min(10, Math.max(1, avgComplexity * 2))),
      effort: Math.round(Math.min(10, Math.max(1, hours / 2))),
      percentage: percentages.get(person.person) ?? 0,
      reason: person.reason,
      evidenceRefs: person.evidenceIds,
      aiGenerated: true,
    };
  });
}

/**
 * POST /api/score
 *
 * Runs the Explainable Split pipeline: normalize → judge (×3) → compute →
 * explain → confidence. The response contains integer-cent amounts per mode,
 * so the client never needs another model call to switch or re-check a split.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { projectId, mode } = (body ?? {}) as { projectId?: string; mode?: ScoreMode };

  const project = projectId ? getProject(projectId) : undefined;
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const split = await scoreProjectExplainable(project);
    const chosenMode: ScoreMode = mode ?? split.defaultMode;

    project.scoredSplit = split;
    project.proposals = proposalsFromSplit(project, split, chosenMode);
    project.status = project.status === "paid" ? "paid" : "scored";
    proposalsToDecisions(project);
    saveProject(project);

    return NextResponse.json({
      project,
      split,
      proposals: project.proposals,
      decisions: project.decisions,
      source: split.formula.source === "llm" ? "llm" : "canned",
    });
  } catch (error) {
    if (error instanceof ScoreError) {
      const status = error.code === "NO_MEMBERS" ? 400 : 502;
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status }
      );
    }
    console.error("Explainable scoring failed:", error);
    return NextResponse.json(
      {
        error: "Scoring failed. Try again.",
        code: "MODEL_FAILED",
        details: [String((error as Error)?.message ?? error)],
      },
      { status: 502 }
    );
  }
}
