import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { PreviewAutoArchiveResponse } from "@/types/declutter";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
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
    };
    return NextResponse.json(empty);
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);
  const categoriesById = ctx.categoriesById;

  const emails = await prisma.emailEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      labels: { has: "INBOX" },
      NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
    },
    select: {
      id: true,
      googleAccountId: true,
      messageId: true,
      from_: true,
      subject: true,
      snippet: true,
      date: true,
      labels: true,
      senderDomain: true,
      classificationCategoryId: true,
      confidence: true,
      explainJson: true,
    },
    orderBy: { date: "asc" },
    take: 1000,
  });

  let protectedBlockedCount = 0;
  const eligibleByCategory = new Map<string | null, number>();
  let oldestDate: string | null = null;
  let newestDate: string | null = null;

  for (const e of emails) {
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

    const wasBlockedByProtection = decision.reason.overrides.some(
      (o) => o.overriddenSource === "protectedCategory"
    );
    // Count cases where protection prevented an archive action.
    if (wasBlockedByProtection && decision.action !== "ARCHIVE_AT") protectedBlockedCount++;

    if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
    if (!decision.archiveAt) continue;
    if (new Date(decision.archiveAt).getTime() > now.getTime()) continue;

    const k = decision.finalCategoryId;
    eligibleByCategory.set(k, (eligibleByCategory.get(k) ?? 0) + 1);

    const iso = e.date.toISOString();
    if (!oldestDate) oldestDate = iso;
    newestDate = iso;
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
  };
  return NextResponse.json(res);
}

