import { auth } from "@/auth";
import { syncCalendarForUser } from "@/services/calendar/sync";
import { enrichUpcomingCalendarEvents } from "@/services/classification/calendar";
import { NextResponse } from "next/server";

/**
 * POST /api/sync/calendar
 * Manual Calendar sync. Syncs 90 days past + 90 days future. If LLM enabled, enriches upcoming events.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncCalendarForUser(session.user.id);
    const enrichment = await enrichUpcomingCalendarEvents(session.user.id);
    return NextResponse.json({
      ok: true,
      results,
      enrichment: enrichment.total > 0 ? enrichment : undefined,
    });
  } catch (err) {
    console.error("Calendar sync error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
