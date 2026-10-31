import { NextResponse } from "next/server";
import { setMemberIdentity } from "@/lib/store";
import { GITHUB_LOGIN_PATTERN, TRELLO_MEMBER_ID_PATTERN } from "@/lib/integrations/identity";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/projects/[id]/identities
 * Body: { memberId, githubLogin?, trelloMemberId?, trelloUsername? } — "" clears a handle.
 * Re-attributes already-synced items, so no re-sync is needed.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  const { memberId, githubLogin, trelloMemberId, trelloUsername } = body as Record<string, unknown>;

  if (typeof memberId !== "string" || !memberId) {
    return NextResponse.json({ error: "memberId is required." }, { status: 400 });
  }
  const asOptional = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  const github = asOptional(githubLogin);
  if (github && !GITHUB_LOGIN_PATTERN.test(github.trim())) {
    return NextResponse.json({ error: "Not a valid GitHub login." }, { status: 400 });
  }
  const trello = asOptional(trelloMemberId);
  if (trello && !TRELLO_MEMBER_ID_PATTERN.test(trello.trim())) {
    return NextResponse.json({ error: "Not a valid Trello member id." }, { status: 400 });
  }

  const result = setMemberIdentity(id, memberId, {
    githubLogin: github,
    trelloMemberId: trello,
    trelloUsername: asOptional(trelloUsername),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ project: result.project });
}
