import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import { batchArchiveMessages } from "@/services/gmail/actions";
import { updateDbLabelsAfterBatch } from "@/services/declutter/run-auto-archive-batch";

const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;
const DEFAULT_MAX_PER_CALL = 1000;

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

export type RunAgeArchiveBatchResult = {
  ok: true;
  runId: string;
  processed: number;
  excludedProtectedCount: number;
};

/**
 * Archive (thread-aware) inbox messages older than `days`.
 * - Uses DB (EmailEvent) for thread-awareness + protected categories.
 * - Executes Gmail actions in batches and updates DB labels for freshness.
 */
export async function runAgeArchiveBatch(
  userId: string,
  opts: { days: number; maxPerCall?: number }
): Promise<RunAgeArchiveBatchResult> {
  const days = Math.min(365, Math.max(1, opts.days));
  const maxPerCall = opts.maxPerCall ?? DEFAULT_MAX_PER_CALL;
  const runId = randomUUID();

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return { ok: true, runId, processed: 0, excludedProtectedCount: 0 };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const ctx = await buildDeclutterDecisionCtx(userId, new Date());
  const categoriesById = ctx.categoriesById;

  const alreadyActioned = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          userId,
          actionType: { in: ["ARCHIVE", "SPAM"] },
          messageId: { not: null },
        },
        select: { messageId: true },
      })
    )
      .map((a) => a.messageId)
      .filter(Boolean) as string[]
  );

  const toArchiveByAccount = new Map<string, string[]>();
  let processed = 0;
  let excludedProtectedCount = 0;

  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN && processed < maxPerCall) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        date: { lte: cutoff },
        messageId: { notIn: Array.from(alreadyActioned) },
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
      if (processed >= maxPerCall) break;

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

      if (!toArchiveByAccount.has(e.googleAccountId)) toArchiveByAccount.set(e.googleAccountId, []);
      toArchiveByAccount.get(e.googleAccountId)!.push(e.messageId);
      processed++;
    }
  }

  // Execute Gmail archive + update DB label state for freshness.
  let archived = 0;
  for (const [googleAccountId, ids] of toArchiveByAccount) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const res = await batchArchiveMessages(userId, googleAccountId, chunk, `age-archive-${days}d`, runId);
      archived += res.archived;
      await updateDbLabelsAfterBatch(chunk, CHIEFOS_ARCHIVED_LABEL);
    }
  }

  return { ok: true, runId, processed: archived, excludedProtectedCount };
}

