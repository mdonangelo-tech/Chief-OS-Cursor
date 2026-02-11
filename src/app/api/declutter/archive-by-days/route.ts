import { auth } from "@/auth";
import { runArchiveByDays } from "@/services/declutter/archive-by-days";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/declutter/archive-by-days
 * Manual archive: emails older than X days in archive-eligible categories.
 * ?days=7&dryRun=true for preview.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "7", 10);
  const dryRun = url.searchParams.get("dryRun") === "true";
  try {
    const result = await runArchiveByDays(session.user.id, days, dryRun);
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error("Archive by days error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
