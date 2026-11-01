import { NextResponse } from "next/server";
import { DEMO_PROJECT_ID, confirmCharter, deleteProject, getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/projects/[id] — full project state. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(project);
}

/** DELETE /api/projects/[id] — remove a project. The demo project is protected. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (id === DEMO_PROJECT_ID) {
    return NextResponse.json(
      { error: "The demo project can't be deleted." },
      { status: 400 }
    );
  }
  if (!deleteProject(id)) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

/** PATCH /api/projects/[id] — confirm the charter. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "confirm-charter") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }
  const project = confirmCharter(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(project);
}
