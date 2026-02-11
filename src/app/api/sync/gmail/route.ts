import { auth } from "@/auth";
import { syncGmailForUser } from "@/services/gmail/sync";
import { NextResponse } from "next/server";

/**
 * POST /api/sync/gmail
 * Manual Gmail sync for the signed-in user. Syncs Inbox only, last 90 days, for all connected accounts.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncGmailForUser(session.user.id);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Gmail sync error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
