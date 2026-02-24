/**
 * Gmail sync: fetch Inbox metadata + snippet, store in EmailEvent.
 * Incremental: after first sync, only fetches emails received since lastSyncAt.
 * First sync: last 90 days. Runs classification on synced emails.
 */

import { prisma } from "@/lib/prisma";
import { classifyAllUnclassifiedEmails } from "@/services/classification/engine";
import {
  fetchMessageMetadata,
  listMessageIds,
} from "@/services/gmail/client";

const DAYS_TO_SYNC = 90;
const BATCH_SIZE = 50;
/** Process this many messages in parallel to stay under Gmail rate limits */
const PARALLEL_SIZE = 5;
/** Delay between parallel batches (ms) - keeps sync under ~1-2 min */
const BATCH_DELAY_MS = 50;
/** Cap messages per sync run - click again to sync more */
const MAX_MESSAGES_PER_RUN = 120;

function afterDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function toAfterQueryDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export interface SyncResult {
  accountId: string;
  email: string;
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

export async function syncGmailForAccount(
  accountId: string,
  userId: string
): Promise<SyncResult> {
  const account = await prisma.googleAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new Error("Google account not found");
  }

  const result: SyncResult = {
    accountId,
    email: account.email,
    fetched: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  const syncState = (account.syncStateJson as Record<string, unknown> | null) ?? {};
  const now = new Date();
  const rollingWindowStart = new Date(now);
  rollingWindowStart.setDate(rollingWindowStart.getDate() - 14);
  rollingWindowStart.setHours(0, 0, 0, 0);

  try {
    const lastCursorAt = syncState.lastGmailCursorAt
      ? new Date(syncState.lastGmailCursorAt as string)
      : null;

    // Always re-sync a rolling window to reflect label/unread changes in Gmail.
    // Otherwise Brief/Open Loops can look "stuck" even though the user processed mail in Gmail.
    const maxBackfillStart = new Date(now);
    maxBackfillStart.setDate(maxBackfillStart.getDate() - DAYS_TO_SYNC);
    maxBackfillStart.setHours(0, 0, 0, 0);

    // If we have a cursor older than the rolling window, use it to catch up.
    // If the cursor is newer, use the rolling window start so we still refresh recent state.
    let startDate: Date;
    if (!lastCursorAt) {
      startDate = maxBackfillStart;
    } else if (lastCursorAt < rollingWindowStart) {
      startDate = lastCursorAt;
    } else {
      startDate = rollingWindowStart;
    }
    if (startDate < maxBackfillStart) startDate = maxBackfillStart;

    const afterDateStr = toAfterQueryDate(startDate);
    const query = `in:inbox after:${afterDateStr}`;
    let totalProcessed = 0;

    async function processMessage(messageId: string): Promise<boolean> {
      try {
        const meta = await fetchMessageMetadata(accountId, userId, messageId);
        if (!meta) return false;
        result.fetched++;
        const existing = await prisma.emailEvent.findUnique({
          where: { messageId },
        });
        const data = {
          googleAccountId: accountId,
          messageId: meta.id,
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
        };
        if (existing) {
          await prisma.emailEvent.update({ where: { messageId }, data });
          result.updated++;
        } else {
          await prisma.emailEvent.create({ data });
          result.created++;
        }
        return true;
      } catch (err) {
        result.errors.push(`${messageId}: ${(err as Error).message}`);
        return false;
      }
    }

    for await (const ids of listMessageIds(accountId, userId, query, BATCH_SIZE)) {
      const toProcess = ids.slice(0, MAX_MESSAGES_PER_RUN - totalProcessed);
      if (toProcess.length === 0) break;

      const batches: string[][] = [];
      for (let i = 0; i < toProcess.length; i += PARALLEL_SIZE) {
        batches.push(toProcess.slice(i, i + PARALLEL_SIZE));
      }

      for (const batch of batches) {
        await Promise.all(batch.map(processMessage));
        totalProcessed += batch.length;
        if (batch.length > 0) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
      if (totalProcessed >= MAX_MESSAGES_PER_RUN) break;
    }

    // Reconcile recent INBOX-labeled messages we already have in DB.
    // This fixes stale labels when a user archived/moved messages out of INBOX.
    const recentInbox = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: accountId,
        date: { gte: rollingWindowStart },
        labels: { has: "INBOX" },
      },
      select: { messageId: true },
      orderBy: { date: "desc" },
      take: 200,
    });
    for (const r of recentInbox) {
      try {
        await processMessage(r.messageId);
      } catch {
        // ignore per-message reconciliation errors
      }
    }
  } catch (err) {
    result.errors.push((err as Error).message);
  } finally {
    // Always update lastSyncAt so the UI reflects that a sync attempt finished.
    // Store errors in lastSyncResult so the user can inspect failures per account.
    const authError =
      result.errors.some((e) => e.toLowerCase().includes("authorization expired")) ||
      result.errors.some((e) => e.toLowerCase().includes("invalid_grant")) ||
      result.errors.some((e) => e.toLowerCase().includes("reconnect google account"))
        ? { code: "RECONNECT_REQUIRED", message: "Reconnect Google account to continue syncing." }
        : null;
    await prisma.googleAccount.update({
      where: { id: accountId },
      data: {
        syncStateJson: {
          ...syncState,
          lastSyncAt: new Date().toISOString(),
          lastSyncResult: result,
          authError,
          lastGmailAttemptAt: new Date().toISOString(),
          ...(authError || result.errors.length > 0
            ? {}
            : { lastGmailCursorAt: new Date().toISOString() }),
        } as object,
        updatedAt: new Date(),
      },
    });
  }

  return result;
}

export async function syncGmailForUser(userId: string): Promise<SyncResult[]> {
  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
  });

  const results: SyncResult[] = [];
  for (const acc of accounts) {
    try {
      const r = await syncGmailForAccount(acc.id, userId);
      results.push(r);
    } catch (err) {
      results.push({
        accountId: acc.id,
        email: acc.email,
        fetched: 0,
        created: 0,
        updated: 0,
        errors: [(err as Error).message],
      });
    }
  }

  await classifyAllUnclassifiedEmails(userId);

  return results;
}
