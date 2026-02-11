/**
 * Classification engine: deterministic rules first, LLM fallback when enabled.
 * Order: person_rules (override) then org_rules (domain) then LLM.
 */

import { prisma } from "@/lib/prisma";
import {
  classifyEmailWithLlm,
  classifyEmailsBatchWithLlm,
  isLlmClassificationEnabled,
} from "@/services/llm";

export interface ClassificationResult {
  categoryId: string | null;
  importanceScore: number;
  needsAction: boolean | null;
  actionType: string | null;
  confidence: number;
  explainJson: {
    source: "rule" | "llm";
    ruleType?: "person" | "domain";
    ruleId?: string;
    matchedValue?: string;
    categoryName: string;
    reason?: string;
    suggestedRule?: { type: string; value: string; category_name: string };
  };
}

function extractEmailAddress(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  const trimmed = fromHeader.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return null;
}

function extractDomain(fromHeader: string): string | null {
  const email = extractEmailAddress(fromHeader);
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/** Optional: cap LLM calls. When provided, LLM is skipped once budget reaches 0. */
export async function classifyEmailEvent(
  userId: string,
  emailEventId: string,
  llmBudget?: { remaining: number }
): Promise<ClassificationResult | null> {
  const event = await prisma.emailEvent.findFirst({
    where: { id: emailEventId },
    include: { googleAccount: true },
  });
  if (!event || event.googleAccount.userId !== userId) return null;

  const fromEmail = extractEmailAddress(event.from_);
  const domain = event.senderDomain ?? extractDomain(event.from_);

  const [personRules, orgRules] = await Promise.all([
    prisma.personRule.findMany({
      where: { userId },
      include: { category: true },
    }),
    prisma.orgRule.findMany({
      where: { userId },
      include: { category: true },
    }),
  ]);

  if (fromEmail) {
    const personMatch = personRules.find(
      (r) => r.email.toLowerCase() === fromEmail
    );
    if (personMatch) {
      const result: ClassificationResult = {
        categoryId: personMatch.categoryId,
        importanceScore: 0.7,
        needsAction: null,
        actionType: null,
        confidence: 1,
        explainJson: {
          source: "rule",
          ruleType: "person",
          ruleId: personMatch.id,
          matchedValue: personMatch.email,
          categoryName: personMatch.category.name,
        },
      };
      await prisma.emailEvent.update({
        where: { id: emailEventId },
        data: {
          classificationCategoryId: result.categoryId,
          importanceScore: result.importanceScore,
          confidence: result.confidence,
          explainJson: result.explainJson as object,
        },
      });
      return result;
    }
  }

  if (domain) {
    const domainMatch = orgRules.find(
      (r) => r.domain.toLowerCase() === domain
    );
    if (domainMatch) {
      const result: ClassificationResult = {
        categoryId: domainMatch.categoryId,
        importanceScore: 0.6,
        needsAction: null,
        actionType: null,
        confidence: 1,
        explainJson: {
          source: "rule",
          ruleType: "domain",
          ruleId: domainMatch.id,
          matchedValue: domainMatch.domain,
          categoryName: domainMatch.category.name,
        },
      };
      await prisma.emailEvent.update({
        where: { id: emailEventId },
        data: {
          classificationCategoryId: result.categoryId,
          importanceScore: result.importanceScore,
          confidence: result.confidence,
          explainJson: result.explainJson as object,
        },
      });
      return result;
    }
  }

  // Heuristic: Gmail labels for bulk mail - skip LLM (saves cost)
  const labels = event.labels ?? [];
  if (labels.includes("CATEGORY_PROMOTIONS")) {
    const cat = await prisma.category.findFirst({
      where: { userId, name: "Promotions" },
    });
    if (cat) {
      const result: ClassificationResult = {
        categoryId: cat.id,
        importanceScore: 0.3,
        needsAction: false,
        actionType: "ignore",
        confidence: 0.95,
        explainJson: { source: "rule", categoryName: "Promotions", reason: "Gmail label" },
      };
      await prisma.emailEvent.update({
        where: { id: emailEventId },
        data: {
          classificationCategoryId: result.categoryId,
          importanceScore: result.importanceScore,
          needsAction: result.needsAction,
          actionType: result.actionType,
          confidence: result.confidence,
          explainJson: result.explainJson as object,
        },
      });
      return result;
    }
  }
  if (labels.includes("CATEGORY_UPDATES") || labels.includes("CATEGORY_FORUMS")) {
    const cat = await prisma.category.findFirst({
      where: { userId, name: "Newsletters" },
    });
    if (cat) {
      const result: ClassificationResult = {
        categoryId: cat.id,
        importanceScore: 0.35,
        needsAction: false,
        actionType: "read",
        confidence: 0.95,
        explainJson: { source: "rule", categoryName: "Newsletters", reason: "Gmail label" },
      };
      await prisma.emailEvent.update({
        where: { id: emailEventId },
        data: {
          classificationCategoryId: result.categoryId,
          importanceScore: result.importanceScore,
          needsAction: result.needsAction,
          actionType: result.actionType,
          confidence: result.confidence,
          explainJson: result.explainJson as object,
        },
      });
      return result;
    }
  }

  if (
    isLlmClassificationEnabled() &&
    (!llmBudget || llmBudget.remaining > 0)
  ) {
    try {
      const categoryNames = (
        await prisma.category.findMany({
          where: { userId },
          select: { name: true },
        })
      ).map((c) => c.name);

      const llmResult = await classifyEmailWithLlm(
        event.from_,
        event.subject,
        event.snippet,
        event.senderDomain,
        categoryNames
      );
      if (llmResult && llmResult.confidence >= 0.6) {
        const userCategories = await prisma.category.findMany({
          where: { userId },
          select: { id: true, name: true },
        });
        const exact = userCategories.find(
          (c) => c.name.toLowerCase() === llmResult!.category_name.toLowerCase()
        );
        const fallback =
          exact ??
          userCategories.find(
            (c) =>
              c.name.toLowerCase().includes(llmResult!.category_name.toLowerCase()) ||
              llmResult!.category_name.toLowerCase().includes(c.name.toLowerCase())
          );
        const other = userCategories.find((c) => c.name === "Other");
        const category = exact ?? fallback ?? other ?? userCategories[0] ?? null;

        const explainJson = {
          source: "llm" as const,
          reason: llmResult.reason,
          categoryName: category?.name ?? llmResult.category_name,
          confidence: llmResult.confidence,
          actionType: llmResult.action_type,
          suggestedRule: llmResult.suggested_rule,
        };

        const result: ClassificationResult = {
          categoryId: category?.id ?? null,
          importanceScore: llmResult.importance_score,
          needsAction: llmResult.needs_action,
          actionType: llmResult.action_type,
          confidence: llmResult.confidence,
          explainJson: { ...explainJson, source: "llm" },
        };

        await prisma.emailEvent.update({
          where: { id: emailEventId },
          data: {
            classificationCategoryId: result.categoryId,
            importanceScore: result.importanceScore,
            needsAction: result.needsAction,
            actionType: result.actionType,
            confidence: result.confidence,
            explainJson: explainJson as object,
          },
        });
        if (llmBudget) llmBudget.remaining--;
        return { ...result, explainJson };
      }
    } catch {
      // LLM failed; leave unclassified
    }
  }

  return null;
}

const LLM_BATCH_SIZE = parseInt(process.env.LLM_BATCH_SIZE ?? "6", 10) || 6;
const MAX_LLM_BATCHES = parseInt(process.env.LLM_MAX_BATCHES ?? "2", 10) || 2;

export async function classifyAllUnclassifiedEmails(
  userId: string
): Promise<{ classified: number; total: number; llmUsed: number }> {
  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const events = await prisma.emailEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      classificationCategoryId: null,
    },
    include: { googleAccount: true },
    orderBy: { date: "desc" },
  });

  let classified = 0;
  const needsLlm: typeof events = [];

  // Pass 1: rules + heuristics only (no LLM)
  for (const e of events) {
    const result = await classifyEmailEvent(userId, e.id, { remaining: 0 });
    if (result) {
      classified++;
    } else {
      needsLlm.push(e);
    }
  }

  // Pass 2: batch LLM for remaining (up to MAX_LLM_BATCHES batches)
  if (
    isLlmClassificationEnabled() &&
    needsLlm.length > 0
  ) {
    const categoryNames = (
      await prisma.category.findMany({
        where: { userId },
        select: { name: true },
      })
    ).map((c) => c.name);
    const userCategories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const toProcess = needsLlm.slice(0, LLM_BATCH_SIZE * MAX_LLM_BATCHES);
    let llmUsed = 0;

    for (let i = 0; i < toProcess.length; i += LLM_BATCH_SIZE) {
      const batch = toProcess.slice(i, i + LLM_BATCH_SIZE);
      const batchInput = batch.map((e) => ({
        from: e.from_,
        subject: e.subject,
        snippet: e.snippet,
      }));
      const results = await classifyEmailsBatchWithLlm(batchInput, categoryNames);

      for (let j = 0; j < batch.length; j++) {
        const llmResult = results[j];
        const event = batch[j];
        if (!llmResult || llmResult.confidence < 0.6) continue;

        const exact = userCategories.find(
          (c) => c.name.toLowerCase() === llmResult.category_name.toLowerCase()
        );
        const fallback = userCategories.find(
          (c) =>
            c.name.toLowerCase().includes(llmResult.category_name.toLowerCase()) ||
            llmResult.category_name.toLowerCase().includes(c.name.toLowerCase())
        );
        const other = userCategories.find((c) => c.name === "Other");
        const category = exact ?? fallback ?? other ?? userCategories[0] ?? null;

        const explainJson = {
          source: "llm" as const,
          reason: llmResult.reason,
          categoryName: category?.name ?? llmResult.category_name,
          confidence: llmResult.confidence,
          actionType: llmResult.action_type,
          suggestedRule: llmResult.suggested_rule,
        };

        await prisma.emailEvent.update({
          where: { id: event.id },
          data: {
            classificationCategoryId: category?.id ?? null,
            importanceScore: llmResult.importance_score,
            needsAction: llmResult.needs_action,
            actionType: llmResult.action_type,
            confidence: llmResult.confidence,
            explainJson: explainJson as object,
          },
        });
        classified++;
        llmUsed++;
      }
    }

    return {
      classified,
      total: events.length,
      llmUsed,
    };
  }

  return { classified, total: events.length, llmUsed: 0 };
}
