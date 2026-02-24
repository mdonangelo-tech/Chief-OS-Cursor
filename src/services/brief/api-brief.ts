/**
 * Brief API: assembles structured payload for GET /api/brief.
 * Single source of truth - frontend must not query raw tables.
 */

import { prisma } from "@/lib/prisma";
import { getInboxStats } from "@/services/gmail/labels";

const EXCLUDE_PRIORITY_CATEGORIES = ["Newsletters", "Promotions", "Low-priority"];
const BOOST_CATEGORIES = ["Work", "Portfolio", "Job Search", "Kids logistics"];
const MAX_PRIORITIES = 5;
const MAX_OPEN_LOOPS = 8;
const OWE_REPLY_DAYS = 3;
const WAITING_REPLY_DAYS = 2;
const HOURS_48 = 48 * 60 * 60 * 1000;

function isDigestCategory(name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return ["newsletters", "promotions", "low-priority"].includes(n);
}

function extractEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  if (from.includes("@")) return from.trim().toLowerCase();
  return null;
}

function daysAgo(d: Date): number {
  return (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000);
}

export interface BriefPayload {
  summary: {
    prioritiesCount: number;
    openLoopsCount: number;
    nextMeeting: { title: string | null; startAt: string; inMinutes: number } | null;
    calendarWatchouts: {
      overloadedDays: number;
      earlyStarts: number;
      backToBackChains: number;
    };
    archivedLast24h: number;
  };
  syncStatus: {
    gmailSyncAt: string | null;
    calendarSyncAt: string | null;
    accountsCount: number;
    hasSyncErrors: boolean;
  };
  inboxByAccount: Array<{
    accountId: string;
    email: string;
    accountLabel: string | null;
    messagesTotal: number;
    messagesUnread: number;
  }>;
  llmStatus: { enabled: boolean; provider: string; model: string };
  topPriorities: Array<{
    id: string;
    messageId: string;
    threadId: string;
    googleAccountId: string;
    accountLabel: string;
    subject: string | null;
    from: string;
    snippet: string | null;
    date: string;
    categoryName: string | null;
    confidence: number | null;
    actionType: string | null;
    explainJson: Record<string, unknown> | null;
  }>;
  openLoops: Array<{
    threadId: string;
    subject: string | null;
    badge: "owe_reply" | "waiting_on";
    lastActivityDaysAgo: number;
    lastFrom: string;
    googleAccountId: string;
    accountLabel: string;
  }>;
  calendarWatchouts: {
    summary: {
      overloadedDays: Array<{ date: string; count: number }>;
      earlyStarts: Array<{ date: string; time: string }>;
      backToBackChains: Array<{ date: string; count: number }>;
    };
    byDay: Record<string, Array<{
      id: string;
      title: string | null;
      startAt: string;
      flags: string[];
    }>>;
  };
  digest: {
    summary: Record<string, { newCount: number; olderThan48hCount: number }>;
    groups: Array<{
      sender: string;
      categoryName: string | null;
      items: Array<{
        id: string;
        messageId: string;
        googleAccountId: string;
        subject: string | null;
        date: string;
      }>;
    }>;
  };
}

export async function getBriefPayload(userId: string): Promise<BriefPayload> {
  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: {
      id: true,
      email: true,
      userDefinedLabel: true,
      syncStateJson: true,
    },
  });
  const accountIds = accounts.map((a) => a.id);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const [
    unreadEmails,
    upcomingEvents,
    auditCount,
    categories,
  ] = await Promise.all([
    prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        unread: true,
        // Brief is an inbox scan; exclude mail that's no longer in INBOX.
        labels: { has: "INBOX" },
      },
      include: { category: true, googleAccount: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.calendarEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        startAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { startAt: "asc" },
      take: 80,
    }),
    prisma.auditLog.count({
      where: {
        userId,
        actionType: "ARCHIVE",
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        rollbackStatus: "applied",
      },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  const catNames = new Set(categories.map((c) => c.name));
  const digestEmails = unreadEmails.filter((e) => isDigestCategory(e.category?.name ?? null));
  const nonDigest = unreadEmails.filter((e) => !isDigestCategory(e.category?.name ?? null));

  const priorityCandidates = nonDigest.filter((e) => {
    const cat = e.category?.name ?? "";
    const imp = e.importanceScore ?? 0;
    const needs = e.needsAction ?? false;
    const unread = e.unread;
    if (!unread && !needs && imp < 0.8) return false;
    const boost = BOOST_CATEGORIES.some((b) => cat.toLowerCase().includes(b.toLowerCase())) ? 0.15 : 0;
    const base = imp >= 0.8 || needs ? 1 : unread ? 0.7 : 0;
    return base + boost >= 0.6;
  });
  const priorities = priorityCandidates
    .sort((a, b) => ((b.importanceScore ?? 0) - (a.importanceScore ?? 0)))
    .slice(0, MAX_PRIORITIES);

  const byThread = new Map<string, typeof nonDigest>();
  for (const e of nonDigest) {
    if (!byThread.has(e.threadId)) byThread.set(e.threadId, []);
    byThread.get(e.threadId)!.push(e);
  }
  const openLoopCandidates: Array<{
    threadId: string;
    lastDate: Date;
    lastFrom: string;
    subject: string | null;
    isFromUser: boolean;
    googleAccountId: string;
    accountLabel: string;
  }> = [];
  const usedThreads = new Set(priorities.map((p) => p.threadId));
  const cutoffOwe = new Date(Date.now() - OWE_REPLY_DAYS * 24 * 60 * 60 * 1000);
  const cutoffWait = new Date(Date.now() - WAITING_REPLY_DAYS * 24 * 60 * 60 * 1000);

  for (const [threadId, emails] of byThread) {
    if (usedThreads.has(threadId)) continue;
    const sorted = [...emails].sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = sorted[0];
    const acc = accountById.get(latest.googleAccountId)!;
    const fromEmail = extractEmail(latest.from_);
    const isFromUser = acc && fromEmail && acc.email.toLowerCase() === fromEmail;
    const days = daysAgo(latest.date);
    if (isFromUser && latest.date < cutoffOwe && days >= OWE_REPLY_DAYS) {
      openLoopCandidates.push({
        threadId,
        lastDate: latest.date,
        lastFrom: latest.from_,
        subject: latest.subject,
        isFromUser: true,
        googleAccountId: latest.googleAccountId,
        accountLabel: acc.userDefinedLabel || "Personal",
      });
    } else if (!isFromUser && latest.date < cutoffWait && days >= WAITING_REPLY_DAYS) {
      openLoopCandidates.push({
        threadId,
        lastDate: latest.date,
        lastFrom: latest.from_,
        subject: latest.subject,
        isFromUser: false,
        googleAccountId: latest.googleAccountId,
        accountLabel: acc.userDefinedLabel || "Personal",
      });
    }
  }
  const openLoops = openLoopCandidates.sort(
    (a, b) => a.lastDate.getTime() - b.lastDate.getTime()
  );

  const eventsByDay = new Map<string, typeof upcomingEvents>();
  for (const e of upcomingEvents) {
    const k = e.startAt.toISOString().slice(0, 10);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }
  const overloaded: Array<{ date: string; count: number }> = [];
  const earlyStarts: Array<{ date: string; time: string }> = [];
  const backToBackChains: Array<{ date: string; count: number }> = [];

  for (const [day, evs] of eventsByDay) {
    if (evs.length >= 5) overloaded.push({ date: day, count: evs.length });
    for (const e of evs) {
      if (e.startAt.getHours() < 8) {
        earlyStarts.push({
          date: day,
          time: e.startAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        });
      }
    }
  }
  const backToBackByDay = new Map<string, number>();
  for (const e of upcomingEvents) {
    const after = upcomingEvents.find(
      (o) => o.id !== e.id && o.startAt >= e.endAt && o.startAt.getTime() - e.endAt.getTime() < 15 * 60 * 1000
    );
    if (after) {
      const k = e.startAt.toISOString().slice(0, 10);
      backToBackByDay.set(k, (backToBackByDay.get(k) ?? 0) + 1);
    }
  }
  for (const [date, count] of backToBackByDay) {
    backToBackChains.push({ date, count });
  }

  const digestByCategory: Record<string, { newCount: number; olderThan48hCount: number }> = {};
  const now = Date.now();
  for (const e of digestEmails) {
    const cat = e.category?.name ?? "Other";
    if (!digestByCategory[cat]) digestByCategory[cat] = { newCount: 0, olderThan48hCount: 0 };
    digestByCategory[cat].newCount++;
    if (now - e.date.getTime() > HOURS_48) digestByCategory[cat].olderThan48hCount++;
  }

  const senderGroups = new Map<string, typeof digestEmails>();
  for (const e of digestEmails.slice(0, 50)) {
    const key = e.from_.toLowerCase();
    if (!senderGroups.has(key)) senderGroups.set(key, []);
    senderGroups.get(key)!.push(e);
  }
  const digestGroups = Array.from(senderGroups.entries()).map(([sender, emails]) => {
    const first = emails[0];
    return {
      sender: first!.from_,
      categoryName: first!.category?.name ?? null,
      items: emails.slice(0, 6).map((e) => ({
        id: e.id,
        messageId: e.messageId,
        googleAccountId: e.googleAccountId,
        subject: e.subject,
        date: e.date.toISOString(),
      })),
    };
  });

  const byDayFormatted: Record<string, Array<{ id: string; title: string | null; startAt: string; flags: string[] }>> = {};
  for (const e of upcomingEvents) {
    const k = e.startAt.toISOString().slice(0, 10);
    if (!byDayFormatted[k]) byDayFormatted[k] = [];
    const flags: string[] = [];
    if (eventsByDay.get(k)?.length && (eventsByDay.get(k)?.length ?? 0) >= 5) flags.push("overloaded");
    if (e.startAt.getHours() < 8) flags.push("early");
    const bb = upcomingEvents.find(
      (o) => o.id !== e.id && o.startAt >= e.endAt && o.startAt.getTime() - e.endAt.getTime() < 15 * 60 * 1000
    );
    if (bb) flags.push("back-to-back");
    byDayFormatted[k].push({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      flags,
    });
  }

  const nextEv = upcomingEvents[0];
  const { getLlmStatus } = await import("@/services/llm");
  const llmStatus = getLlmStatus();

  let gmailSyncAt: string | null = null;
  let calendarSyncAt: string | null = null;
  let hasSyncErrors = false;
  for (const a of accounts) {
    const state = a.syncStateJson as {
      lastSyncAt?: string;
      lastSyncResult?: { errors?: string[] };
      lastCalendarSyncAt?: string;
      lastCalendarSyncResult?: { errors?: string[] };
    } | null;
    if (state?.lastSyncAt && (!gmailSyncAt || state.lastSyncAt > gmailSyncAt)) {
      gmailSyncAt = state.lastSyncAt;
    }
    if (state?.lastCalendarSyncAt && (!calendarSyncAt || state.lastCalendarSyncAt > calendarSyncAt)) {
      calendarSyncAt = state.lastCalendarSyncAt;
    }
    if (state?.lastSyncResult?.errors?.length || state?.lastCalendarSyncResult?.errors?.length) {
      hasSyncErrors = true;
    }
  }

  const inboxResults = await Promise.allSettled(
    accounts.map(async (a) => {
      const stats = await getInboxStats(a.id, userId);
      return {
        accountId: a.id,
        email: a.email,
        accountLabel: a.userDefinedLabel,
        messagesTotal: stats.messagesTotal,
        messagesUnread: stats.messagesUnread,
      };
    })
  );
  const inboxByAccount = inboxResults
    .filter((r): r is PromiseFulfilledResult<{ accountId: string; email: string; accountLabel: string | null; messagesTotal: number; messagesUnread: number }> => r.status === "fulfilled")
    .map((r) => r.value);

  const fmt = (d: Date) => {
    const m = Math.round((d.getTime() - Date.now()) / 60000);
    if (m < 60) return `in ${m}m`;
    if (m < 1440) return `in ${Math.round(m / 60)}h`;
    return d.toLocaleDateString();
  };

  return {
    summary: {
      prioritiesCount: priorities.length,
      openLoopsCount: openLoops.length,
      nextMeeting: nextEv
        ? {
            title: nextEv.title,
            startAt: nextEv.startAt.toISOString(),
            inMinutes: Math.round((nextEv.startAt.getTime() - Date.now()) / 60000),
          }
        : null,
      calendarWatchouts: {
        overloadedDays: overloaded.length,
        earlyStarts: earlyStarts.length,
        backToBackChains: backToBackChains.length,
      },
      archivedLast24h: auditCount,
    },
    syncStatus: {
      gmailSyncAt,
      calendarSyncAt,
      accountsCount: accounts.length,
      hasSyncErrors,
    },
    inboxByAccount,
    llmStatus: {
      enabled: llmStatus.enabled,
      provider: llmStatus.provider,
      model: llmStatus.model,
    },
    topPriorities: priorities.map((e) => {
      const acc = accountById.get(e.googleAccountId)!;
      return {
        id: e.id,
        messageId: e.messageId,
        threadId: e.threadId,
        googleAccountId: e.googleAccountId,
        accountLabel: acc.userDefinedLabel || "Personal",
        subject: e.subject,
        from: e.from_,
        snippet: e.snippet,
        date: e.date.toISOString(),
        categoryName: e.category?.name ?? null,
        confidence: e.confidence ?? null,
        actionType: e.actionType ?? null,
        explainJson: (e.explainJson as Record<string, unknown>) ?? null,
      };
    }),
    openLoops: openLoops.map((o) => ({
      threadId: o.threadId,
      subject: o.subject,
      badge: o.isFromUser ? ("owe_reply" as const) : ("waiting_on" as const),
      lastActivityDaysAgo: Math.floor(daysAgo(o.lastDate)),
      lastFrom: o.lastFrom,
      googleAccountId: o.googleAccountId,
      accountLabel: o.accountLabel,
    })),
    calendarWatchouts: {
      summary: {
        overloadedDays: overloaded,
        earlyStarts: earlyStarts.slice(0, 5),
        backToBackChains: Array.from(backToBackByDay.entries()).map(([date, count]) => ({ date, count })),
      },
      byDay: byDayFormatted,
    },
    digest: {
      summary: digestByCategory,
      groups: digestGroups,
    },
  };
}
