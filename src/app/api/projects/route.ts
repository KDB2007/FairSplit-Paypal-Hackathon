import { NextResponse } from "next/server";
import type { SplitPhilosophy } from "@/lib/types";
import {
  createProject,
  getOrCreateDemo,
  listProjects,
  summarise,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST /api/projects — create a project with members. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, totalAmount, philosophy, members } = body ?? {};

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A total amount greater than zero is required." },
        { status: 400 }
      );
    }
    if (!Array.isArray(members) || members.length < 1) {
      return NextResponse.json(
        { error: "At least one member is required." },
        { status: 400 }
      );
    }
    const validPhilosophy: SplitPhilosophy[] = ["equal", "merit", "hybrid"];
    if (!validPhilosophy.includes(philosophy)) {
      return NextResponse.json(
        { error: "philosophy must be equal, merit or hybrid." },
        { status: 400 }
      );
    }

    const cleaned = members
      .filter((m: { name?: string }) => m?.name?.trim())
      .map((m: { name: string; email?: string; role?: "lead" | "member"; confirmed?: boolean }) => ({
        name: String(m.name).trim(),
        email: String(m.email ?? "").trim(),
        role: m.role === "lead" ? ("lead" as const) : ("member" as const),
        confirmed: Boolean(m.confirmed),
      }));

    if (cleaned.length < 1) {
      return NextResponse.json(
        { error: "At least one member with a name is required." },
        { status: 400 }
      );
    }

    const project = createProject({
      name,
      totalAmount: amount,
      philosophy,
      members: cleaned,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects failed", error);
    return NextResponse.json({ error: "Failed to create project." }, { status: 500 });
  }
}

/** GET /api/projects — list projects (seeds the demo on first call). */
export async function GET() {
  getOrCreateDemo();
  return NextResponse.json({ projects: listProjects().map(summarise) });
}
