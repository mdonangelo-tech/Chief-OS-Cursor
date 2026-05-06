import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { PreviewAutoArchiveResponse } from "@/types/declutter";
import { withApiGuard } from "@/lib/api/api-guard";

const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;

type ScanRow = {
  id: string;
  googleAccountId: string;
  threadId: string;
  date: Date;
  from_: string;
  senderDomain: string | null;
  classificationCategoryId: string | null;
  confidence: number | null;
  explainJson: unknown;
};

function normalizePolicyAction(action: string): string {
  return (action ?? "").toLowerCase().trim();
}

async function getImpl(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const horizonDaysRaw = _req.nextUrl.searchParams.get("horizonDays");
  const horizonDays = horizonDaysRaw
    ? Math.min(365, Math.max(0, parseInt(horizonDaysRaw, 10) || 0))
    : 0;
  const now = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true, syncStateJson: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    const empty: PreviewAutoArchiveResponse = {
      ok: true,
      total: 0,
      byCategory: [],
      oldestDate: null,
      newestDate: null,
      protectedBlockedCount: 0,
      debug: {
        generatedAt: new Date().toISOString(),
        horizonDays,
        previewNow: now.toISOString(),
        scanned: 0,
        accountCount: 0,
        note:
          "This preview reads EmailEvent rows in Postgres. If it looks stale, run Sync to reconcile INBOX label state from Gmail.",
      },
    };
    return NextResponse.json(empty);
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);
  const categoriesById = ctx.categoriesById;

  // Performance: only scan messages old enough to possibly be eligible.
  // (Eligibility is determined by decision.archiveAt <= now.)
  let minEligibleDays: number | null = null;
  for (const p of Object.values(ctx.categoryPoliciesById)) {
    if (!p) continue;
    const a = normalizePolicyAction(p.action);
    if (a === "archive_after_48h") {
      minEligibleDays = minEligibleDays == null ? 2 : Math.min(minEligibleDays, 2);
    } else if (a === "archive_after_days" || a === "archive_after_n_days") {
      const n = p.archiveAfterDays;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) {
        minEligibleDays = minEligibleDays == null ? n : Math.min(minEligibleDays, n);
      }
    }
  }

  const cutoff = minEligibleDays != null
    ? new Date(now.getTime() - minEligibleDays * 24 * 60 * 60 * 1000)
    : null;

  let protectedBlockedCount = 0;
  const eligibleByCategory = new Map<string | null, number>();
  let oldestDate: string | null = null;
  let newestDate: string | null = null;

  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        ...(cutoff ? { date: { lte: cutoff } } : {}),
      },
      select: {
        id: true,
        googleAccountId: true,
        threadId: true,
        date: true,
        from_: true,
        senderDomain: true,
        classificationCategoryId: true,
        confidence: true,
        explainJson: true,
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (page.length === 0) break;

    cursorId = page[page.length - 1].id;

    const threadIds = Array.from(new Set(page.map((p) => p.threadId)));
    const threadMaxRows = await prisma.emailEvent.groupBy({
      by: ["googleAccountId", "threadId"],
      where: {
        googleAccountId: { in: accountIds },
        threadId: { in: threadIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
      },
      _max: { date: true },
    });
    const threadMaxByKey = new Map<string, Date>();
    for (const r of threadMaxRows) {
      if (r._max.date) threadMaxByKey.set(`${r.googleAccountId}:${r.threadId}`, r._max.date);
    }

    for (const e of page) {
      scanned++;
      const effectiveDate =
        threadMaxByKey.get(`${e.googleAccountId}:${e.threadId}`) ?? e.date;
      const decision = decideEmail(
        {
          id: e.id,
          googleAccountId: e.googleAccountId,
          date: effectiveDate,
          from_: e.from_,
          senderDomain: e.senderDomain,
          classificationCategoryId: e.classificationCategoryId,
          confidence: e.confidence,
          explainJson: e.explainJson,
        },
        ctx
      );

      const wasBlockedByProtection = decision.reason.overrides.some(
        (o) => o.overriddenSource === "protectedCategory"
      );
      // Count cases where protection prevented an archive/spam action.
      if (
        wasBlockedByProtection &&
        decision.action !== "ARCHIVE_AT" &&
        decision.action !== "SPAM"
      ) {
        protectedBlockedCount++;
      }

      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
      if (!decision.archiveAt) continue;
      if (new Date(decision.archiveAt).getTime() > now.getTime()) continue;

      const k = decision.finalCategoryId;
      eligibleByCategory.set(k, (eligibleByCategory.get(k) ?? 0) + 1);

      const iso = effectiveDate.toISOString();
      if (!oldestDate) oldestDate = iso;
      newestDate = iso;
      if (scanned >= MAX_SCAN) break;
    }
  }

  const byCategory = Array.from(eligibleByCategory.entries())
    .map(([categoryId, count]) => ({
      categoryId,
      categoryName: categoryId ? categoriesById[categoryId]?.name ?? "—" : "Uncategorized",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const total = byCategory.reduce((s, x) => s + x.count, 0);

  const res: PreviewAutoArchiveResponse = {
    ok: true,
    total,
    byCategory,
    oldestDate,
    newestDate,
    protectedBlockedCount,
    debug: {
      generatedAt: new Date().toISOString(),
      horizonDays,
      previewNow: now.toISOString(),
      scanned,
      accountCount: accountIds.length,
      accounts: accounts.map((a) => {
        const syncState = (a.syncStateJson as Record<string, unknown> | null) ?? {};
        const authError =
          (syncState.authError as { code?: unknown; message?: unknown } | null) ?? null;
        return {
          id: a.id,
          email: a.email,
          lastSyncAt:
            typeof syncState.lastSyncAt === "string" ? (syncState.lastSyncAt as string) : null,
          lastGmailAttemptAt:
            typeof syncState.lastGmailAttemptAt === "string"
              ? (syncState.lastGmailAttemptAt as string)
              : null,
          lastCalendarAttemptAt:
            typeof syncState.lastCalendarAttemptAt === "string"
              ? (syncState.lastCalendarAttemptAt as string)
              : null,
          lastGmailCursorAt:
            typeof syncState.lastGmailCursorAt === "string"
              ? (syncState.lastGmailCursorAt as string)
              : null,
          lastGmailBackfillBeforeAt:
            typeof syncState.lastGmailBackfillBeforeAt === "string"
              ? (syncState.lastGmailBackfillBeforeAt as string)
              : null,
          gmailCatchupCursorDay:
            typeof syncState.gmailCatchupCursorDay === "string"
              ? (syncState.gmailCatchupCursorDay as string)
              : null,
          authErrorCode: typeof authError?.code === "string" ? (authError.code as string) : null,
        };
      }),
      note:
        "If this preview is stale, it usually means EmailEvent.labels still includes INBOX for messages already archived/moved in Gmail. Sync reconciles that label state.",
    },
  };
  return NextResponse.json(res);
}

export const GET = withApiGuard(getImpl);

