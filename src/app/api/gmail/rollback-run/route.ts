import { auth } from "@/auth";
import { rollbackRun } from "@/services/gmail/actions";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/gmail/rollback-run
 * Undo an entire auto-archive run.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { runId } = body as { runId?: string };
  if (!runId) {
    return NextResponse.json(
      { error: "runId required" },
      { status: 400 }
    );
  }
  try {
    const result = await rollbackRun(session.user.id, runId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
