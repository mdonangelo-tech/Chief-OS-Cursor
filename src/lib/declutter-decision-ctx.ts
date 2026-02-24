import { prisma } from "@/lib/prisma";

export async function buildDeclutterDecisionCtx(userId: string, now: Date) {
  const [personRules, orgRules, categories, policies] = await Promise.all([
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
  ]);

  const categoriesById = Object.fromEntries(
    categories.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        protectedFromAutoArchive: c.protectedFromAutoArchive,
      },
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

  return {
    personRules,
    orgRules,
    categoriesById,
    categoryPoliciesById,
    now,
    llmEnabled: false,
  } as const;
}

