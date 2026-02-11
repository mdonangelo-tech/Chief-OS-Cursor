/**
 * Default goals, categories, and declutter prefs for new users.
 */

import { prisma } from "@/lib/prisma";

export const DEFAULT_CATEGORIES = [
  "Work",
  "Personal",
  "Newsletters",
  "Promotions",
  "Low-priority",
  "Other",
];

export const DEFAULT_GOALS = [
  { title: "Tool progress", description: "Ship features and fix bugs" },
  { title: "Job search", description: "Apply, network, prep interviews" },
  { title: "Kids time", description: "Quality time with family" },
  { title: "Date night", description: "Plan and follow through" },
  { title: "Exercise", description: "Workouts and movement" },
  { title: "Clear inbox", description: "Process and triage emails daily" },
];

export async function seedUserSetup(userId: string): Promise<void> {
  const [catCount, goalCount, prefExists] = await Promise.all([
    prisma.category.count({ where: { userId } }),
    prisma.goal.count({ where: { userId } }),
    prisma.userDeclutterPref.findUnique({ where: { userId } }).then(Boolean),
  ]);

  const PROTECTED_NAMES = ["Work", "Job Search", "Portfolio", "Kids logistics"];
  if (catCount === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({
        userId,
        name,
        protectedFromAutoArchive: PROTECTED_NAMES.some(
          (p) => p.toLowerCase() === name.toLowerCase()
        ),
      })),
    });
  }
  if (goalCount === 0) {
    await prisma.goal.createMany({
      data: DEFAULT_GOALS.map((g) => ({ userId, ...g })),
    });
  }
  await prisma.category.updateMany({
    where: {
      userId,
      name: { in: ["Work", "Job Search", "Portfolio", "Kids logistics"] },
    },
    data: { protectedFromAutoArchive: true },
  });
  if (!prefExists) {
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    await prisma.userDeclutterPref.create({
      data: { userId, autoArchiveEnabled: false },
    });
    // Per-category rules: Newsletters/Promotions = label_only, others = label_only (conservative)
    const declutterAction = (name: string) =>
      name === "Newsletters" || name === "Promotions" ? "label_only" : "label_only";
    await prisma.categoryDeclutterRule.createMany({
      data: categories.map((c) => ({
        userId,
        categoryId: c.id,
        action: declutterAction(c.name),
      })),
      skipDuplicates: true,
    });
  }
}

/** Ensures each category has a CategoryDeclutterRule (label_only default). */
export async function ensureDeclutterRulesForCategories(userId: string): Promise<void> {
  const pref = await prisma.userDeclutterPref.findUnique({ where: { userId } });
  if (!pref) return;
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true },
  });
  const existing = await prisma.categoryDeclutterRule.findMany({
    where: { userId },
    select: { categoryId: true },
  });
  const existingIds = new Set(existing.map((r) => r.categoryId));
  const missing = categories.filter((c) => !existingIds.has(c.id));
  if (missing.length > 0) {
    await prisma.categoryDeclutterRule.createMany({
      data: missing.map((c) => ({ userId, categoryId: c.id, action: "label_only" })),
    });
  }
}

/** True if user has completed setup (has goals or categories and declutter prefs). */
export async function hasCompletedSetup(userId: string): Promise<boolean> {
  const [goalCount, catCount, pref] = await Promise.all([
    prisma.goal.count({ where: { userId } }),
    prisma.category.count({ where: { userId } }),
    prisma.userDeclutterPref.findUnique({ where: { userId } }),
  ]);
  return (goalCount > 0 || catCount > 0) && !!pref;
}
