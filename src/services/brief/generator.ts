/**
 * Morning Brief generator v2: 2–3 min scan.
 * - Top priorities: exclude newsletters/promotions
 * - Digest: newsletters + promotions
 * - Calendar watchouts: back-to-back, early, overloaded
 */

import { prisma } from "@/lib/prisma";

const DIGEST_CATEGORIES = ["Newsletters", "Promotions"];
const GMAIL_DIGEST_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];
const MAX_PRIORITIES = 5;
const MAX_DIGEST = 6;
const MAX_OPEN_LOOPS = 5;

function isDigestEmail(e: {
  category?: { name: string } | null;
  labels: string[];
}): boolean {
  const cat = e.category?.name ?? "";
  if (DIGEST_CATEGORIES.some((c) => c === cat)) return true;
  return GMAIL_DIGEST_LABELS.some((l) => e.labels.includes(l));
}

export interface BriefData {
  summary: {
    prioritiesCount: number;
    openLoopsCount: number;
    nextMeeting: { title: string | null; startAt: Date } | null;
    overloadedDaysCount: number;
    declutterCount: number;
    recentAutoArchived: number;
  };
  goals: { id: string; title: string; description: string | null }[];
  categories: { id: string; name: string }[];
  priorities: {
    id: string;
    subject: string | null;
    from: string;
    snippet: string | null;
    date: Date;
    categoryName: string | null;
    categoryId: string | null;
    importanceScore: number | null;
    confidence: number | null;
    explainJson: {
      source?: string;
      categoryName?: string;
      reason?: string;
      confidence?: number;
    } | null;
  }[];
  digestBySender: {
    sender: string;
    emails: {
      id: string;
      subject: string | null;
      from: string;
      snippet: string | null;
      date: Date;
      categoryName: string | null;
      categoryId: string | null;
      confidence: number | null;
      explainJson: {
        source?: string;
        categoryName?: string;
        reason?: string;
        confidence?: number;
      } | null;
    }[];
  }[];
  openLoops: {
    threadId: string;
    subject: string | null;
    lastFrom: string;
    lastDate: Date;
    emailIds: string[];
  }[];
  calendarWatchouts: {
    id: string;
    title: string | null;
    startAt: Date;
    endAt: Date;
    organizer: string | null;
    flags: string[];
    explainJson: { reason?: string; confidence?: number } | null;
  }[];
  declutterSuggestions: {
    id: string;
    messageId: string;
    googleAccountId: string;
    subject: string | null;
    from: string;
    categoryName: string | null;
    categoryId: string | null;
    explainJson: { source?: string; categoryName?: string; reason?: string } | null;
  }[];
}

export async function generateBrief(userId: string): Promise<BriefData> {
  const accountIds = (
    await prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true },
    })
  ).map((a) => a.id);

  const [goals, categories, unreadEmails, upcomingEvents, lowPriorityEmails, recentAutoArchived] =
    await Promise.all([
      prisma.goal.findMany({
        where: { userId },
        select: { id: true, title: true, description: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.emailEvent.findMany({
        where: {
          googleAccountId: { in: accountIds },
          unread: true,
        },
        include: { category: true },
        orderBy: { date: "desc" },
        take: 15,
      }),
      prisma.calendarEvent.findMany({
        where: {
          googleAccountId: { in: accountIds },
          startAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { startAt: "asc" },
        take: 50,
      }),
      prisma.emailEvent.findMany({
        where: {
          googleAccountId: { in: accountIds },
          classificationCategoryId: { not: null },
          importanceScore: { lt: 0.5 },
          unread: true,
        },
        include: { category: true },
        orderBy: { date: "desc" },
        take: 5,
      }),
      prisma.auditLog.count({
        where: {
          userId,
          actionType: "ARCHIVE",
          reason: "auto-archive-48h",
          timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          rollbackStatus: "applied",
        },
      }),
    ]);

  const digestEmails = unreadEmails.filter((e) => isDigestEmail(e));
  const nonDigest = unreadEmails.filter((e) => !isDigestEmail(e));
  const highPriority = nonDigest.filter(
    (e) => (e.importanceScore ?? 0) >= 0.6 || e.needsAction === true
  );
  const priorities =
    highPriority.length > 0
      ? highPriority.slice(0, MAX_PRIORITIES)
      : nonDigest.slice(0, MAX_PRIORITIES);
  const digestSlice = digestEmails.slice(0, MAX_DIGEST * 3);
  const usedIds = new Set(priorities.map((p) => p.id));
  const candidateOpenLoops = nonDigest.filter((e) => !usedIds.has(e.id));
  const byThread = new Map<
    string,
    { subject: string | null; lastFrom: string; lastDate: Date; emailIds: string[] }
  >();
  for (const e of candidateOpenLoops) {
    const existing = byThread.get(e.threadId);
    if (!existing || e.date > existing.lastDate) {
      byThread.set(e.threadId, {
        subject: e.subject,
        lastFrom: e.from_,
        lastDate: e.date,
        emailIds: existing ? [...existing.emailIds, e.id] : [e.id],
      });
    } else {
      existing.emailIds.push(e.id);
    }
  }
  const openLoops = Array.from(byThread.entries())
    .sort(([, a], [, b]) => b.lastDate.getTime() - a.lastDate.getTime())
    .slice(0, MAX_OPEN_LOOPS)
    .map(([threadId, v]) => ({
      threadId,
      subject: v.subject,
      lastFrom: v.lastFrom,
      lastDate: v.lastDate,
      emailIds: v.emailIds,
    }));

  const digestBySender: BriefData["digestBySender"] = [];
  const senderMap = new Map<string, typeof digestSlice>();
  for (const e of digestSlice) {
    const key = e.from_.toLowerCase().trim();
    if (!senderMap.has(key)) senderMap.set(key, []);
    senderMap.get(key)!.push(e);
  }
  for (const [sender, emails] of senderMap) {
    const fromVal = emails[0]?.from_ ?? sender;
    digestBySender.push({
      sender: fromVal,
      emails: emails.slice(0, 6).map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from_,
        snippet: e.snippet,
        date: e.date,
        categoryName: e.category?.name ?? null,
        categoryId: e.classificationCategoryId,
        confidence: e.confidence ?? null,
        explainJson: e.explainJson as {
          source?: string;
          categoryName?: string;
          reason?: string;
          confidence?: number;
        } | null,
      })),
    });
  }

  const eventsByDay = new Map<string, typeof upcomingEvents>();
  for (const e of upcomingEvents) {
    const key = e.startAt.toISOString().slice(0, 10);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(e);
  }
  const overloadedDays = new Set<string>();
  for (const [day, evs] of eventsByDay) {
    if (evs.length >= 5) overloadedDays.add(day);
  }

  const calendarWatchouts = upcomingEvents.map((e) => {
    const flags: string[] = [];
    const dayKey = e.startAt.toISOString().slice(0, 10);
    if (overloadedDays.has(dayKey)) flags.push("overloaded");
    const hour = e.startAt.getHours();
    if (hour < 8) flags.push("early");
    const backToBack = upcomingEvents.find(
      (o) =>
        o.id !== e.id &&
        o.startAt >= e.endAt &&
        o.startAt.getTime() - e.endAt.getTime() < 15 * 60 * 1000
    );
    if (backToBack) flags.push("back-to-back");
    const explain = e.explainJson as
      | { source?: string; watchouts?: string[]; reason?: string; confidence?: number }
      | null;
    if (explain?.watchouts?.length) {
      flags.push(...explain.watchouts);
    }
    return {
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      organizer: e.organizer,
      flags,
      explainJson: explain,
    };
  });

  const nextMeeting =
    upcomingEvents.length > 0
      ? {
          title: upcomingEvents[0].title,
          startAt: upcomingEvents[0].startAt,
        }
      : null;

  return {
    summary: {
      prioritiesCount: priorities.length,
      openLoopsCount: openLoops.length,
      nextMeeting,
      overloadedDaysCount: overloadedDays.size,
      declutterCount: lowPriorityEmails.length,
      recentAutoArchived,
    },
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
    })),
    categories,
    priorities: priorities.map((e) => ({
      id: e.id,
      subject: e.subject,
      from: e.from_,
      snippet: e.snippet,
      date: e.date,
      categoryName: e.category?.name ?? null,
      categoryId: e.classificationCategoryId,
      importanceScore: e.importanceScore,
      confidence: e.confidence ?? null,
      explainJson: e.explainJson as {
        source?: string;
        categoryName?: string;
        reason?: string;
        confidence?: number;
      } | null,
    })),
    digestBySender,
    openLoops,
    calendarWatchouts,
    declutterSuggestions: lowPriorityEmails.map((e) => ({
      id: e.id,
      messageId: e.messageId,
      googleAccountId: e.googleAccountId,
      subject: e.subject,
      from: e.from_,
      categoryName: e.category?.name ?? null,
      categoryId: e.classificationCategoryId,
      explainJson: e.explainJson as { source?: string; categoryName?: string; reason?: string } | null,
    })),
  };
}
