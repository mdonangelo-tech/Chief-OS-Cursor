import { auth } from "@/auth";
import { runAutoArchive } from "@/services/declutter/auto-archive";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/declutter/auto-archive
 * Run auto-archive now. ?dryRun=true to preview without archiving.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  try {
    const result = await runAutoArchive(session.user.id, dryRun);
    return NextResponse.json({
      ok: true,
      dryRun,
      ...result,
    });
  } catch (err) {
    console.error("Auto-archive error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
