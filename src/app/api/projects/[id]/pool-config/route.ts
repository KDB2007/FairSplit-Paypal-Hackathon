import { NextResponse } from "next/server";
import { getProject, updatePoolConfig } from "@/lib/store";
import { MAX_FINDER_BPS, MAX_LEAD_BPS, defaultPoolConfig, layerAmounts } from "@/lib/layers";
import { toCents } from "@/lib/explain/rounding";
import type { PoolConfig, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function preview(project: Project) {
  const poolConfig = project.poolConfig ?? defaultPoolConfig(project.philosophy);
  return {
    poolConfig,
    layers: layerAmounts(toCents(project.totalAmount), poolConfig),
  };
}

function validate(project: Project, input: Partial<PoolConfig>): string[] {
  const errors: string[] = [];
  const isBps = (v: unknown, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
  const isMember = (v: unknown) =>
    v === null || project.members.some((m) => m.id === v);

  if (!isBps(input.finderBps, MAX_FINDER_BPS)) {
    errors.push(`finderBps must be an integer between 0 and ${MAX_FINDER_BPS}.`);
  }
  if (!isBps(input.leadBps, MAX_LEAD_BPS)) {
    errors.push(`leadBps must be an integer between 0 and ${MAX_LEAD_BPS}.`);
  }
  if (!isMember(input.finderMemberId)) {
    errors.push("finderMemberId must be a member id or null.");
  }
  if (!isMember(input.leadMemberId)) {
    errors.push("leadMemberId must be a member id or null.");
  }
  if (!["equal", "merit", "hybrid"].includes(String(input.workPhilosophy))) {
    errors.push("workPhilosophy must be 'equal', 'merit', or 'hybrid'.");
  }
  return errors;
}

/**
 * POST /api/projects/[id]/pool-config
 * Saves the pool config as a new charter version. Every member must confirm
 * again, and any earlier scoring is discarded.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const input = (body?.poolConfig ?? null) as Partial<PoolConfig> | null;
  if (!input) {
    return NextResponse.json({ error: "poolConfig is required." }, { status: 400 });
  }

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (project.status === "paid") {
    return NextResponse.json(
      { error: "This project has already been paid out." },
      { status: 409 }
    );
  }

  const errors = validate(project, input);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  const updated = updatePoolConfig(id, {
    finderBps: input.finderBps!,
    finderMemberId: input.finderMemberId ?? null,
    leadBps: input.leadBps!,
    leadMemberId: input.leadMemberId ?? null,
    workPhilosophy: input.workPhilosophy!,
  })!;

  return NextResponse.json({ project: updated, ...preview(updated) });
}

/** GET /api/projects/[id]/pool-config — current config and the fee/work-pool waterfall. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(preview(project));
}
