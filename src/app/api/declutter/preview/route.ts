import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const [personRules, orgRules, categories, policies, emails] = await Promise.all([
    prisma.personRule.findMany({
      where: { userId },
      select: { email: true, categoryId: true },
    }),
    prisma.orgRule.findMany({
      where: { userId },
      select: { domain: true, categoryId: true },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, protectedFromAutoArchive: true },
    }),
    prisma.categoryDeclutterRule.findMany({
      where: { userId },
      select: { categoryId: true, action: true, archiveAfterDays: true },
    }),
    prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
      },
      select: {
        id: true,
        googleAccountId: true,
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
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const categoriesById = Object.fromEntries(
    categories.map((c) => [
      c.id,
      { id: c.id, name: c.name, protectedFromAutoArchive: c.protectedFromAutoArchive },
    ])
  );

  const categoryPoliciesById: Record<
    string,
    { action: string; archiveAfterDays?: number | null } | undefined
  > = {};
  for (const p of policies) {
    categoryPoliciesById[p.categoryId] = {
      action: p.action,
      archiveAfterDays: p.archiveAfterDays,
    };
  }

  const ctx = {
    personRules,
    orgRules,
    categoriesById,
    categoryPoliciesById,
    now,
    llmEnabled: false,
  } as const;

  const items = emails.map((e) => ({
    email: {
      id: e.id,
      from_: e.from_,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date,
      labels: e.labels ?? [],
      googleAccountId: e.googleAccountId,
    },
    decision: decideEmail(
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
    ),
  }));

  return NextResponse.json({ ok: true, items });
}

