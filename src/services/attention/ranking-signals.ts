import { canonicalOrgDomain, normalizeDomain, normalizeEmailAddress } from "@/lib/email/identity";

export type RankingPenalties = {
  byDomain: Record<string, number>;
  bySender: Record<string, number>;
  byCanonicalDomain: Record<string, number>;
  byCategory: Record<string, number>;
  byPattern: Record<string, number>;
};

export type RankingSignalInput = {
  fromEmail?: string | null;
  senderDomain?: string | null;
  categoryName?: string | null;
  labels?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  needsAction?: boolean | null;
  actionType?: string | null;
};

export type RankingSignalKeys = {
  sender: string | null;
  domain: string | null;
  canonicalDomain: string | null;
  category: string | null;
  pattern: string | null;
  isLowSignalNotification: boolean;
  isProtected: boolean;
};

const LOW_SIGNAL_CATEGORY_NAMES = new Set([
  "newsletter",
  "newsletters",
  "promotion",
  "promotions",
  "low-priority",
  "low priority",
  "notification",
  "notifications",
  "social",
  "updates",
]);

const SOCIAL_NOTIFICATION_TERMS =
  /\b(reel|reels|friend update|friendupdates|activity|notification|notifications|liked|commented|mentioned|tagged|shared|posted|followers?|groups?|birthday|memories|suggested for you)\b/i;

const PROTECTED_TERMS =
  /\b(security|login|log in|sign in|signin|password|passcode|2fa|two-factor|verification|verify|verified|account alert|suspicious|billing|receipt|invoice|payment|charge|refund|reset|recovery|code|auth|authentication)\b/i;

const PERSONAL_REPLY_TERMS = /\b(re:|fwd:|reply|following up|checking in|thank you|thanks)\b/i;

const PERSONAL_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function keyCategory(categoryName: string | null | undefined): string | null {
  const v = categoryName?.trim().toLowerCase();
  return v || null;
}

export function isLowSignalCategoryName(categoryName: string | null | undefined): boolean {
  const key = keyCategory(categoryName);
  if (!key) return false;
  return LOW_SIGNAL_CATEGORY_NAMES.has(key);
}

export function isProtectedAttentionEmail(input: RankingSignalInput): boolean {
  const text = `${input.categoryName ?? ""} ${input.subject ?? ""} ${input.snippet ?? ""} ${input.fromEmail ?? ""}`;
  if (PROTECTED_TERMS.test(text)) return true;

  // A true action-needed item should not be hidden only because its domain has noisy mail.
  if (input.needsAction === true && input.actionType && input.actionType !== "read" && input.actionType !== "ignore") {
    return true;
  }

  if (input.needsAction === true && PERSONAL_REPLY_TERMS.test(input.subject ?? "")) return true;
  return false;
}

export function notificationPatternKey(input: RankingSignalInput): string | null {
  if (isProtectedAttentionEmail(input)) return null;

  const sender = normalizeEmailAddress(input.fromEmail);
  const domain =
    normalizeDomain(input.senderDomain) ??
    (sender ? normalizeDomain(sender.slice(sender.lastIndexOf("@") + 1)) : null);
  const canonical = canonicalOrgDomain(domain) ?? domain;
  const labels = input.labels ?? [];
  const text = `${input.fromEmail ?? ""} ${input.subject ?? ""} ${input.snippet ?? ""}`;
  const category = keyCategory(input.categoryName);

  const looksSocial =
    labels.includes("CATEGORY_SOCIAL") ||
    category === "social" ||
    (domain?.includes("facebookmail.com") ?? false) ||
    SOCIAL_NOTIFICATION_TERMS.test(text);

  if (!looksSocial || !canonical) return null;
  return `${canonical}:social_notification`;
}

export function rankingSignalKeys(input: RankingSignalInput): RankingSignalKeys {
  const sender = normalizeEmailAddress(input.fromEmail) ?? null;
  const domain = normalizeDomain(input.senderDomain) ?? (sender ? normalizeDomain(sender.slice(sender.lastIndexOf("@") + 1)) : null);
  const canonicalDomain = canonicalOrgDomain(domain) ?? domain;
  const category = keyCategory(input.categoryName);
  const pattern = notificationPatternKey(input);
  const isProtected = isProtectedAttentionEmail(input);
  const isLowSignalNotification =
    !isProtected &&
    (isLowSignalCategoryName(category) ||
      pattern != null ||
      (input.labels ?? []).includes("CATEGORY_SOCIAL"));

  return {
    sender,
    domain,
    canonicalDomain,
    category,
    pattern,
    isLowSignalNotification,
    isProtected,
  };
}

export function allowsCanonicalDomainLearning(domain: string | null): boolean {
  return !!domain && !PERSONAL_MAIL_DOMAINS.has(domain);
}

export function strongestLearnedPenalty(
  input: RankingSignalInput,
  penalties?: Partial<RankingPenalties>
): { value: number; source: "sender" | "domain" | "canonical_domain" | "category" | "pattern" | null } {
  if (!penalties) return { value: 0, source: null };
  const keys = rankingSignalKeys(input);
  if (keys.isProtected) return { value: 0, source: null };

  const candidates: Array<{
    source: "sender" | "domain" | "canonical_domain" | "category" | "pattern";
    value: number | undefined;
  }> = [
    { source: "sender", value: keys.sender ? penalties.bySender?.[keys.sender] : undefined },
    { source: "domain", value: keys.domain ? penalties.byDomain?.[keys.domain] : undefined },
    {
      source: "canonical_domain",
      value:
        keys.canonicalDomain && allowsCanonicalDomainLearning(keys.canonicalDomain)
          ? penalties.byCanonicalDomain?.[keys.canonicalDomain]
          : undefined,
    },
    {
      source: "category",
      value:
        keys.category && keys.pattern
          ? penalties.byCategory?.[keys.category]
          : undefined,
    },
    { source: "pattern", value: keys.pattern ? penalties.byPattern?.[keys.pattern] : undefined },
  ];

  return candidates.reduce<{ value: number; source: "sender" | "domain" | "canonical_domain" | "category" | "pattern" | null }>(
    (best, candidate) => {
      const value =
        typeof candidate.value === "number" && Number.isFinite(candidate.value)
          ? Math.max(0, Math.min(1, candidate.value))
          : 0;
      return value > best.value ? { value, source: candidate.source } : best;
    },
    { value: 0, source: null }
  );
}
