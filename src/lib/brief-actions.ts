"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureDeclutterRulesForCategories } from "@/lib/setup-defaults";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

function extractEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  const trimmed = fromHeader.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return null;
}

function extractDomain(fromHeader: string): string | null {
  const email = extractEmail(fromHeader);
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

export async function updateEmailCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const emailEventId = formData.get("emailEventId") as string;
  const categoryId = formData.get("categoryId") as string;
  if (!emailEventId) return;
  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== session.user.id) return;
  await prisma.emailEvent.update({
    where: { id: emailEventId },
    data: {
      classificationCategoryId: categoryId || null,
      explainJson: {
        source: "manual",
        categoryName: categoryId ? "updated" : "cleared",
      } as object,
    },
  });
  revalidatePath("/brief");
  redirect("/brief");
}

export async function saveAsRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const emailEventId = formData.get("emailEventId") as string;
  const categoryId = formData.get("categoryId") as string;
  const ruleType = formData.get("ruleType") as string; // "sender" | "domain"
  if (!emailEventId || !categoryId || !ruleType) return;
  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== session.user.id) return;
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, userId: session.user.id },
  });
  if (!cat) return;

  const email = extractEmail(event.from_);
  const domain = extractDomain(event.from_) ?? event.senderDomain;

  if (ruleType === "sender" && email) {
    await prisma.personRule.upsert({
      where: {
        userId_email: { userId: session.user.id, email },
      },
      create: { userId: session.user.id, email, categoryId },
      update: { categoryId },
    });
  } else if (ruleType === "domain" && domain) {
    await prisma.orgRule.upsert({
      where: {
        userId_domain: { userId: session.user.id, domain },
      },
      create: { userId: session.user.id, domain, categoryId },
      update: { categoryId },
    });
  }

  await prisma.emailEvent.update({
    where: { id: emailEventId },
    data: {
      classificationCategoryId: categoryId,
      explainJson: {
        source: "rule",
        ruleType: ruleType as "person" | "domain",
        matchedValue: ruleType === "sender" ? email : domain,
        categoryName: cat.name,
      } as object,
    },
  });
  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect("/brief");
}

/** Undo an entire auto-archive run. */
export async function rollbackRunAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const runId = formData.get("runId") as string;
  if (!runId) return;
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : "/audit";
  const { rollbackRun } = await import("@/services/gmail/actions");
  await rollbackRun(session.user.id, runId);
  revalidatePath("/audit");
  redirect(returnTo);
}

/** Accept suggestion: dismiss from queue without creating a rule. Keeps classification, stops future suggestions. */
export async function acceptSuggestion(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const emailEventId = formData.get("emailEventId") as string;
  if (!emailEventId) return;
  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== session.user.id) return;
  const email = extractEmail(event.from_);
  const domain = extractDomain(event.from_) ?? event.senderDomain;

  if (email) {
    await prisma.rejectedSuggestion.upsert({
      where: {
        userId_type_value: { userId: session.user.id, type: "person", value: email },
      },
      create: { userId: session.user.id, type: "person", value: email },
      update: {},
    });
  }
  if (domain) {
    await prisma.rejectedSuggestion.upsert({
      where: {
        userId_type_value: { userId: session.user.id, type: "domain", value: domain },
      },
      create: { userId: session.user.id, type: "domain", value: domain },
      update: {},
    });
  }
  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect("/settings/declutter#suggested-actions");
}

/** Reject suggestion: don't suggest this sender/domain again, revert classification. */
export async function rejectSuggestion(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const emailEventId = formData.get("emailEventId") as string;
  const ruleType = formData.get("ruleType") as string; // "sender" | "domain" | "both"
  if (!emailEventId) return;
  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== session.user.id) return;
  const email = extractEmail(event.from_);
  const domain = extractDomain(event.from_) ?? event.senderDomain;

  if (ruleType === "both" || (!ruleType && (email || domain))) {
    if (email) {
      await prisma.rejectedSuggestion.upsert({
        where: {
          userId_type_value: { userId: session.user.id, type: "person", value: email },
        },
        create: { userId: session.user.id, type: "person", value: email },
        update: {},
      });
    }
    if (domain) {
      await prisma.rejectedSuggestion.upsert({
        where: {
          userId_type_value: { userId: session.user.id, type: "domain", value: domain },
        },
        create: { userId: session.user.id, type: "domain", value: domain },
        update: {},
      });
    }
  } else if (ruleType === "sender" && email) {
    await prisma.rejectedSuggestion.upsert({
      where: {
        userId_type_value: { userId: session.user.id, type: "person", value: email },
      },
      create: { userId: session.user.id, type: "person", value: email },
      update: {},
    });
  } else if (ruleType === "domain" && domain) {
    await prisma.rejectedSuggestion.upsert({
      where: {
        userId_type_value: { userId: session.user.id, type: "domain", value: domain },
      },
      create: { userId: session.user.id, type: "domain", value: domain },
      update: {},
    });
  }

  await prisma.emailEvent.update({
    where: { id: emailEventId },
    data: {
      classificationCategoryId: null,
      explainJson: { source: "rejected", reason: "User rejected suggestion" } as object,
    },
  });
  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect("/settings/declutter#suggested-actions");
}

/** Approve suggested rule: creates sender or domain rule from email event. */
export async function approveRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const emailEventId = formData.get("emailEventId") as string;
  const ruleType = (formData.get("ruleType") as string) || "";
  const categoryIdForm = (formData.get("categoryId") as string)?.trim() || null;
  const newCategoryName = (formData.get("newCategoryName") as string)?.trim() || null;
  const newCategoryParentId = (formData.get("newCategoryParentId") as string)?.trim() || null;
  if (!emailEventId || !ruleType) return;

  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== session.user.id) return;

  let categoryId: string;
  if (newCategoryName) {
    const parentId = newCategoryParentId || null;
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, userId: session.user.id },
      });
      if (!parent) return;
    }
    const cat = await prisma.category.create({
      data: { userId: session.user.id, name: newCategoryName, parentId },
    });
    await ensureDeclutterRulesForCategories(session.user.id);
    categoryId = cat.id;
  } else if (categoryIdForm) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryIdForm, userId: session.user.id },
    });
    if (!cat) return;
    categoryId = cat.id;
  } else {
    categoryId = event.classificationCategoryId ?? "";
    if (!categoryId) return;
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, userId: session.user.id },
    });
    if (!cat) return;
  }

  const cat = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { name: true },
  });

  const email = extractEmail(event.from_);
  const domain = extractDomain(event.from_) ?? event.senderDomain;

  if (ruleType === "sender" && email) {
    await prisma.personRule.upsert({
      where: { userId_email: { userId: session.user.id, email } },
      create: { userId: session.user.id, email, categoryId },
      update: { categoryId },
    });
  } else if (ruleType === "domain" && domain) {
    await prisma.orgRule.upsert({
      where: { userId_domain: { userId: session.user.id, domain } },
      create: { userId: session.user.id, domain, categoryId },
      update: { categoryId },
    });
  }

  await prisma.emailEvent.update({
    where: { id: emailEventId },
    data: {
      classificationCategoryId: categoryId,
      explainJson: {
        source: "rule",
        ruleType: ruleType as "person" | "domain",
        matchedValue: ruleType === "sender" ? email : domain,
        categoryName: cat.name,
      } as object,
    },
  });

  const noRedirect = formData.get("noRedirect") === "true";
  if (!noRedirect) {
    revalidatePath("/brief");
    revalidatePath("/settings/declutter");
    redirect("/settings/declutter#suggested-actions");
  }
  // When noRedirect: don't revalidate — keeps the suggestion row visible so the button can show "Saved"
}

/** Update category on an existing person or org rule. */
export async function updateRuleCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const ruleType = formData.get("ruleType") as string; // "person" | "org"
  const ruleId = formData.get("ruleId") as string;
  const categoryIdForm = (formData.get("categoryId") as string)?.trim() || null;
  const newCategoryName = (formData.get("newCategoryName") as string)?.trim() || null;
  const newCategoryParentId = (formData.get("newCategoryParentId") as string)?.trim() || null;
  if (!ruleType || !ruleId) return;

  let categoryId: string;
  if (newCategoryName) {
    const parentId = newCategoryParentId || null;
    const cat = await prisma.category.create({
      data: { userId: session.user.id, name: newCategoryName, parentId },
    });
    await ensureDeclutterRulesForCategories(session.user.id);
    categoryId = cat.id;
  } else if (categoryIdForm) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryIdForm, userId: session.user.id },
    });
    if (!cat) return;
    categoryId = cat.id;
  } else {
    return;
  }

  if (ruleType === "person") {
    const rule = await prisma.personRule.findFirst({
      where: { id: ruleId, userId: session.user.id },
    });
    if (!rule) return;
    await prisma.personRule.update({
      where: { id: ruleId },
      data: { categoryId },
    });
  } else if (ruleType === "org") {
    const rule = await prisma.orgRule.findFirst({
      where: { id: ruleId, userId: session.user.id },
    });
    if (!rule) return;
    await prisma.orgRule.update({
      where: { id: ruleId },
      data: { categoryId },
    });
  }

  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect("/settings/declutter#rules");
}

function safeReturnTo(formData: FormData, fallback: string): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  return v.startsWith("/") ? v : fallback;
}

function withRuleError(returnTo: string, message: string): string {
  const [base, hash] = returnTo.split("#", 2);
  const sep = base.includes("?") ? "&" : "?";
  const next = `${base}${sep}ruleError=${encodeURIComponent(message)}`;
  return hash ? `${next}#${hash}` : next;
}

export async function convertPersonRuleToDomain(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const returnTo = safeReturnTo(formData, "/settings/declutter#rules");
  const ruleId = (formData.get("ruleId") as string) ?? "";
  if (!ruleId) return;

  const rule = await prisma.personRule.findFirst({
    where: { id: ruleId, userId: session.user.id },
    select: { id: true, email: true, categoryId: true },
  });
  if (!rule) return;

  const at = rule.email.lastIndexOf("@");
  const domain = at >= 0 ? rule.email.slice(at + 1).toLowerCase().trim() : "";
  if (!domain) {
    redirect(withRuleError(returnTo, "Cannot infer domain from sender email."));
  }

  const existing = await prisma.orgRule.findUnique({
    where: { userId_domain: { userId: session.user.id, domain } },
    select: { id: true, categoryId: true },
  });

  if (existing && existing.categoryId !== rule.categoryId) {
    redirect(withRuleError(returnTo, `Domain rule for ${domain} already exists with a different category.`));
  }

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.orgRule.create({
        data: { userId: session.user!.id!, domain, categoryId: rule.categoryId },
      });
    }
    await tx.personRule.delete({ where: { id: rule.id } });
  });

  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect(returnTo);
}

export async function convertDomainRuleToSender(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const returnTo = safeReturnTo(formData, "/settings/declutter#rules");
  const ruleId = (formData.get("ruleId") as string) ?? "";
  const senderEmailRaw = formData.get("senderEmail");
  const senderEmail = typeof senderEmailRaw === "string" ? senderEmailRaw.trim().toLowerCase() : "";
  if (!ruleId || !senderEmail) return;

  const rule = await prisma.orgRule.findFirst({
    where: { id: ruleId, userId: session.user.id },
    select: { id: true, domain: true, categoryId: true },
  });
  if (!rule) return;

  const at = senderEmail.lastIndexOf("@");
  const domain = at >= 0 ? senderEmail.slice(at + 1).toLowerCase().trim() : "";
  if (!domain || domain !== rule.domain.toLowerCase()) {
    redirect(withRuleError(returnTo, `Sender email must be within ${rule.domain}.`));
  }

  const existing = await prisma.personRule.findUnique({
    where: { userId_email: { userId: session.user.id, email: senderEmail } },
    select: { id: true, categoryId: true },
  });
  if (existing && existing.categoryId !== rule.categoryId) {
    redirect(withRuleError(returnTo, `Sender rule for ${senderEmail} already exists with a different category.`));
  }

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.personRule.create({
        data: { userId: session.user!.id!, email: senderEmail, categoryId: rule.categoryId },
      });
    }
    await tx.orgRule.delete({ where: { id: rule.id } });
  });

  revalidatePath("/brief");
  revalidatePath("/settings/declutter");
  redirect(returnTo);
}
