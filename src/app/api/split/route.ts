import { NextResponse } from "next/server";
import { applyDecisions, getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

interface DecisionInput {
  person: string;
  finalPct: number;
  overrideNote?: string;
  status?: "proposed" | "approved" | "disputed";
}

/**
 * POST /api/split — approve / adjust / dispute decisions.
 * Percentages are auto-rescaled proportionally to keep the total at 100.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId, decisions } = body ?? {};

    const project = projectId ? getProject(projectId) : undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (!Array.isArray(decisions) || decisions.length === 0) {
      return NextResponse.json(
        { error: "decisions must be a non-empty array." },
        { status: 400 }
      );
    }

    const valid = project.members.map((m) => m.name.toLowerCase());
    for (const d of decisions as DecisionInput[]) {
      if (!valid.includes(String(d.person).toLowerCase())) {
        return NextResponse.json(
          { error: `Unknown member: ${d.person}` },
          { status: 400 }
        );
      }
      if (!Number.isFinite(Number(d.finalPct)) || Number(d.finalPct) < 0) {
        return NextResponse.json(
          { error: `Invalid percentage for ${d.person}.` },
          { status: 400 }
        );
      }
    }

    const result = applyDecisions(project, decisions as DecisionInput[]);

    return NextResponse.json({
      decisions: result.decisions,
      project: result.project,
      projectStatus: result.project.status,
    });
  } catch (error) {
    console.error("POST /api/split failed", error);
    return NextResponse.json(
      { error: "Failed to save split decisions." },
      { status: 500 }
    );
  }
}
