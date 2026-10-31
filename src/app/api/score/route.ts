import { NextResponse } from "next/server";
import { proposalsToDecisions, saveProject, getProject } from "@/lib/store";
import { scoreProject } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** POST /api/score — LLM (or demo-safe heuristic) contribution scoring. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId } = body ?? {};

    const project = projectId ? getProject(projectId) : undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (project.members.length === 0) {
      return NextResponse.json(
        { error: "Add at least one member before scoring." },
        { status: 400 }
      );
    }

    const { proposals, source } = await scoreProject(project);
    proposalsToDecisions(project);
    saveProject(project);

    return NextResponse.json({
      proposals,
      decisions: project.decisions,
      project,
      source,
      mode:
        source === "llm"
          ? "Scored with OpenAI gpt-4o-mini."
          : "Demo-safe scoring (canned heuristic).",
    });
  } catch (error) {
    console.error("POST /api/score failed", error);
    return NextResponse.json({ error: "Scoring failed." }, { status: 500 });
  }
}
