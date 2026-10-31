import { NextResponse } from "next/server";
import type { ContribType } from "@/lib/types";
import { getProject, newId, saveProject } from "@/lib/store";

export const dynamic = "force-dynamic";

const VALID_TYPES: ContribType[] = ["commit", "pr", "trello", "manual"];

/** POST /api/contributions — manually log work. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, person, type, title, hours, evidenceUrl } = body ?? {};

    if (!projectId || !getProject(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (!person || !title) {
      return NextResponse.json(
        { error: "person and title are required." },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "type must be commit, pr, trello or manual." },
        { status: 400 }
      );
    }

    const project = getProject(projectId)!;
    const member = project.members.find(
      (m) => m.name.toLowerCase() === String(person).toLowerCase()
    );
    if (!member) {
      return NextResponse.json(
        { error: "person must match a project member." },
        { status: 400 }
      );
    }

    const contribution = {
      id: newId("con"),
      projectId,
      person: member.name,
      type: type as ContribType,
      sourceId: newId("manual"),
      title: String(title),
      hours: hours != null && hours !== "" ? Number(hours) : undefined,
      timestamp: new Date().toISOString(),
      evidenceUrl: evidenceUrl ? String(evidenceUrl) : undefined,
    };

    project.contributions.push(contribution);
    saveProject(project);

    return NextResponse.json({ contribution, project }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contributions failed", error);
    return NextResponse.json(
      { error: "Failed to log contribution." },
      { status: 500 }
    );
  }
}
