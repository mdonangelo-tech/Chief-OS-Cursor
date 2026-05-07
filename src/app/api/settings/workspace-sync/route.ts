import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";

type Body = {
  timezone: string | null;
  morningPrepLocalTime: string | null; // HH:MM
  refreshMode: "morning_prep" | "smart_periodic" | "manual" | null;
  periodicRefreshHours: number | null;
};

function isTimeHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

async function postImpl(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const timezone =
    typeof body.timezone === "string" && body.timezone.trim()
      ? body.timezone.trim()
      : null;
  const morningPrepLocalTime =
    typeof body.morningPrepLocalTime === "string" && body.morningPrepLocalTime.trim()
      ? body.morningPrepLocalTime.trim()
      : null;
  const refreshMode = body.refreshMode ?? null;
  const periodicRefreshHours =
    typeof body.periodicRefreshHours === "number" && Number.isFinite(body.periodicRefreshHours)
      ? Math.max(1, Math.min(24, Math.round(body.periodicRefreshHours)))
      : null;

  if (morningPrepLocalTime && !isTimeHHMM(morningPrepLocalTime)) {
    return NextResponse.json({ ok: false, error: "Invalid morningPrepLocalTime" }, { status: 400 });
  }
  if (refreshMode && !["morning_prep", "smart_periodic", "manual"].includes(refreshMode)) {
    return NextResponse.json({ ok: false, error: "Invalid refreshMode" }, { status: 400 });
  }

  await prisma.userCalendarPreferences.upsert({
    where: { userId: session.user.id },
    update: {
      timezone,
      morningPrepLocalTime,
      refreshMode,
      periodicRefreshHours,
    },
    create: {
      userId: session.user.id,
      delegateEmails: [],
      familyKeywordRules: [],
      workDomainAllowlist: [],
      timezone,
      morningPrepLocalTime,
      refreshMode,
      periodicRefreshHours,
    },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

