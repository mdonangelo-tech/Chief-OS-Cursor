import { prisma } from "@/lib/prisma";

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

export type RuleSuggestion = {
  emailEventId: string;
  from: string;
  snippet: string | null;
  email: string | null;
  domain: string | null;
  categoryId: string;
  categoryName: string;
  confidence: number | null;
  band: "high" | "mid";
  needsSender: boolean;
  needsDomain: boolean;
  recommendedRuleType: "domain" | "sender";
  recommendedValue: string;
};

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
  const suggestions: RuleSuggestion[] = [];
  const seen = new Set<string>();

  for (const e of args.events) {
    if (!e.classificationCategoryId || !e.category) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);

    const email = extractEmail(e.from_);
    const domain = extractDomain(e.from_) ?? e.senderDomain;
    const needsSender = !!email && !args.knownEmails.has(email) && !args.rejectedKeys.has(`person:${email}`);
    const needsDomain = !!domain && !args.knownDomains.has(domain) && !args.rejectedKeys.has(`domain:${domain}`);
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

    suggestions.push({
      emailEventId: e.id,
      from: e.from_,
      snippet: e.snippet,
      email,
      domain,
      categoryId: e.category.id,
      categoryName: e.category.name,
      confidence: conf,
      band,
      needsSender,
      needsDomain,
      recommendedRuleType,
      recommendedValue,
    });
  }

  suggestions.sort((a, b) => {
    const band = (b.band === "high" ? 1 : 0) - (a.band === "high" ? 1 : 0);
    if (band !== 0) return band;
    const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (conf !== 0) return conf;
    return 0;
  });

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

  const knownEmails = new Set(personRules.map((r) => r.email));
  const knownDomains = new Set(orgRules.map((r) => r.domain));
  const rejectedKeys = new Set(rejected.map((r) => `${r.type}:${r.value}`));

  return buildRuleSuggestions({
    events,
    knownEmails,
    knownDomains,
    rejectedKeys,
    limit,
  });
}

