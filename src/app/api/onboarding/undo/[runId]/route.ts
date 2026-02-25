import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";

type Ctx = { params: Promise<{ runId: string }> };

async function postImpl(_req: NextRequest, ctx: Ctx) {
  if (!onboardingV1Enabled()) {
    return NextResponse.json({ ok: false, error: "Onboarding v1 disabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { runId: raw } = await ctx.params;
  const runId = (raw ?? "").trim();
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const run = await prisma.onboardingRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, undoSnapshotJson: true },
  });
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  // v1 stub: snapshot persistence is mandatory, full undo will be added next.
  // We return what would be undone at a high level without exposing row contents.
  const snap = run.undoSnapshotJson as any;
  const createdIds = Array.isArray(snap?.createdIds) ? snap.createdIds.length : 0;
  const updated = Array.isArray(snap?.updated) ? snap.updated.length : 0;
  const deleted = Array.isArray(snap?.deleted) ? snap.deleted.length : 0;

  return NextResponse.json({
    ok: true,
    stub: true,
    runId: run.id,
    undoSummary: { createdIds, updated, deleted },
    message: "Undo stub: snapshot is stored; full undo not implemented yet.",
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const guarded = withApiGuard((r) => postImpl(r, ctx));
  return guarded(req);
}

