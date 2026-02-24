import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { PreviewAgeArchiveResponse } from "@/types/declutter";

function clampDays(raw: string | null): number {
  const n = parseInt(raw ?? "30", 10);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
}

export async function GET(req: NextRequest) {
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
    select: { id: true },
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
      date: { lte: cutoff },
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
    take: 2000,
  });

  let excludedProtectedCount = 0;
  const byCategoryCounts = new Map<string | null, number>();
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

    const catId = decision.finalCategoryId;
    const cat = catId ? categoriesById[catId] : null;
    if (cat?.protectedFromAutoArchive) {
      excludedProtectedCount++;
      continue;
    }

    byCategoryCounts.set(catId, (byCategoryCounts.get(catId) ?? 0) + 1);

    const iso = e.date.toISOString();
    if (!oldestDate) oldestDate = iso;
    newestDate = iso;
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
    oldestDate,
    newestDate,
    excludedProtectedCount,
  };
  return NextResponse.json(res);
}

