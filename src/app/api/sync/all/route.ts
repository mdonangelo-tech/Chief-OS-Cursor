import { auth } from "@/auth";
import { syncGmailForUser } from "@/services/gmail/sync";
import { syncCalendarForUser } from "@/services/calendar/sync";
import { enrichUpcomingCalendarEvents } from "@/services/classification/calendar";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * POST /api/sync/all
 * Manual sync for the signed-in user. Runs Gmail + Calendar (and calendar enrichment when enabled).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run sequentially to avoid clobbering per-account syncStateJson updates.
    const gmail = await syncGmailForUser(session.user.id);
    const calendar = await syncCalendarForUser(session.user.id);
    const enrichment = await enrichUpcomingCalendarEvents(session.user.id);

    const hasErrors =
      gmail.some((r) => r.errors?.length) || calendar.some((r) => r.errors?.length);

    const allAccountsNeedReconnect =
      gmail.length > 0 &&
      calendar.length > 0 &&
      gmail.every((r) =>
        (r.errors ?? []).some((e) => e.toLowerCase().includes("reconnect"))
      ) &&
      calendar.every((r) =>
        (r.errors ?? []).some((e) => e.toLowerCase().includes("reconnect"))
      );

    // Ensure dashboard pages reflect new data immediately.
    revalidatePath("/brief");
    revalidatePath("/settings/declutter");
    revalidatePath("/settings/declutter/preview");
    revalidatePath("/settings/accounts");

    return NextResponse.json({
      ok: true,
      gmail,
      calendar,
      enrichment: enrichment.total > 0 ? enrichment : undefined,
      hasErrors,
      reconnectRequired: allAccountsNeedReconnect,
    });
  } catch (err) {
    console.error("Sync all error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

