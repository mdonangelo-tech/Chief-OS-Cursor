import { prisma } from "@/lib/prisma";
import {
  canonicalOrgDomain,
  domainVariants,
  extractDomainFromEmailOrHeader,
  extractEmailAddress,
  normalizeDomain,
  normalizeEmailAddress,
} from "@/lib/email/identity";

export type RuleSuggestion = {
  emailEventId: string;
  from: string;
  snippet: string | null;
  email: string | null;
  domain: string | null;
  canonicalDomain: string | null;
  suggestionKey: string;
  categoryId: string;
  categoryName: string;
  confidence: number | null;
  band: "high" | "mid";
  needsSender: boolean;
  needsDomain: boolean;
  recommendedRuleType: "domain" | "sender";
  recommendedValue: string;
};

export function buildKnownEmailSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const email = normalizeEmailAddress(value);
    if (email) out.add(email);
  }
  return out;
}

export function buildKnownDomainSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    for (const domain of domainVariants(value)) {
      out.add(domain);
    }
  }
  return out;
}

export function buildRejectedKeySet(values: Iterable<{ type: string; value: string }>): Set<string> {
  const out = new Set<string>();
  for (const row of values) {
    if (row.type === "person") {
      const email = normalizeEmailAddress(row.value);
      if (email) out.add(`person:${email}`);
    } else if (row.type === "domain") {
      for (const domain of domainVariants(row.value)) {
        out.add(`domain:${domain}`);
      }
    }
  }
  return out;
}

function hasDomainCoverage(domain: string | null, knownDomains: Set<string>, rejectedKeys: Set<string>): boolean {
  if (!domain) return false;
  return domainVariants(domain).some(
    (value) => knownDomains.has(value) || rejectedKeys.has(`domain:${value}`)
  );
}

function suggestionKey(args: {
  recommendedRuleType: "domain" | "sender";
  recommendedValue: string;
  categoryId: string;
  canonicalDomain: string | null;
}): string {
  const value =
    args.recommendedRuleType === "domain" && args.canonicalDomain
      ? args.canonicalDomain
      : args.recommendedValue;
  return `${args.recommendedRuleType}:${value}:${args.categoryId}`;
}

function compareSuggestions(a: RuleSuggestion, b: RuleSuggestion): number {
  const band = (b.band === "high" ? 1 : 0) - (a.band === "high" ? 1 : 0);
  if (band !== 0) return band;
  const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (conf !== 0) return conf;
  return a.suggestionKey.localeCompare(b.suggestionKey);
}

export function buildRuleSuggestions(args: {
  events: Array<{
    id: string;
    from_: string;
    senderDomain: string | null;
    snippet: string | null;
    confidence: number | null;
    explainJson: unknown;
    classificationCategoryId: string | null;
    category: { id: string; name: string } | null;
    date: Date;
  }>;
  knownEmails: Set<string>;
  knownDomains: Set<string>;
  rejectedKeys: Set<string>;
  limit?: number;
}): RuleSuggestion[] {
  const suggestionsByKey = new Map<string, RuleSuggestion>();
  const seen = new Set<string>();

  for (const e of args.events) {
    if (!e.classificationCategoryId || !e.category) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);

    const email = extractEmailAddress(e.from_);
    const domain = extractDomainFromEmailOrHeader(e.from_) ?? normalizeDomain(e.senderDomain);
    const canonicalDomain = canonicalOrgDomain(domain);
    const domainCoveredByOrgRule = hasDomainCoverage(domain, args.knownDomains, args.rejectedKeys);
    // Org/domain rule applies to all senders on that domain — do not suggest a redundant person rule.
    const needsSender =
      !!email &&
      !args.knownEmails.has(email) &&
      !args.rejectedKeys.has(`person:${email}`) &&
      !domainCoveredByOrgRule;
    const needsDomain =
      !!domain && !hasDomainCoverage(domain, args.knownDomains, args.rejectedKeys);
    if (!needsSender && !needsDomain) continue;

    const conf =
      e.confidence ??
      ((e.explainJson as { confidence?: number } | null)?.confidence ?? null);
    const band: "high" | "mid" = conf != null && conf >= 0.85 ? "high" : "mid";

    const recommendedRuleType: "domain" | "sender" =
      needsDomain ? "domain" : "sender";
    const recommendedValue =
      recommendedRuleType === "domain"
        ? (domain as string)
        : (email as string);
    const key = suggestionKey({
      recommendedRuleType,
      recommendedValue,
      categoryId: e.category.id,
      canonicalDomain,
    });
    const suggestion: RuleSuggestion = {
      emailEventId: e.id,
      from: e.from_,
      snippet: e.snippet,
      email,
      domain,
      canonicalDomain,
      suggestionKey: key,
      categoryId: e.category.id,
      categoryName: e.category.name,
      confidence: conf,
      band,
      needsSender,
      needsDomain,
      recommendedRuleType,
      recommendedValue,
    };
    const existing = suggestionsByKey.get(key);
    if (!existing || compareSuggestions(suggestion, existing) < 0) {
      suggestionsByKey.set(key, suggestion);
    }
  }

  const suggestions = Array.from(suggestionsByKey.values()).sort(compareSuggestions);

  return typeof args.limit === "number" ? suggestions.slice(0, args.limit) : suggestions;
}

export async function getRuleSuggestionsForUser(args: {
  userId: string;
  googleAccountIds: string[];
  limit?: number;
}): Promise<RuleSuggestion[]> {
  const { userId, googleAccountIds, limit = 4 } = args;

  const [personRules, orgRules, rejected, events] = await Promise.all([
    prisma.personRule.findMany({
      where: { userId },
      select: { email: true },
      take: 5000,
    }),
    prisma.orgRule.findMany({
      where: { userId },
      select: { domain: true },
      take: 5000,
    }),
    prisma.rejectedSuggestion.findMany({
      where: { userId },
      select: { type: true, value: true },
      take: 5000,
    }),
    prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: googleAccountIds },
        classificationCategoryId: { not: null },
      },
      include: { category: true },
      orderBy: { date: "desc" },
      take: 80,
    }),
  ]);

  const knownEmails = buildKnownEmailSet(personRules.map((r) => r.email));
  const knownDomains = buildKnownDomainSet(orgRules.map((r) => r.domain));
  const rejectedKeys = buildRejectedKeySet(rejected);

  return buildRuleSuggestions({
    events,
    knownEmails,
    knownDomains,
    rejectedKeys,
    limit,
  });
}

