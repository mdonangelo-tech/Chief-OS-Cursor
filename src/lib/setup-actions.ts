"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_GOALS, DEFAULT_CATEGORIES, ensureDeclutterRulesForCategories } from "@/lib/setup-defaults";
import { auth } from "@/auth";

export async function addGoal(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  await prisma.goal.create({
    data: { userId: session.user.id, title },
  });
  revalidatePath("/setup");
}

export async function updateGoal(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!id || !title) return;
  const goal = await prisma.goal.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!goal) return;
  await prisma.goal.update({ where: { id }, data: { title } });
  revalidatePath("/setup");
}

export async function deleteGoal(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const goal = await prisma.goal.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!goal) return;
  await prisma.goal.delete({ where: { id } });
  revalidatePath("/setup");
}

export async function addDefaultGoals() {
  const session = await auth();
  if (!session?.user?.id) return;
  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (goals.length > 0) return;
  await prisma.goal.createMany({
    data: DEFAULT_GOALS.map((g) => ({
      userId: session.user!.id!,
      title: g.title,
      description: g.description,
    })),
  });
  revalidatePath("/setup");
}

const PROTECTED_CATEGORY_NAMES = ["Work", "Job Search", "Portfolio", "Kids logistics"];

export async function addCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const protectedFromAutoArchive = PROTECTED_CATEGORY_NAMES.some(
    (p) => p.toLowerCase() === name.toLowerCase()
  );
  await prisma.category.create({
    data: { userId: session.user.id, name, protectedFromAutoArchive },
  });
  await ensureDeclutterRulesForCategories(session.user.id);
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  revalidatePath("/settings/categories");
  const returnTo = (formData.get("returnTo") as string)?.trim() || "/settings/declutter";
  redirect(returnTo);
}

export async function addCategoryFromGmail(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const name = (formData.get("name") as string)?.trim();
  const gmailLabelId = (formData.get("gmailLabelId") as string)?.trim();
  if (!name) return;
  const existing = await prisma.category.findFirst({
    where: { userId: session.user.id, name },
  });
  if (existing) {
    if (gmailLabelId) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { gmailLabelId },
      });
    }
  } else {
    const protectedFromAutoArchive = PROTECTED_CATEGORY_NAMES.some(
      (p) => p.toLowerCase() === name.toLowerCase()
    );
    await prisma.category.create({
      data: {
        userId: session.user.id,
        name,
        gmailLabelId: gmailLabelId || null,
        protectedFromAutoArchive,
      },
    });
    await ensureDeclutterRulesForCategories(session.user.id);
  }
  revalidatePath("/settings/declutter");
  revalidatePath("/settings/categories");
  redirect("/settings/declutter");
}

export async function renameCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  if (!id || !name) return;
  const cat = await prisma.category.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!cat) return;
  await prisma.category.update({ where: { id }, data: { name } });
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  revalidatePath("/settings/categories");
}

export async function setCategoryParent(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  const parentIdRaw = formData.get("parentId");
  const parentId = typeof parentIdRaw === "string" && parentIdRaw.trim() ? parentIdRaw.trim() : null;
  if (!id) return;
  const cat = await prisma.category.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!cat) return;
  if (parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parentId, userId: session.user.id },
    });
    if (!parent) return;
  }
  await prisma.category.update({
    where: { id },
    data: { parentId },
  });
  revalidatePath("/setup");
  revalidatePath("/settings/categories");
}

export async function toggleCategoryProtected(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const cat = await prisma.category.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!cat) return;
  await prisma.category.update({
    where: { id },
    data: { protectedFromAutoArchive: !cat.protectedFromAutoArchive },
  });
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  revalidatePath("/settings/categories");
}

export async function deleteCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const cat = await prisma.category.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!cat) return;
  await prisma.category.delete({ where: { id } });
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  revalidatePath("/settings/categories");
}

export async function upsertCategoryDeclutterRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const categoryId = formData.get("categoryId") as string;
  const action = formData.get("action") as string;
  const archiveAfterDaysRaw = formData.get("archiveAfterDays");
  const archiveAfterDays =
    action === "archive_after_days" && archiveAfterDaysRaw
      ? Math.min(365, Math.max(1, parseInt(String(archiveAfterDaysRaw), 10) || 7))
      : null;
  if (!categoryId || !action) return;
  const valid = ["label_only", "archive_after_48h", "archive_after_days", "move_to_spam", "never"];
  if (!valid.includes(action)) return;
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });
  if (!cat) return;
  await prisma.categoryDeclutterRule.upsert({
    where: {
      userId_categoryId: { userId: session.user.id, categoryId },
    },
    create: { userId: session.user.id, categoryId, action, archiveAfterDays },
    update: { action, archiveAfterDays },
  });
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  const noRedirect = formData.get("noRedirect") === "true";
  if (!noRedirect) {
    const returnTo = (formData.get("returnTo") as string) || "/settings/declutter?saved=rule";
    redirect(returnTo);
  }
}

export async function updateDeclutterAutoArchive(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const enabled = formData.get("enabled") === "true";
  await prisma.userDeclutterPref.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, autoArchiveEnabled: enabled },
    update: { autoArchiveEnabled: enabled },
  });
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
  redirect("/settings/declutter?saved=auto");
}

export async function addDefaultCategories() {
  const session = await auth();
  if (!session?.user?.id) return;
  const count = await prisma.category.count({ where: { userId: session.user.id } });
  if (count > 0) return;
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((name) => ({ userId: session.user!.id!, name })),
  });
  await ensureDeclutterRulesForCategories(session.user.id);
  revalidatePath("/setup");
  revalidatePath("/settings/declutter");
}
