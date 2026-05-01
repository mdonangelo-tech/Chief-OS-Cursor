import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runAutoArchiveBatch } from "@/services/declutter/run-auto-archive-batch";
import type { RunAutoArchiveResponse } from "@/types/declutter";
import { withApiGuard } from "@/lib/api/api-guard";

export const GET = withApiGuard(async (_req: NextRequest) => {
  // Browsers show a scary error page for 405s; return a friendly 200 JSON instead.
  return NextResponse.json({
    ok: false,
    error: "Use POST /api/declutter/run-auto-archive to run auto-archive.",
    hint: "If you want a read-only preview, use GET /api/declutter/preview-auto-archive.",
  });
});

async function postImpl(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const result = await runAutoArchiveBatch(userId, { now, maxPerCall: 100 });
  const res: RunAutoArchiveResponse = {
    ok: true,
    processed: result.processed,
    remainingEligible: result.remainingEligible,
  };
  return NextResponse.json(res);
}

export const POST = withApiGuard(postImpl);

