/**
 * Auto-archive: archive emails 48h+ old in categories with archive_after_48h rule.
 * Excludes protected categories (Work, Job Search, Portfolio, Kids logistics).
 * Only runs when UserDeclutterPref.autoArchiveEnabled is true.
 * All actions are audited with runId; rollback via Audit page (single or entire run).
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { archiveMessage, moveToSpamMessage } from "@/services/gmail/actions";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";

const HOURS_48_MS = 48 * 60 * 60 * 1000;

export interface AutoArchiveItem {
  from: string;
  subject: string | null;
  snippet: string | null;
  categoryName: string;
  labels: string[];
}

export interface AutoArchiveResult {
  eligible: number;
  archived: number;
  skipped: number;
  errors: string[];
  items: AutoArchiveItem[];
}

/** Find emails eligible for auto-archive; optionally execute. */
export async function runAutoArchive(
  userId: string,
  dryRun = false
): Promise<AutoArchiveResult> {
  // #region agent log
  // #endregion

  const pref = await prisma.userDeclutterPref.findUnique({
    where: { userId },
  });
  if (!dryRun && !pref?.autoArchiveEnabled) {
    return { eligible: 0, archived: 0, skipped: 0, errors: ["Auto-archive is disabled. Enable it above to run."], items: [] };
  }

  const [archiveRules, protectedCategories] = await Promise.all([
    prisma.categoryDeclutterRule.findMany({
      where: {
        userId,
        OR: [
          { action: "archive_after_48h" },
          { action: "archive_after_days", archiveAfterDays: { not: null } },
          { action: "move_to_spam" },
        ],
      },
      select: { categoryId: true, action: true, archiveAfterDays: true },
    }),
    prisma.category.findMany({
      where: { userId, protectedFromAutoArchive: true },
      select: { id: true },
    }),
  ]);
  const archiveCategoryIds = new Set(archiveRules.map((r) => r.categoryId));
  const protectedIds = new Set(protectedCategories.map((c) => c.id));
  const eligibleCategoryIds = archiveCategoryIds.size > 0
    ? [...archiveCategoryIds].filter((id) => !protectedIds.has(id))
    : [];

  // #region agent log
  // #endregion

  if (eligibleCategoryIds.length === 0) {
    return { eligible: 0, archived: 0, skipped: 0, errors: [], items: [] };
  }

  const categoryCutoffsMs = new Map<string, number>();
  const categoryActions = new Map<string, string>();
  for (const r of archiveRules) {
    if (!eligibleCategoryIds.includes(r.categoryId)) continue;
    categoryActions.set(r.categoryId, r.action);
    const days =
      r.action === "archive_after_days" && r.archiveAfterDays != null
        ? r.archiveAfterDays
        : 2;
    categoryCutoffsMs.set(r.categoryId, days * 24 * 60 * 60 * 1000);
  }
  const accountIds = (
    await prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true },
    })
  ).map((a) => a.id);

  const alreadyArchived = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          userId,
          actionType: "ARCHIVE",
          messageId: { not: null },
        },
        select: { messageId: true },
      })
    )
      .map((a) => a.messageId)
      .filter(Boolean) as string[]
  );

  const allCandidates = await prisma.emailEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      classificationCategoryId: { in: eligibleCategoryIds },
      labels: { has: "INBOX" },
      messageId: { notIn: Array.from(alreadyArchived) },
    },
    include: { googleAccount: true, category: true },
    orderBy: { date: "asc" },
    take: 150,
  });

  const now = Date.now();
  const eligible = allCandidates.filter((e) => {
    const catId = e.classificationCategoryId;
    if (!catId) return false;
    const cutoffMs = categoryCutoffsMs.get(catId);
    if (!cutoffMs) return false;
    return now - e.date.getTime() > cutoffMs;
  }).slice(0, 50);

  const items: AutoArchiveItem[] = eligible.map((e) => ({
    from: e.from_,
    subject: e.subject,
    snippet: e.snippet,
    categoryName: e.category?.name ?? "—",
    labels: e.labels ?? [],
  }));

  if (dryRun) {
    return {
      eligible: eligible.length,
      archived: 0,
      skipped: 0,
      errors: [],
      items,
    };
  }

  const result: AutoArchiveResult = {
    eligible: eligible.length,
    archived: 0,
    skipped: 0,
    errors: [],
    items,
  };

  const runId = randomUUID();
  let loggedTokenRefreshError = false;
  for (const e of eligible) {
    try {
      const action = categoryActions.get(e.classificationCategoryId!) ?? "archive_after_48h";
      if (action === "move_to_spam") {
        const { afterLabels } = await moveToSpamMessage(
          userId,
          e.googleAccountId,
          e.messageId,
          "auto-move-to-spam",
          0.9,
          runId
        );
        await prisma.emailEvent.update({
          where: { id: e.id },
          data: {
            labels: Array.from(new Set(afterLabels.filter((l) => l !== "INBOX").concat(["SPAM"]))),
            unread: false,
          },
        });
      } else {
        const { afterLabels } = await archiveMessage(
          userId,
          e.googleAccountId,
          e.messageId,
          "auto-archive-48h",
          0.9,
          runId
        );
        await prisma.emailEvent.update({
          where: { id: e.id },
          data: {
            labels: Array.from(new Set(afterLabels.filter((l) => l !== "INBOX").concat([CHIEFOS_ARCHIVED_LABEL]))),
            unread: false,
          },
        });
      }
      result.archived++;
    } catch (err) {
      result.errors.push(`${e.messageId}: ${(err as Error).message}`);
      const msg = (err as Error)?.message ?? String(err);
      if (!loggedTokenRefreshError && msg.toLowerCase().includes("token refresh failed")) {
        loggedTokenRefreshError = true;
        // #region agent log
        // #endregion
      }
    }
  }

  return result;
}
