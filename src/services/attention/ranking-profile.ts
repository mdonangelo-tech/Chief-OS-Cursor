import { prisma } from "@/lib/prisma";

const STEP_SENDER = 0.12;
const STEP_DOMAIN = 0.08;
const CAP_SENDER = 0.85;
const CAP_DOMAIN = 0.55;

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
}): { byDomain: Record<string, number>; bySender: Record<string, number> } {
  return {
    byDomain: asPenaltyRecord(row.domainPenalties),
    bySender: asPenaltyRecord(row.senderPenalties),
  };
}

export async function loadRankingPenalties(userId: string): Promise<{
  byDomain: Record<string, number>;
  bySender: Record<string, number>;
}> {
  const row = await prisma.userRankingProfile.findUnique({
    where: { userId },
    select: { domainPenalties: true, senderPenalties: true },
  });
  if (!row) return { byDomain: {}, bySender: {} };
  return parseRankingPenalties(row);
}

/** Called when the user marks an email not important on the Brief (and similar actions). */
export async function recordNotImportantFeedback(args: {
  userId: string;
  fromEmail: string | null;
  senderDomain: string | null;
}): Promise<void> {
  const emailKey = args.fromEmail?.toLowerCase().trim() || null;
  const domainKey = args.senderDomain?.toLowerCase().trim() || null;
  if (!emailKey && !domainKey) return;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userRankingProfile.findUnique({ where: { userId: args.userId } });
    const senders = asPenaltyRecord(existing?.senderPenalties ?? {});
    const domains = asPenaltyRecord(existing?.domainPenalties ?? {});
    if (emailKey) {
      senders[emailKey] = Math.min(CAP_SENDER, (senders[emailKey] ?? 0) + STEP_SENDER);
    }
    if (domainKey) {
      domains[domainKey] = Math.min(CAP_DOMAIN, (domains[domainKey] ?? 0) + STEP_DOMAIN);
    }
    await tx.userRankingProfile.upsert({
      where: { userId: args.userId },
      create: {
        userId: args.userId,
        senderPenalties: senders,
        domainPenalties: domains,
      },
      update: {
        senderPenalties: senders,
        domainPenalties: domains,
      },
    });
  });
}
