import { NextResponse } from "next/server";
import { getProject, syncContributions } from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST /api/contributions/sync — pull GitHub + Trello activity (demo mocks). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId, source } = body ?? {};

    if (!projectId || !getProject(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const requested = source ?? "both";
    if (!["github", "trello", "both"].includes(requested)) {
      return NextResponse.json(
        { error: "source must be github, trello or both." },
        { status: 400 }
      );
    }

    const contributions = syncContributions(
      projectId,
      requested as "github" | "trello" | "both"
    );
    const project = getProject(projectId)!;

    return NextResponse.json({
      synced: contributions.length,
      contributions,
      project,
      note:
        process.env.DEMO_MODE === "true" || !process.env.GITHUB_TOKEN
          ? "Demo mode: sample activity generated (no external calls)."
          : "Synced.",
    });
  } catch (error) {
    console.error("POST /api/contributions/sync failed", error);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
