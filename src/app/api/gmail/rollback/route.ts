import { auth } from "@/auth";
import { rollbackArchive } from "@/services/gmail/actions";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/gmail/rollback
 * Undo an archive. Restores INBOX and original labels from audit snapshot.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { auditLogId } = body as { auditLogId?: string };

  if (!auditLogId) {
    return NextResponse.json(
      { error: "auditLogId required" },
      { status: 400 }
    );
  }

  try {
    await rollbackArchive(session.user.id, auditLogId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Rollback error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
