import { prisma } from "@/lib/prisma";

export function threadAttentionKey(googleAccountId: string, threadId: string): string {
  return `${googleAccountId}:${threadId}`;
}

export type ThreadAttentionAction =
  | "not_important"
  | "important"
  | "dismiss"
  | "handled"
  | "snooze_later_today"
  | "snooze_tomorrow"
  | "snooze_next_week"
  | "waiting_on"
  | "clear_waiting"
  | "never_similar"
  | "clear_snooze";

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}

function startOfNextDayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(9, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function addDaysAt9Utc(now: Date, days: number): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

export type ThreadAttentionRow = {
  importance: string;
  snoozeUntil: Date | null;
  waitingOn: boolean;
  neverSimilar: boolean;
  closedAt: Date | null;
};

export async function loadThreadAttentionMap(args: {
  userId: string;
  googleAccountIds: string[];
}): Promise<Map<string, ThreadAttentionRow>> {
  if (args.googleAccountIds.length === 0) return new Map();
  const rows = await prisma.threadAttention.findMany({
    where: { userId: args.userId, googleAccountId: { in: args.googleAccountIds } },
    select: {
      googleAccountId: true,
      threadId: true,
      importance: true,
      snoozeUntil: true,
      waitingOn: true,
      neverSimilar: true,
      closedAt: true,
    },
  });
  const m = new Map<string, ThreadAttentionRow>();
  for (const r of rows) {
    m.set(threadAttentionKey(r.googleAccountId, r.threadId), {
      importance: r.importance,
      snoozeUntil: r.snoozeUntil,
      waitingOn: r.waitingOn,
      neverSimilar: r.neverSimilar,
      closedAt: r.closedAt,
    });
  }
  return m;
}

export function threadAttentionSuppressesOpenLoop(
  row: ThreadAttentionRow | undefined,
  now: Date
): boolean {
  if (!row) return false;
  if (row.closedAt) return true;
  if (row.importance === "not_important") return true;
  if (row.neverSimilar) return true;
  if (row.snoozeUntil && row.snoozeUntil.getTime() > now.getTime()) return true;
  return false;
}

export async function applyThreadAttention(args: {
  userId: string;
  googleAccountId: string;
  threadId: string;
  action: ThreadAttentionAction;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  const { userId, googleAccountId, threadId } = args;

  const acc = await prisma.googleAccount.findFirst({
    where: { id: googleAccountId, userId },
    select: { id: true },
  });
  if (!acc) throw new Error("Account not found");

  type Create = Parameters<typeof prisma.threadAttention.create>[0]["data"];

  let create: Create;
  let update: Partial<Create>;

  switch (args.action) {
    case "not_important":
      create = {
        userId,
        googleAccountId,
        threadId,
        importance: "not_important",
        closedAt: null,
        snoozeUntil: null,
        waitingOn: false,
      };
      update = {
        importance: "not_important",
        closedAt: null,
        snoozeUntil: null,
        waitingOn: false,
      };
      break;
    case "important":
      create = {
        userId,
        googleAccountId,
        threadId,
        importance: "important",
        closedAt: null,
      };
      update = { importance: "important", closedAt: null };
      break;
    case "dismiss":
    case "handled":
      create = {
        userId,
        googleAccountId,
        threadId,
        closedAt: now,
        snoozeUntil: null,
        importance: "neutral",
        waitingOn: false,
      };
      update = {
        closedAt: now,
        snoozeUntil: null,
        importance: "neutral",
        waitingOn: false,
      };
      break;
    case "snooze_later_today":
      create = {
        userId,
        googleAccountId,
        threadId,
        snoozeUntil: addHours(now, 6),
        closedAt: null,
      };
      update = { snoozeUntil: addHours(now, 6), closedAt: null };
      break;
    case "snooze_tomorrow":
      create = {
        userId,
        googleAccountId,
        threadId,
        snoozeUntil: startOfNextDayUtc(now),
        closedAt: null,
      };
      update = { snoozeUntil: startOfNextDayUtc(now), closedAt: null };
      break;
    case "snooze_next_week":
      create = {
        userId,
        googleAccountId,
        threadId,
        snoozeUntil: addDaysAt9Utc(now, 7),
        closedAt: null,
      };
      update = { snoozeUntil: addDaysAt9Utc(now, 7), closedAt: null };
      break;
    case "waiting_on":
      create = {
        userId,
        googleAccountId,
        threadId,
        waitingOn: true,
        closedAt: null,
      };
      update = { waitingOn: true, closedAt: null };
      break;
    case "clear_waiting":
      create = {
        userId,
        googleAccountId,
        threadId,
        waitingOn: false,
      };
      update = { waitingOn: false };
      break;
    case "never_similar":
      create = {
        userId,
        googleAccountId,
        threadId,
        neverSimilar: true,
        importance: "not_important",
        closedAt: null,
      };
      update = { neverSimilar: true, importance: "not_important", closedAt: null };
      break;
    case "clear_snooze":
      create = {
        userId,
        googleAccountId,
        threadId,
        snoozeUntil: null,
      };
      update = { snoozeUntil: null };
      break;
    default:
      throw new Error("Unknown action");
  }

  await prisma.threadAttention.upsert({
    where: {
      userId_googleAccountId_threadId: { userId, googleAccountId, threadId },
    },
    create,
    update,
  });
}
