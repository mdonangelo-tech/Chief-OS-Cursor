/**
 * Archive by days: archive ALL inbox messages older than X days (from Gmail API).
 * Not limited to ChiefOS-processed emails. Adds ChiefOS/Archived, removes INBOX.
 * Full audit + undo. Capped per run to avoid rate limits.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { batchArchiveMessages } from "@/services/gmail/actions";
import { listMessageIds } from "@/services/gmail/client";

const MAX_PER_RUN = 10_000;

export interface ArchiveByDaysItem {
  from: string;
  subject: string | null;
  snippet: string | null;
  categoryName: string;
  labels: string[];
  date: string;
}

export interface ArchiveByDaysResult {
  eligible: number;
  archived: number;
  skipped: number;
  errors: string[];
  items: ArchiveByDaysItem[];
  runId: string | null;
}

/** Archive all inbox messages older than X days. Uses Gmail API directly—includes messages not yet synced. */
export async function runArchiveByDays(
  userId: string,
  days: number,
  dryRun = false
): Promise<ArchiveByDaysResult> {
  if (days < 1 || days > 365) {
    return { eligible: 0, archived: 0, skipped: 0, errors: ["Days must be 1–365"], items: [], runId: null };
  }

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true },
  });
  if (accounts.length === 0) {
    return { eligible: 0, archived: 0, skipped: 0, errors: ["No connected accounts"], items: [], runId: null };
  }

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

  const toArchive: { messageId: string; googleAccountId: string; email: string }[] = [];
  let remaining = MAX_PER_RUN;

  for (const acc of accounts) {
    if (remaining <= 0) break;
    try {
      const query = `in:inbox older_than:${days}d`;
      for await (const ids of listMessageIds(acc.id, userId, query, 100)) {
        for (const messageId of ids) {
          if (remaining <= 0) break;
          if (alreadyArchived.has(messageId)) continue;
          toArchive.push({ messageId, googleAccountId: acc.id, email: acc.email });
          remaining--;
        }
        if (remaining <= 0) break;
      }
    } catch (err) {
      return {
        eligible: 0,
        archived: 0,
        skipped: 0,
        errors: [`${acc.email}: ${(err as Error).message}`],
        items: [],
        runId: null,
      };
    }
  }

  const items: ArchiveByDaysItem[] = toArchive.map((e) => ({
    from: "",
    subject: null,
    snippet: null,
    categoryName: "—",
    labels: [],
    date: "",
  }));

  if (dryRun) {
    return {
      eligible: toArchive.length,
      archived: 0,
      skipped: 0,
      errors: [],
      items,
      runId: null,
    };
  }

  const runId = randomUUID();
  let archived = 0;
  const errors: string[] = [];

  const byAccount = new Map<string, string[]>();
  for (const { messageId, googleAccountId } of toArchive) {
    if (!byAccount.has(googleAccountId)) byAccount.set(googleAccountId, []);
    byAccount.get(googleAccountId)!.push(messageId);
  }

  for (const [googleAccountId, ids] of byAccount) {
    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000);
      try {
        const result = await batchArchiveMessages(
          userId,
          googleAccountId,
          batch,
          `archive-by-days-${days}d`,
          runId
        );
        archived += result.archived;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(`Batch: ${(err as Error).message}`);
      }
    }
  }

  return {
    eligible: toArchive.length,
    archived,
    skipped: toArchive.length - archived - errors.length,
    errors,
    items,
    runId,
  };
}
