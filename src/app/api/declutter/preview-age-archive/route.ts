import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { fetchMessageMetadata } from "@/services/gmail/client";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { PreviewAgeArchiveResponse } from "@/types/declutter";
import { withApiGuard } from "@/lib/api/api-guard";

const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;

type ScanRow = {
  id: string;
  googleAccountId: string;
  messageId: string;
  threadId: string;
  date: Date;
  from_: string;
  senderDomain: string | null;
  classificationCategoryId: string | null;
  confidence: number | null;
  explainJson: unknown;
};

function clampDays(raw: string | null): number {
  const n = parseInt(raw ?? "30", 10);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
}

async function getImpl(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const days = clampDays(new URL(req.url).searchParams.get("days"));
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true, syncStateJson: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    const empty: PreviewAgeArchiveResponse = {
      ok: true,
      total: 0,
      byCategory: [],
      oldestDate: null,
      newestDate: null,
      excludedProtectedCount: 0,
      debug: {
        generatedAt: new Date().toISOString(),
        days,
        cutoff: cutoff.toISOString(),
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

  // Best-effort freshness pass:
  // The preview is driven by EmailEvent.labels containing "INBOX". If the user archived mail in Gmail,
  // older rows may stay stale because the regular sync focuses on a rolling recent window.
  // Reconcile a capped number of "older_than" candidates before counting so this preview reflects Gmail.
  const RECONCILE_PER_ACCOUNT = 120;
  let reconcileAttempted = 0;
  let reconcileUpdated = 0;
  for (const accId of accountIds) {
    const toReconcile = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: accId,
        labels: { has: "INBOX" },
        date: { lte: cutoff },
      },
      select: { messageId: true },
      orderBy: { syncAt: "asc" },
      take: RECONCILE_PER_ACCOUNT,
    });
    for (const r of toReconcile) {
      reconcileAttempted++;
      try {
        const meta = await fetchMessageMetadata(accId, userId, r.messageId);
        if (!meta) {
          // Message no longer exists in Gmail; remove INBOX in DB so it doesn't appear as eligible.
          await prisma.emailEvent.update({
            where: { messageId: r.messageId },
            data: { labels: { set: [] }, unread: false, syncAt: new Date() },
          });
          reconcileUpdated++;
          continue;
        }
        await prisma.emailEvent.update({
          where: { messageId: r.messageId },
          data: {
            threadId: meta.threadId,
            from_: meta.from,
            to: meta.to,
            cc: meta.cc,
            subject: meta.subject,
            snippet: meta.snippet,
            date: meta.date,
            labels: meta.labels,
            unread: meta.unread,
            senderDomain: meta.senderDomain,
            syncAt: new Date(),
          },
        });
        reconcileUpdated++;
      } catch {
        // ignore per-message reconciliation errors
      }
    }
  }

  let excludedProtectedCount = 0;
  const byCategoryCounts = new Map<string | null, number>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        date: { lte: cutoff },
      },
      select: {
        id: true,
        googleAccountId: true,
        messageId: true,
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

    // Thread-aware age check:
    // only consider a message eligible if the most recent INBOX message in its thread
    // is also older than the cutoff.
    const threadKeys = new Set(page.map((p) => `${p.googleAccountId}:${p.threadId}`));
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
      const threadMax = threadMaxByKey.get(`${e.googleAccountId}:${e.threadId}`);
      if (threadMax && threadMax.getTime() > cutoff.getTime()) continue;
      const decision = decideEmail(
        {
          id: e.id,
          googleAccountId: e.googleAccountId,
          date: e.date,
          from_: e.from_,
          senderDomain: e.senderDomain,
          classificationCategoryId: e.classificationCategoryId,
          confidence: e.confidence,
          explainJson: e.explainJson,
        },
        ctx
      );

      const catId = decision.finalCategoryId;
      const cat = catId ? categoriesById[catId] : null;
      if (cat?.protectedFromAutoArchive) {
        excludedProtectedCount++;
        continue;
      }

      byCategoryCounts.set(catId, (byCategoryCounts.get(catId) ?? 0) + 1);

      if (!minDate || e.date.getTime() < minDate.getTime()) minDate = e.date;
      if (!maxDate || e.date.getTime() > maxDate.getTime()) maxDate = e.date;
      if (scanned >= MAX_SCAN) break;
    }
  }

  const byCategory = Array.from(byCategoryCounts.entries())
    .map(([categoryId, count]) => ({
      categoryId,
      categoryName: categoryId ? categoriesById[categoryId]?.name ?? "—" : "Uncategorized",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const total = byCategory.reduce((s, x) => s + x.count, 0);

  const res: PreviewAgeArchiveResponse = {
    ok: true,
    total,
    byCategory,
    oldestDate: minDate ? minDate.toISOString() : null,
    newestDate: maxDate ? maxDate.toISOString() : null,
    excludedProtectedCount,
    debug: {
      generatedAt: new Date().toISOString(),
      days,
      cutoff: cutoff.toISOString(),
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
          authErrorCode: typeof authError?.code === "string" ? (authError.code as string) : null,
        };
      }),
      note: `Freshness pass attempted ${reconcileAttempted} message(s), updated ${reconcileUpdated}. If totals still look stale, refresh again to reconcile more of the oldest eligible rows.`,
    },
  };
  return NextResponse.json(res);
}

export const GET = withApiGuard(getImpl);

