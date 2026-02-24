export type DecisionAction = "NONE" | "LABEL_ONLY" | "DIGEST" | "ARCHIVE_AT" | "SPAM";

export interface DecisionResult {
  emailEventId: string;
  googleAccountId: string;
  finalCategoryId: string | null;
  action: DecisionAction;
  archiveAt: string | null;
  reason: {
    winner: "personRule" | "domainRule" | "llm" | "default";
    candidates: Array<{
      source: string;
      categoryId: string;
      confidence?: number;
    }>;
    overrides: Array<{
      overriddenSource: string;
      reason: string;
    }>;
  };
}

type MinimalEmailEvent = {
  id: string;
  googleAccountId: string;
  date: Date;
  from_?: string | null;
  senderDomain?: string | null;
  classificationCategoryId?: string | null;
  confidence?: number | null;
  explainJson?: unknown;
};

type MinimalPersonRule = { email: string; categoryId: string; id?: string };
type MinimalOrgRule = { domain: string; categoryId: string; id?: string };

type MinimalCategory = {
  id: string;
  name: string;
  protectedFromAutoArchive?: boolean | null;
};

type MinimalCategoryPolicy = {
  action: string;
  archiveAfterDays?: number | null;
};

function extractEmailAddress(fromHeader?: string | null): string | null {
  if (!fromHeader || typeof fromHeader !== "string") return null;
  const match = fromHeader.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].toLowerCase().trim();
  const trimmed = fromHeader.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return null;
}

function extractDomain(fromHeader?: string | null): string | null {
  const email = extractEmailAddress(fromHeader);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function isExplainJsonFromLlm(explainJson: unknown): boolean {
  if (!explainJson || typeof explainJson !== "object") return false;
  const source = (explainJson as { source?: unknown }).source;
  return source === "llm";
}

function findDefaultOtherCategoryId(categoriesById: Record<string, MinimalCategory>): string | null {
  for (const c of Object.values(categoriesById)) {
    if ((c.name ?? "").toLowerCase() === "other") return c.id;
  }
  return null;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizePolicyAction(action: string): string {
  return (action ?? "").toLowerCase().trim();
}

function policyToDecision(
  policy: MinimalCategoryPolicy | undefined,
  emailDate: Date
): { action: DecisionAction; archiveAt: string | null; overrideReason?: string } {
  if (!policy) return { action: "NONE", archiveAt: null };

  const a = normalizePolicyAction(policy.action);
  if (a === "never") return { action: "NONE", archiveAt: null };
  if (a === "label_only") return { action: "LABEL_ONLY", archiveAt: null };
  if (a === "label+digest") return { action: "DIGEST", archiveAt: null };
  if (a === "move_to_spam") return { action: "SPAM", archiveAt: null };

  if (a === "archive_after_48h") {
    return { action: "ARCHIVE_AT", archiveAt: addHours(emailDate, 48).toISOString() };
  }

  if (a === "archive_after_days" || a === "archive_after_n_days") {
    const n = policy.archiveAfterDays;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      return {
        action: "NONE",
        archiveAt: null,
        overrideReason: `Policy requested ${a} but archiveAfterDays was missing/invalid.`,
      };
    }
    return { action: "ARCHIVE_AT", archiveAt: addDays(emailDate, n).toISOString() };
  }

  // Unknown policy strings are treated conservatively.
  return {
    action: "NONE",
    archiveAt: null,
    overrideReason: `Unknown policy action: ${policy.action}`,
  };
}

export function decideEmail(
  emailEvent: MinimalEmailEvent,
  ctx: {
    personRules: MinimalPersonRule[];
    orgRules: MinimalOrgRule[];
    categoriesById: Record<string, MinimalCategory>;
    categoryPoliciesById: Record<string, MinimalCategoryPolicy | undefined>;
    now: Date;
    llmEnabled: boolean;
  }
): DecisionResult {
  const overrides: DecisionResult["reason"]["overrides"] = [];
  const candidates: DecisionResult["reason"]["candidates"] = [];

  const fromEmail = extractEmailAddress(emailEvent.from_);
  const domainFromEvent = (emailEvent.senderDomain ?? "").trim().toLowerCase();
  const domain = domainFromEvent ? domainFromEvent : extractDomain(emailEvent.from_);

  const personMatch =
    fromEmail != null
      ? ctx.personRules.find((r) => r.email.toLowerCase() === fromEmail)
      : undefined;
  const domainMatch =
    domain != null
      ? ctx.orgRules.find((r) => r.domain.toLowerCase() === domain)
      : undefined;

  const llmCandidateCategoryId =
    ctx.llmEnabled &&
    isExplainJsonFromLlm(emailEvent.explainJson) &&
    typeof emailEvent.classificationCategoryId === "string" &&
    emailEvent.classificationCategoryId.length > 0
      ? emailEvent.classificationCategoryId
      : null;

  if (personMatch) {
    candidates.push({ source: "personRule", categoryId: personMatch.categoryId, confidence: 1 });
  }
  if (domainMatch) {
    candidates.push({ source: "domainRule", categoryId: domainMatch.categoryId, confidence: 1 });
  }
  if (llmCandidateCategoryId) {
    const conf = emailEvent.confidence ?? undefined;
    candidates.push({
      source: "llm",
      categoryId: llmCandidateCategoryId,
      ...(typeof conf === "number" ? { confidence: conf } : {}),
    });
  }

  // Determine category winner in strict precedence.
  let winner: DecisionResult["reason"]["winner"] = "default";
  let finalCategoryId: string | null = null;

  const personCategoryId = personMatch?.categoryId ?? null;
  const domainCategoryId = domainMatch?.categoryId ?? null;

  const isValidCategoryId = (id: string | null): id is string =>
    !!id && typeof id === "string" && !!ctx.categoriesById[id];

  if (isValidCategoryId(personCategoryId)) {
    winner = "personRule";
    finalCategoryId = personCategoryId;
    if (domainMatch) {
      overrides.push({
        overriddenSource: "domainRule",
        reason: "PersonRule takes precedence over OrgRule.",
      });
    }
    if (llmCandidateCategoryId) {
      overrides.push({
        overriddenSource: "llm",
        reason: "PersonRule takes precedence over LLM classification.",
      });
    }
  } else if (isValidCategoryId(domainCategoryId)) {
    winner = "domainRule";
    finalCategoryId = domainCategoryId;
    if (llmCandidateCategoryId) {
      overrides.push({
        overriddenSource: "llm",
        reason: "OrgRule (domain) takes precedence over LLM classification.",
      });
    }
  } else if (isValidCategoryId(llmCandidateCategoryId)) {
    winner = "llm";
    finalCategoryId = llmCandidateCategoryId;
  } else {
    const otherId = findDefaultOtherCategoryId(ctx.categoriesById);
    if (isValidCategoryId(otherId)) {
      candidates.push({ source: "default", categoryId: otherId });
      winner = "default";
      finalCategoryId = otherId;
    } else {
      winner = "default";
      finalCategoryId = null;
    }
  }

  // Action selection based on final category policy.
  const policy = finalCategoryId ? ctx.categoryPoliciesById[finalCategoryId] : undefined;
  const base = policyToDecision(policy, emailEvent.date);
  let action = base.action;
  let archiveAt = base.archiveAt;
  if (base.overrideReason) {
    overrides.push({ overriddenSource: "policy", reason: base.overrideReason });
  }

  // Protected categories cannot be auto-archived or moved to spam.
  if (finalCategoryId) {
    const cat = ctx.categoriesById[finalCategoryId];
    const protectedFromAutoArchive = !!cat?.protectedFromAutoArchive;
    if (protectedFromAutoArchive && (action === "ARCHIVE_AT" || action === "SPAM")) {
      const downgraded: DecisionAction =
        normalizePolicyAction(policy?.action ?? "") === "label_only" ? "LABEL_ONLY" : "DIGEST";
      overrides.push({
        overriddenSource: "protectedCategory",
        reason: `Category is protected from auto-archive/spam; downgraded action to ${downgraded}.`,
      });
      action = downgraded;
      archiveAt = null;
    }
  }

  return {
    emailEventId: emailEvent.id,
    googleAccountId: emailEvent.googleAccountId,
    finalCategoryId,
    action,
    archiveAt,
    reason: {
      winner,
      candidates,
      overrides,
    },
  };
}

