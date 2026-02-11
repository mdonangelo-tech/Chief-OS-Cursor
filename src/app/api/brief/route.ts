import { auth } from "@/auth";
import { getBriefPayload } from "@/services/brief/api-brief";
import { NextResponse } from "next/server";

/**
 * GET /api/brief
 * Returns structured brief payload for the Morning Brief page.
 * Frontend must use this; do not query raw tables.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const payload = await getBriefPayload(session.user.id);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Brief API error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
