import { NextResponse } from "next/server";
import { getProject, newId, saveProject } from "@/lib/store";
import { syncProject, type SyncSource } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/contributions/sync — pull GitHub + Trello activity (mocked in DEMO_MODE). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId, source } = body ?? {};

    const project = projectId ? getProject(projectId) : undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const requested = (source ?? "both") as SyncSource;
    if (!["github", "trello", "both"].includes(requested)) {
      return NextResponse.json(
        { error: "source must be github, trello or both." },
        { status: 400 }
      );
    }
    if (project.status === "paid") {
      return NextResponse.json(
        { error: "This project has already been paid out." },
        { status: 409 }
      );
    }

    const report = await syncProject(project, requested, { newId });
    saveProject(project);

    return NextResponse.json({
      synced: report.added,
      report,
      project,
    });
  } catch (error) {
    console.error("POST /api/contributions/sync failed", error);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
