import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { withApiGuard } from "@/lib/api/api-guard";
import { runAgeArchiveBatch } from "@/services/declutter/run-age-archive-batch";

async function postImpl(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const daysRaw = req.nextUrl.searchParams.get("days");
  const days = Math.min(365, Math.max(1, parseInt(daysRaw ?? "30", 10) || 30));

  const result = await runAgeArchiveBatch(session.user.id, { days, maxPerCall: 1000 });
  return NextResponse.json(result);
}

export const POST = withApiGuard(postImpl);

