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

  const syncState = (account.syncStateJson as { lastSyncAt?: string } | null) ?? {};
  const lastSyncAt = syncState.lastSyncAt ? new Date(syncState.lastSyncAt) : null;
  const afterDateStr = lastSyncAt
    ? `${lastSyncAt.getFullYear()}/${String(lastSyncAt.getMonth() + 1).padStart(2, "0")}/${String(lastSyncAt.getDate()).padStart(2, "0")}`
    : afterDate(DAYS_TO_SYNC);
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

  await prisma.googleAccount.update({
    where: { id: accountId },
    data: {
      syncStateJson: {
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: result,
      } as object,
      updatedAt: new Date(),
    },
  });

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
