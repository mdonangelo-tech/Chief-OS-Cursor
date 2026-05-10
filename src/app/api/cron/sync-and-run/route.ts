import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { asDbErrorInfo } from "@/lib/db-errors";
import { syncGmailForUser } from "@/services/gmail/sync";
import { syncCalendarForUser } from "@/services/calendar/sync";
import { enrichUpcomingCalendarEvents } from "@/services/classification/calendar";
import { runAutoArchiveBatch } from "@/services/declutter/run-auto-archive-batch";
import { sendMorningBriefEmailForUser } from "@/services/morning-brief-email/send";

export const dynamic = "force-dynamic";

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export const GET = withApiGuard(async (req: NextRequest) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();

  let userIds: string[] = [];
  try {
    const rows = await prisma.googleAccount.findMany({
      select: { userId: true },
      distinct: ["userId"],
    });
    userIds = rows.map((r) => r.userId).filter(Boolean);
  } catch (e) {
    const db = asDbErrorInfo(e);
    if (db) {
      return NextResponse.json(
        { ok: false, error: db.message, code: db.code },
        { status: 503 }
      );
    }
    throw e;
  }

  const users: Array<{
    userId: string;
    gmail?: { accounts: number; errors: string[] };
    calendar?: { accounts: number; errors: string[] };
    autoArchive?: { processed: number; remainingEligible: number };
    morningBriefEmail?: { status: string; reason?: string; messageId?: string };
    errors: string[];
  }> = [];

  let totalGmailAccounts = 0;
  let totalCalendarAccounts = 0;
  let totalAutoArchived = 0;

  for (const userId of userIds) {
    const row: (typeof users)[number] = { userId, errors: [] };

    try {
      const gmail = await syncGmailForUser(userId);
      totalGmailAccounts += gmail.length;
      row.gmail = {
        accounts: gmail.length,
        errors: gmail.flatMap((r) => (r.errors ?? []).map((e) => `${r.email}: ${e}`)),
      };
    } catch (e) {
      const db = asDbErrorInfo(e);
      row.errors.push(db?.message ?? (e as Error).message);
    }

    try {
      const calendar = await syncCalendarForUser(userId);
      await enrichUpcomingCalendarEvents(userId);
      totalCalendarAccounts += calendar.length;
      row.calendar = {
        accounts: calendar.length,
        errors: calendar.flatMap((r) => (r.errors ?? []).map((e) => `${r.email}: ${e}`)),
      };
    } catch (e) {
      const db = asDbErrorInfo(e);
      row.errors.push(db?.message ?? (e as Error).message);
    }

    try {
      const autoArchive = await runAutoArchiveBatch(userId, { maxPerCall: 100 });
      totalAutoArchived += autoArchive.processed;
      row.autoArchive = {
        processed: autoArchive.processed,
        remainingEligible: autoArchive.remainingEligible,
      };
    } catch (e) {
      const db = asDbErrorInfo(e);
      row.errors.push(db?.message ?? (e as Error).message);
    }

    try {
      const morningBriefEmail = await sendMorningBriefEmailForUser(userId);
      row.morningBriefEmail = morningBriefEmail;
    } catch (e) {
      const db = asDbErrorInfo(e);
      row.errors.push(db?.message ?? (e as Error).message);
    }

    users.push(row);
  }

  const finishedAt = new Date();
  return NextResponse.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    usersProcessed: users.length,
    totals: {
      gmailAccounts: totalGmailAccounts,
      calendarAccounts: totalCalendarAccounts,
      autoArchived: totalAutoArchived,
    },
    users,
  });
});

