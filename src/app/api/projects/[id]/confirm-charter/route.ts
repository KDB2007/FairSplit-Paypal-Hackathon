import { NextResponse } from "next/server";
import { getProject, isScoringUnlocked, setMemberConfirmation } from "@/lib/store";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function status(project: Project) {
  return {
    project,
    charterVersion: project.charterVersion,
    allConfirmed: project.members.every((m) => m.confirmed),
    scoringUnlocked: isScoringUnlocked(project),
    charterConfirmedAt: project.charterConfirmedAt,
  };
}

/**
 * PATCH /api/projects/[id]/confirm-charter
 * Body: { memberId, action: "confirm" | "unconfirm" } — one member's sign-off
 * on the current charter version.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { memberId, action } = (body ?? {}) as {
    memberId?: string;
    action?: "confirm" | "unconfirm";
  };

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required." }, { status: 400 });
  }
  if (action !== "confirm" && action !== "unconfirm") {
    return NextResponse.json(
      { error: "action must be 'confirm' or 'unconfirm'." },
      { status: 400 }
    );
  }

  const existing = getProject(id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!existing.members.some((m) => m.id === memberId)) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const project = setMemberConfirmation(id, memberId, action === "confirm")!;
  return NextResponse.json(status(project));
}

/** GET /api/projects/[id]/confirm-charter — confirmation status for the current version. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(status(project));
}
