import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { batchArchiveMessages, batchSpamMessages } from "@/services/gmail/actions";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import { Prisma } from "@prisma/client";

const DEFAULT_MAX_PER_CALL = 1000;
const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;

type ScanRow = {
  id: string;
  googleAccountId: string;
  threadId: string;
  messageId: string;
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

export type RunAutoArchiveBatchResult = {
  ok: true;
  runId: string;
  processed: number;
  remainingEligible: number;
};

export async function updateDbLabelsAfterBatch(
  messageIds: string[],
  addLabel: string
): Promise<void> {
  if (messageIds.length === 0) return;
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "EmailEvent"
      SET
        "labels" = (
          SELECT ARRAY(
            SELECT DISTINCT x
            FROM UNNEST(ARRAY_REMOVE("labels", 'INBOX') || ARRAY[${addLabel}]) AS x
          )
        ),
        "unread" = false
      WHERE "messageId" = ANY(${messageIds})
    `
  );
}

export async function runAutoArchiveBatch(
  userId: string,
  opts?: { now?: Date; maxPerCall?: number }
): Promise<RunAutoArchiveBatchResult> {
  const now = opts?.now ?? new Date();
  const maxPerCall = opts?.maxPerCall ?? DEFAULT_MAX_PER_CALL;
  const runId = randomUUID();

  const pref = await prisma.userDeclutterPref.findUnique({
    where: { userId },
    select: { autoArchiveEnabled: true },
  });
  if (!pref?.autoArchiveEnabled) {
    return { ok: true, runId, processed: 0, remainingEligible: 0 };
  }

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return { ok: true, runId, processed: 0, remainingEligible: 0 };
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);

  // Avoid re-archiving messages this tool already archived.
  const alreadyArchived = new Set(
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

  const eligible: Array<{
    e: ScanRow;
    decision: ReturnType<typeof decideEmail>;
  }> = [];
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
  const cutoff =
    minEligibleDays != null
      ? new Date(now.getTime() - minEligibleDays * 24 * 60 * 60 * 1000)
      : null;

  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN && eligible.length < maxPerCall) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        messageId: { notIn: Array.from(alreadyArchived) },
        ...(cutoff ? { date: { lte: cutoff } } : {}),
      },
      select: {
        id: true,
        googleAccountId: true,
        threadId: true,
        messageId: true,
        date: true,
        senderDomain: true,
        from_: true,
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

    const threadIds = Array.from(new Set(page.map((c) => c.threadId)));
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
      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
      if (!decision.archiveAt) continue;
      if (new Date(decision.archiveAt).getTime() > now.getTime()) continue;
      eligible.push({ e, decision });
      if (eligible.length >= maxPerCall || scanned >= MAX_SCAN) break;
    }
  }

  let processed = 0;
  const byAccountArchive = new Map<string, string[]>();
  const byAccountSpam = new Map<string, string[]>();
  for (const { e, decision } of eligible) {
    if (decision.action === "SPAM") {
      if (!byAccountSpam.has(e.googleAccountId)) byAccountSpam.set(e.googleAccountId, []);
      byAccountSpam.get(e.googleAccountId)!.push(e.messageId);
    } else {
      if (!byAccountArchive.has(e.googleAccountId)) byAccountArchive.set(e.googleAccountId, []);
      byAccountArchive.get(e.googleAccountId)!.push(e.messageId);
    }
  }

  const reason = "auto-archive-batch";
  for (const [googleAccountId, ids] of byAccountArchive.entries()) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const r = await batchArchiveMessages(userId, googleAccountId, chunk, reason, runId);
      processed += r.archived;
      await updateDbLabelsAfterBatch(chunk, CHIEFOS_ARCHIVED_LABEL);
    }
  }
  for (const [googleAccountId, ids] of byAccountSpam.entries()) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const r = await batchSpamMessages(userId, googleAccountId, chunk, reason, runId);
      processed += r.spammed;
      await updateDbLabelsAfterBatch(chunk, "SPAM");
    }
  }

  // Re-count eligible after this batch so the UI (and cron) can say what's left.
  const recountNow = new Date();
  const recountCutoff =
    minEligibleDays != null
      ? new Date(recountNow.getTime() - minEligibleDays * 24 * 60 * 60 * 1000)
      : null;

  let remainingEligible = 0;
  scanned = 0;
  cursorId = null;
  while (scanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        messageId: { notIn: Array.from(alreadyArchived) },
        ...(recountCutoff ? { date: { lte: recountCutoff } } : {}),
      },
      select: {
        id: true,
        googleAccountId: true,
        threadId: true,
        messageId: true,
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

    const pageThreadIds = Array.from(new Set(page.map((p) => p.threadId)));
    const pageThreadMaxRows = await prisma.emailEvent.groupBy({
      by: ["googleAccountId", "threadId"],
      where: {
        googleAccountId: { in: accountIds },
        threadId: { in: pageThreadIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
      },
      _max: { date: true },
    });
    const pageThreadMaxByKey = new Map<string, Date>();
    for (const r of pageThreadMaxRows) {
      if (r._max.date) pageThreadMaxByKey.set(`${r.googleAccountId}:${r.threadId}`, r._max.date);
    }

    for (const e of page) {
      scanned++;
      const effectiveDate =
        pageThreadMaxByKey.get(`${e.googleAccountId}:${e.threadId}`) ?? e.date;
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
      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
      if (!decision.archiveAt) continue;
      if (new Date(decision.archiveAt).getTime() > recountNow.getTime()) continue;
      remainingEligible++;
      if (scanned >= MAX_SCAN) break;
    }
  }

  return { ok: true, runId, processed, remainingEligible };
}

