import { auth } from "@/auth";
import { archiveMessage } from "@/services/gmail/actions";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/gmail/archive
 * Archive a message (user-initiated). Applies ChiefOS/Archived label, writes audit log.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { messageId, googleAccountId, reason, confidence } = body as {
    messageId?: string;
    googleAccountId?: string;
    reason?: string;
    confidence?: number;
  };

  if (!messageId || !googleAccountId) {
    return NextResponse.json(
      { error: "messageId and googleAccountId required" },
      { status: 400 }
    );
  }

  try {
    const { auditLogId } = await archiveMessage(
      session.user.id,
      googleAccountId,
      messageId,
      reason ?? "manual",
      confidence
    );
    return NextResponse.json({ ok: true, auditLogId });
  } catch (err) {
    console.error("Archive error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
