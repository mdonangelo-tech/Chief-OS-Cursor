// src/lib/decision-engine.ts

export type DecisionAction =
  | "NONE"
  | "LABEL_ONLY"
  | "DIGEST"
  | "ARCHIVE_AFTER_48H"
  | "ARCHIVE_AFTER_N_DAYS"
  | "MOVE_TO_SPAM";

export type CategoryDeclutterPolicy =
  | { action: "LABEL_ONLY" | "DIGEST" | "NONE" }
  | { action: "ARCHIVE_AFTER_48H" }
  | { action: "ARCHIVE_AFTER_N_DAYS"; days: number }
  | { action: "MOVE_TO_SPAM" };

export type DecideEmailContext = {
  now: Date;

  // candidate categories (already resolved to a categoryId)
  personRuleCategoryId?: string | null;
  domainRuleCategoryId?: string | null;
  llmCategoryId?: string | null;

  // default category id, typically "Other"
  defaultCategoryId?: string | null;

  // category metadata
  categoryById: Record<
    string,
    {
      id: string;
      name: string;
      // if true: cannot be auto-archived or moved to spam
      protected?: boolean;
      declutterPolicy: CategoryDeclutterPolicy;
    }
  >;
};

export type EmailEventInput = {
  id: string;
  date: Date;
  from?: string | null;
  senderDomain?: string | null;
  // existing classification (optional, used only as fallback if you want)
  classificationCategoryId?: string | null;
};

export type DecideEmailReason = {
  winner: "PERSON_RULE" | "DOMAIN_RULE" | "LLM" | "DEFAULT" | "NONE";
  chosenCategoryId: string | null;
  chosenCategoryName: string | null;
  candidates: {
    personRuleCategoryId?: string | null;
    domainRuleCategoryId?: string | null;
    llmCategoryId?: string | null;
    defaultCategoryId?: string | null;
  };
  overrides: Array<{
    type: "PROTECTED_CATEGORY_BLOCK";
    blockedAction: DecisionAction;
    reason: string;
  }>;
};

export type DecideEmailResult = {
  finalCategoryId: string | null;
  action: DecisionAction;
  archiveAt: Date | null;
  reason: DecideEmailReason;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function categoryName(ctx: DecideEmailContext, categoryId: string | null) {
  if (!categoryId) return null;
  return ctx.categoryById[categoryId]?.name ?? null;
}

function computeActionAndArchiveAt(
  email: EmailEventInput,
  ctx: DecideEmailContext,
  categoryId: string
): { action: DecisionAction; archiveAt: Date | null } {
  const meta = ctx.categoryById[categoryId];
  const policy = meta?.declutterPolicy;

  if (!policy) return { action: "NONE", archiveAt: null };

  switch (policy.action) {
    case "NONE":
      return { action: "NONE", archiveAt: null };
    case "LABEL_ONLY":
      return { action: "LABEL_ONLY", archiveAt: null };
    case "DIGEST":
      return { action: "DIGEST", archiveAt: null };
    case "ARCHIVE_AFTER_48H":
      return { action: "ARCHIVE_AFTER_48H", archiveAt: addHours(email.date, 48) };
    case "ARCHIVE_AFTER_N_DAYS":
      return { action: "ARCHIVE_AFTER_N_DAYS", archiveAt: addDays(email.date, policy.days) };
    case "MOVE_TO_SPAM":
      return { action: "MOVE_TO_SPAM", archiveAt: null };
  }
}

function applyProtectedOverrides(
  ctx: DecideEmailContext,
  categoryId: string,
  action: DecisionAction,
  archiveAt: Date | null
): { action: DecisionAction; archiveAt: Date | null; overrides: DecideEmailReason["overrides"] } {
  const meta = ctx.categoryById[categoryId];
  const isProtected = Boolean(meta?.protected);

  const overrides: DecideEmailReason["overrides"] = [];

  if (!isProtected) return { action, archiveAt, overrides };

  // Protected categories can still be labeled/digested,
  // but cannot be auto-archived or moved to spam.
  if (action === "MOVE_TO_SPAM" || action === "ARCHIVE_AFTER_48H" || action === "ARCHIVE_AFTER_N_DAYS") {
    overrides.push({
      type: "PROTECTED_CATEGORY_BLOCK",
      blockedAction: action,
      reason: `Category "${meta?.name ?? categoryId}" is protected; blocking ${action}.`,
    });
    return { action: "LABEL_ONLY", archiveAt: null, overrides };
  }

  return { action, archiveAt, overrides };
}

/**
 * Pure deterministic selection.
 * Precedence: PersonRule → DomainRule → LLM → Default("Other") → null
 */
export function decideEmail(email: EmailEventInput, ctx: DecideEmailContext): DecideEmailResult {
  const candidates = {
    personRuleCategoryId: ctx.personRuleCategoryId ?? null,
    domainRuleCategoryId: ctx.domainRuleCategoryId ?? null,
    llmCategoryId: ctx.llmCategoryId ?? null,
    defaultCategoryId: ctx.defaultCategoryId ?? null,
  };

  const pick =
    candidates.personRuleCategoryId ||
    candidates.domainRuleCategoryId ||
    candidates.llmCategoryId ||
    candidates.defaultCategoryId ||
    null;

  const winner: DecideEmailReason["winner"] =
    candidates.personRuleCategoryId
      ? "PERSON_RULE"
      : candidates.domainRuleCategoryId
        ? "DOMAIN_RULE"
        : candidates.llmCategoryId
          ? "LLM"
          : candidates.defaultCategoryId
            ? "DEFAULT"
            : "NONE";

  if (!pick) {
    return {
      finalCategoryId: null,
      action: "NONE",
      archiveAt: null,
      reason: {
        winner,
        chosenCategoryId: null,
        chosenCategoryName: null,
        candidates,
        overrides: [],
      },
    };
  }

  const { action, archiveAt } = computeActionAndArchiveAt(email, ctx, pick);
  const protectedResult = applyProtectedOverrides(ctx, pick, action, archiveAt);

  return {
    finalCategoryId: pick,
    action: protectedResult.action,
    archiveAt: protectedResult.archiveAt,
    reason: {
      winner,
      chosenCategoryId: pick,
      chosenCategoryName: categoryName(ctx, pick),
      candidates,
      overrides: protectedResult.overrides,
    },
  };
}
