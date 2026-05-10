import { prisma } from "@/lib/prisma";
import {
  allowsCanonicalDomainLearning,
  rankingSignalKeys,
  type RankingPenalties,
  type RankingSignalInput,
} from "@/services/attention/ranking-signals";

const STEP_SENDER = 0.34;
const STEP_DOMAIN = 0.22;
const STEP_CANONICAL_DOMAIN = 0.18;
const STEP_CATEGORY = 0.18;
const STEP_PATTERN = 0.38;
const CAP_SENDER = 0.95;
const CAP_DOMAIN = 0.85;
const CAP_CANONICAL_DOMAIN = 0.75;
const CAP_CATEGORY = 0.65;
const CAP_PATTERN = 0.95;

function asPenaltyRecord(j: unknown): Record<string, number> {
  if (!j || typeof j !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k.toLowerCase().trim()] = v;
  }
  return out;
}

export function parseRankingPenalties(row: {
  domainPenalties: unknown;
  senderPenalties: unknown;
  canonicalDomainPenalties?: unknown;
  categoryPenalties?: unknown;
  patternPenalties?: unknown;
}): RankingPenalties {
  return {
    byDomain: asPenaltyRecord(row.domainPenalties),
    bySender: asPenaltyRecord(row.senderPenalties),
    byCanonicalDomain: asPenaltyRecord(row.canonicalDomainPenalties ?? {}),
    byCategory: asPenaltyRecord(row.categoryPenalties ?? {}),
    byPattern: asPenaltyRecord(row.patternPenalties ?? {}),
  };
}

function bump(record: Record<string, number>, key: string | null, step: number, cap: number) {
  if (!key) return;
  record[key] = Math.min(cap, (record[key] ?? 0) + step);
}

function hasStrongPenalty(penalties: RankingPenalties): boolean {
  return [
    penalties.byCanonicalDomain,
    penalties.byCategory,
    penalties.byPattern,
  ].some((record) => Object.values(record).some((v) => v > 0));
}

function applyNotImportantPenalty(
  penalties: RankingPenalties,
  input: RankingSignalInput
): RankingPenalties {
  const keys = rankingSignalKeys(input);
  bump(penalties.bySender, keys.sender, STEP_SENDER, CAP_SENDER);
  bump(penalties.byDomain, keys.domain, STEP_DOMAIN, CAP_DOMAIN);
  if (allowsCanonicalDomainLearning(keys.canonicalDomain)) {
    bump(penalties.byCanonicalDomain, keys.canonicalDomain, STEP_CANONICAL_DOMAIN, CAP_CANONICAL_DOMAIN);
  }

  if (keys.isLowSignalNotification) {
    bump(penalties.byCategory, keys.category, STEP_CATEGORY, CAP_CATEGORY);
    bump(penalties.byPattern, keys.pattern, STEP_PATTERN, CAP_PATTERN);
  }

  return penalties;
}

async function backfillRankingPenaltiesFromFeedback(
  userId: string,
  existing: RankingPenalties
): Promise<RankingPenalties> {
  if (hasStrongPenalty(existing)) return existing;

  const feedbackEvents = await prisma.emailEvent.findMany({
    where: {
      briefNotImportantAt: { not: null },
      googleAccount: { userId },
    },
    select: {
      from_: true,
      senderDomain: true,
      subject: true,
      snippet: true,
      labels: true,
      category: { select: { name: true } },
    },
    orderBy: { briefNotImportantAt: "desc" },
    take: 500,
  });
  if (feedbackEvents.length === 0) return existing;

  const rebuilt: RankingPenalties = {
    bySender: {},
    byDomain: {},
    byCanonicalDomain: {},
    byCategory: {},
    byPattern: {},
  };

  for (const event of feedbackEvents) {
    applyNotImportantPenalty(rebuilt, {
      fromEmail: event.from_,
      senderDomain: event.senderDomain,
      categoryName: event.category?.name ?? null,
      labels: event.labels,
      subject: event.subject,
      snippet: event.snippet,
    });
  }

  const next: RankingPenalties = {
    bySender: { ...existing.bySender },
    byDomain: { ...existing.byDomain },
    byCanonicalDomain: { ...existing.byCanonicalDomain },
    byCategory: { ...existing.byCategory },
    byPattern: { ...existing.byPattern },
  };
  for (const [key, value] of Object.entries(rebuilt.bySender)) {
    next.bySender[key] = Math.max(next.bySender[key] ?? 0, value);
  }
  for (const [key, value] of Object.entries(rebuilt.byDomain)) {
    next.byDomain[key] = Math.max(next.byDomain[key] ?? 0, value);
  }
  for (const [key, value] of Object.entries(rebuilt.byCanonicalDomain)) {
    next.byCanonicalDomain[key] = Math.max(next.byCanonicalDomain[key] ?? 0, value);
  }
  for (const [key, value] of Object.entries(rebuilt.byCategory)) {
    next.byCategory[key] = Math.max(next.byCategory[key] ?? 0, value);
  }
  for (const [key, value] of Object.entries(rebuilt.byPattern)) {
    next.byPattern[key] = Math.max(next.byPattern[key] ?? 0, value);
  }

  await prisma.userRankingProfile.upsert({
    where: { userId },
    create: {
      userId,
      senderPenalties: next.bySender,
      domainPenalties: next.byDomain,
      canonicalDomainPenalties: next.byCanonicalDomain,
      categoryPenalties: next.byCategory,
      patternPenalties: next.byPattern,
    },
    update: {
      senderPenalties: next.bySender,
      domainPenalties: next.byDomain,
      canonicalDomainPenalties: next.byCanonicalDomain,
      categoryPenalties: next.byCategory,
      patternPenalties: next.byPattern,
    },
  });

  return next;
}

export async function loadRankingPenalties(userId: string): Promise<RankingPenalties> {
  const row = await prisma.userRankingProfile.findUnique({
    where: { userId },
    select: {
      domainPenalties: true,
      senderPenalties: true,
      canonicalDomainPenalties: true,
      categoryPenalties: true,
      patternPenalties: true,
    },
  });
  const parsed = row
    ? parseRankingPenalties(row)
    : {
        byDomain: {},
        bySender: {},
        byCanonicalDomain: {},
        byCategory: {},
        byPattern: {},
      };
  return backfillRankingPenaltiesFromFeedback(userId, parsed);
}

/** Called when the user marks an email not important on the Brief (and similar actions). */
export async function recordNotImportantFeedback(args: {
  userId: string;
  fromEmail: string | null;
  senderDomain: string | null;
  categoryName?: string | null;
  labels?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
}): Promise<void> {
  const keys = rankingSignalKeys(args satisfies RankingSignalInput);
  if (!keys.sender && !keys.domain && !keys.category && !keys.pattern) return;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userRankingProfile.findUnique({ where: { userId: args.userId } });
    const next = applyNotImportantPenalty(parseRankingPenalties({
      senderPenalties: existing?.senderPenalties ?? {},
      domainPenalties: existing?.domainPenalties ?? {},
      canonicalDomainPenalties: existing?.canonicalDomainPenalties ?? {},
      categoryPenalties: existing?.categoryPenalties ?? {},
      patternPenalties: existing?.patternPenalties ?? {},
    }), args);

    await tx.userRankingProfile.upsert({
      where: { userId: args.userId },
      create: {
        userId: args.userId,
        senderPenalties: next.bySender,
        domainPenalties: next.byDomain,
        canonicalDomainPenalties: next.byCanonicalDomain,
        categoryPenalties: next.byCategory,
        patternPenalties: next.byPattern,
      },
      update: {
        senderPenalties: next.bySender,
        domainPenalties: next.byDomain,
        canonicalDomainPenalties: next.byCanonicalDomain,
        categoryPenalties: next.byCategory,
        patternPenalties: next.byPattern,
      },
    });
  });
}
