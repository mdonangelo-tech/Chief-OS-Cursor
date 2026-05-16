import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { batchArchiveMessages, batchSpamMessages } from "@/services/gmail/actions";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import { Prisma } from "@prisma/client";
import type {
  AutoArchiveBatchStatus,
  AutoArchiveBatchSkipReasons,
  AutoArchiveBatchPerAccount,
} from "@/types/declutter";

const DEFAULT_MAX_PER_CALL = 1000;
const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;
// Only look back this far when deduplicating against the audit log.
// Messages already archived also carry CHIEFOS_ARCHIVED_LABEL, so the
// label filter is the primary guard; the audit log check is secondary.
const AUDIT_LOG_LOOKBACK_DAYS = 90;

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

function log(event: string, fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ service: "auto-archive-batch", event, ...fields }));
}

export type RunAutoArchiveBatchResult = {
  ok: true;
  runId: string;
  status: AutoArchiveBatchStatus;
  processed: number;
  remainingEligible: number;
  scanned: number;
  skipReasons: AutoArchiveBatchSkipReasons;
  perAccount: AutoArchiveBatchPerAccount[];
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

  log("start", { userId, runId, maxPerCall });

  const pref = await prisma.userDeclutterPref.findUnique({
    where: { userId },
    select: { autoArchiveEnabled: true },
  });
  if (!pref?.autoArchiveEnabled) {
    log("disabled", { userId, runId, prefExists: pref != null });
    return {
      ok: true,
      runId,
      status: "disabled",
      processed: 0,
      remainingEligible: 0,
      scanned: 0,
      skipReasons: { notYetDue: 0, decisionNone: 0 },
      perAccount: [],
    };
  }

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    log("no_accounts", { userId, runId });
    return {
      ok: true,
      runId,
      status: "no_accounts",
      processed: 0,
      remainingEligible: 0,
      scanned: 0,
      skipReasons: { notYetDue: 0, decisionNone: 0 },
      perAccount: [],
    };
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);

  // Summarize which categories have archive policies for the log.
  const policyEntries = Object.entries(ctx.categoryPoliciesById)
    .filter(([, p]) => p != null)
    .map(([catId, p]) => ({ catId, action: p!.action, archiveAfterDays: p!.archiveAfterDays }));
  const archivePolicies = policyEntries.filter((e) => {
    const a = normalizePolicyAction(e.action);
    return a === "archive_after_48h" || a === "archive_after_days" || a === "archive_after_n_days";
  });
  const spamPolicies = policyEntries.filter(
    (e) => normalizePolicyAction(e.action) === "move_to_spam"
  );

  log("policies", {
    userId,
    runId,
    totalPolicies: policyEntries.length,
    archivePolicies: archivePolicies.length,
    spamPolicies: spamPolicies.length,
    archivePolicyDetails: archivePolicies,
  });

  // Compute the minimum eligible age across all archive policies.
  // Used as a DB-level pre-filter so we don't scan emails that can't possibly be eligible.
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

  // No archive policies → nothing to do. Note: move_to_spam is tracked above but
  // is currently not processed by this batch (archiveAt is null for spam decisions).
  // That is documented as a known gap in the handoff.
  if (minEligibleDays === null) {
    log("no_archive_policies", {
      userId,
      runId,
      spamPoliciesExist: spamPolicies.length > 0,
    });
    return {
      ok: true,
      runId,
      status: "no_archive_policies",
      processed: 0,
      remainingEligible: 0,
      scanned: 0,
      skipReasons: { notYetDue: 0, decisionNone: 0 },
      perAccount: [],
    };
  }

  const cutoff = new Date(now.getTime() - minEligibleDays * 24 * 60 * 60 * 1000);
  log("scan_start", {
    userId,
    runId,
    minEligibleDays,
    cutoff: cutoff.toISOString(),
    accountCount: accountIds.length,
    maxPerCall,
  });

  // Cap the AuditLog dedup lookup to recent history. Messages already archived
  // also carry CHIEFOS_ARCHIVED_LABEL which is the primary dedup filter; this
  // is a secondary guard for cases where the label update lagged.
  const auditLookbackFrom = new Date(now.getTime() - AUDIT_LOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const alreadyArchived = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          userId,
          actionType: { in: ["ARCHIVE", "SPAM"] },
          messageId: { not: null },
          timestamp: { gte: auditLookbackFrom },
        },
        select: { messageId: true },
      })
    )
      .map((a) => a.messageId)
      .filter(Boolean) as string[]
  );

  log("audit_dedup", { userId, runId, alreadyArchivedCount: alreadyArchived.size });

  const eligible: Array<{
    e: ScanRow;
    decision: ReturnType<typeof decideEmail>;
  }> = [];
  const skipReasons: AutoArchiveBatchSkipReasons = { notYetDue: 0, decisionNone: 0 };
  let scanned = 0;
  let cursorId: string | null = null;

  while (scanned < MAX_SCAN && eligible.length < maxPerCall) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        messageId: { notIn: Array.from(alreadyArchived) },
        date: { lte: cutoff },
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
      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") {
        skipReasons.decisionNone++;
        continue;
      }
      if (!decision.archiveAt) {
        // move_to_spam has no archiveAt; treated as not-yet-actionable by this batch.
        skipReasons.decisionNone++;
        continue;
      }
      if (new Date(decision.archiveAt).getTime() > now.getTime()) {
        skipReasons.notYetDue++;
        continue;
      }
      eligible.push({ e, decision });
      if (eligible.length >= maxPerCall || scanned >= MAX_SCAN) break;
    }
  }

  log("scan_complete", {
    userId,
    runId,
    scanned,
    eligible: eligible.length,
    skipNotYetDue: skipReasons.notYetDue,
    skipDecisionNone: skipReasons.decisionNone,
  });

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

  const perAccountMap = new Map<string, AutoArchiveBatchPerAccount>();
  const ensureAccount = (id: string) => {
    if (!perAccountMap.has(id)) {
      perAccountMap.set(id, { googleAccountId: id, archived: 0, spammed: 0, errors: 0 });
    }
    return perAccountMap.get(id)!;
  };

  const reason = "auto-archive-batch";
  for (const [googleAccountId, ids] of byAccountArchive.entries()) {
    const acct = ensureAccount(googleAccountId);
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const r = await batchArchiveMessages(userId, googleAccountId, chunk, reason, runId);
      processed += r.archived;
      acct.archived += r.archived;
      acct.errors += r.errors.length;
      if (r.errors.length > 0) {
        log("archive_errors", { userId, runId, googleAccountId, errors: r.errors });
      }
      await updateDbLabelsAfterBatch(chunk, CHIEFOS_ARCHIVED_LABEL);
    }
  }
  for (const [googleAccountId, ids] of byAccountSpam.entries()) {
    const acct = ensureAccount(googleAccountId);
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const r = await batchSpamMessages(userId, googleAccountId, chunk, reason, runId);
      processed += r.spammed;
      acct.spammed += r.spammed;
      acct.errors += r.errors.length;
      if (r.errors.length > 0) {
        log("spam_errors", { userId, runId, googleAccountId, errors: r.errors });
      }
      await updateDbLabelsAfterBatch(chunk, "SPAM");
    }
  }

  const perAccount = Array.from(perAccountMap.values());

  log("archive_complete", {
    userId,
    runId,
    processed,
    perAccount,
  });

  // Re-count eligible after this batch so the UI (and cron) can report what's left.
  const recountNow = new Date();
  const recountCutoff = new Date(recountNow.getTime() - minEligibleDays * 24 * 60 * 60 * 1000);

  let remainingEligible = 0;
  let recountScanned = 0;
  let recountCursorId: string | null = null;
  while (recountScanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        messageId: { notIn: Array.from(alreadyArchived) },
        date: { lte: recountCutoff },
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
      ...(recountCursorId ? { cursor: { id: recountCursorId }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    recountCursorId = page[page.length - 1].id;

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
      recountScanned++;
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
      if (recountScanned >= MAX_SCAN) break;
    }
  }

  log("result", {
    userId,
    runId,
    status: "ran",
    processed,
    remainingEligible,
    scanned,
  });

  return {
    ok: true,
    runId,
    status: "ran",
    processed,
    remainingEligible,
    scanned,
    skipReasons,
    perAccount,
  };
}
