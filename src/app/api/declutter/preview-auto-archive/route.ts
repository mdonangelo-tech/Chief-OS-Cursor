import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { PreviewAutoArchiveResponse } from "@/types/declutter";

const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;

type ScanRow = {
  id: string;
  googleAccountId: string;
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

  // Performance: only scan messages old enough to possibly be eligible.
  // (Eligibility is determined by decision.archiveAt <= now.)
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

  const cutoff = minEligibleDays != null
    ? new Date(now.getTime() - minEligibleDays * 24 * 60 * 60 * 1000)
    : null;

  let protectedBlockedCount = 0;
  const eligibleByCategory = new Map<string | null, number>();
  let oldestDate: string | null = null;
  let newestDate: string | null = null;

  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        ...(cutoff ? { date: { lte: cutoff } } : {}),
      },
      select: {
        id: true,
        googleAccountId: true,
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

    for (const e of page) {
      scanned++;
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
      // Count cases where protection prevented an archive/spam action.
      if (
        wasBlockedByProtection &&
        decision.action !== "ARCHIVE_AT" &&
        decision.action !== "SPAM"
      ) {
        protectedBlockedCount++;
      }

      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
      if (!decision.archiveAt) continue;
      if (new Date(decision.archiveAt).getTime() > now.getTime()) continue;

      const k = decision.finalCategoryId;
      eligibleByCategory.set(k, (eligibleByCategory.get(k) ?? 0) + 1);

      const iso = e.date.toISOString();
      if (!oldestDate) oldestDate = iso;
      newestDate = iso;
      if (scanned >= MAX_SCAN) break;
    }
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

