/**
 * Brief API: assembles structured payload for GET /api/brief.
 * Single source of truth - frontend must not query raw tables.
 */

import { prisma } from "@/lib/prisma";
import { getInboxStats } from "@/services/gmail/labels";
import { inferAccountTypeFromEmail } from "@/lib/onboarding/infer";
import { getRuleSuggestionsForUser } from "@/services/declutter/suggestions";
import { formatLocalTime, localDayKey, localHour, safeTimeZone } from "@/lib/calendar-time";
import {
  buildPriorityExplanation as buildPriorityExplanationPure,
  computePriorityScore as computePriorityScorePure,
  isDigestCategoryName,
  isLowSignalPriorityCategoryName,
  type PriorityEmailInput,
} from "@/services/brief/intelligence";

const EXCLUDE_PRIORITY_CATEGORIES = ["Newsletters", "Promotions", "Low-priority"];
const BOOST_CATEGORIES = ["Work", "Portfolio", "Job Search", "Kids logistics"];
const MAX_PRIORITIES = 5;
const MAX_OPEN_LOOPS = 8;
const OWE_REPLY_DAYS = 3;
const WAITING_REPLY_DAYS = 2;
const HOURS_48 = 48 * 60 * 60 * 1000;

function isDigestCategory(name: string | null): boolean {
  return isDigestCategoryName(name);
}

function isLowSignalPriorityCategory(name: string | null): boolean {
  return isLowSignalPriorityCategoryName(name, EXCLUDE_PRIORITY_CATEGORIES);
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
    accountType: "work" | "personal" | "unknown";
    displayName: string | null;
    messagesTotal: number;
    messagesUnread: number;
    archivedLast24h: number;
  }>;
  categories: Array<{ id: string; name: string }>;
  llmStatus: { enabled: boolean; provider: string; model: string };
  suggestedActions: Array<{
    emailEventId: string;
    from: string;
    snippet: string | null;
    categoryId: string;
    categoryName: string;
    confidence: number | null;
    band: "high" | "mid";
    recommendedRuleType: "domain" | "sender";
    recommendedValue: string;
    email: string | null;
    domain: string | null;
    needsSender: boolean;
    needsDomain: boolean;
  }>;
  topPriorities: Array<{
    id: string;
    messageId: string;
    threadId: string;
    googleAccountId: string;
    accountLabel: string;
    accountType: "work" | "personal" | "unknown";
    subject: string | null;
    from: string;
    snippet: string | null;
    date: string;
    categoryId: string | null;
    categoryName: string | null;
    confidence: number | null;
    actionType: string | null;
    prioritySummary: string | null;
    prioritySignals: string[];
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
    accountType: "work" | "personal" | "unknown";
  }>;
  calendarWatchouts: {
    summary: {
      narrative?: string;
      overloadedDays: Array<{ date: string; count: number }>;
      earlyStarts: Array<{ date: string; time: string }>;
      backToBackChains: Array<{ date: string; count: number }>;
    };
    localTodayKey: string;
    timeZone: string;
    byDay: Record<string, Array<{
      id: string;
      title: string | null;
      startAt: string;
      accountType: "work" | "personal" | "unknown";
      accountLabel: string;
      flags: string[];
      insights?: {
        focusType?: string;
        reason?: string;
        watchouts?: string[];
        confidence?: number;
      };
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

  let preferences: Array<{
    googleAccountId: string;
    accountType: "work" | "personal" | "unknown";
    displayName: string | null;
  }> = [];
  try {
    preferences = await prisma.userAccountPreference.findMany({
      where: { userId, googleAccountId: { in: accountIds } },
      select: { googleAccountId: true, accountType: true, displayName: true },
    });
  } catch {
    preferences = [];
  }
  const prefByAccountId = new Map(preferences.map((p) => [p.googleAccountId, p] as const));
  const accountTypeById = new Map(
    accounts.map((a) => [
      a.id,
      prefByAccountId.get(a.id)?.accountType ?? inferAccountTypeFromEmail(a.email),
    ] as const)
  );
  const displayNameById = new Map(
    accounts.map((a) => [a.id, prefByAccountId.get(a.id)?.displayName ?? null] as const)
  );

  const [
    unreadEmails,
    upcomingEvents,
    auditCount,
    categories,
    suggestedActions,
    calendarPrefs,
    activeGoals,
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
    getRuleSuggestionsForUser({ userId, googleAccountIds: accountIds, limit: 4 }),
    prisma.userCalendarPreferences.findUnique({
      where: { userId },
      select: { timezone: true },
    }),
    prisma.goal.findMany({
      where: { userId },
      select: { title: true },
      orderBy: { createdAt: "asc" },
      take: 6,
    }),
  ]);
  const timeZone = safeTimeZone(calendarPrefs?.timezone ?? null);
  const localToday = localDayKey(new Date(), timeZone);

  const perAccountArchives = await prisma.auditLog.groupBy({
    by: ["googleAccountId"],
    where: {
      userId,
      actionType: "ARCHIVE",
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      rollbackStatus: "applied",
    },
    _count: { _all: true },
  });
  const archivedLast24hByAccountId = new Map(
    perAccountArchives.map((r) => [r.googleAccountId, r._count._all] as const)
  );

  const digestEmails = unreadEmails.filter((e) => isDigestCategory(e.category?.name ?? null));
  const nonDigest = unreadEmails.filter((e) => !isDigestCategory(e.category?.name ?? null));

  function toPriorityInput(e: (typeof nonDigest)[number]): PriorityEmailInput {
    const fromEmail = extractEmail(e.from_) ?? null;
    return {
      id: e.id,
      unread: e.unread,
      importanceScore: e.importanceScore ?? null,
      needsAction: e.needsAction ?? null,
      actionType: e.actionType ?? null,
      confidence: e.confidence ?? null,
      categoryName: e.category?.name ?? null,
      senderDomain: e.senderDomain ?? null,
      fromEmail,
      briefDismissedAt: e.briefDismissedAt ?? null,
      briefNotImportantAt: e.briefNotImportantAt ?? null,
      explainJson: (e.explainJson as Record<string, unknown>) ?? null,
    };
  }

  function priorityScore(e: (typeof nonDigest)[number]): number {
    return computePriorityScorePure(toPriorityInput(e), {
      excludePriorityCategories: EXCLUDE_PRIORITY_CATEGORIES,
      boostCategories: BOOST_CATEGORIES,
    });
  }

  function buildPriorityExplanation(e: (typeof nonDigest)[number]): {
    summary: string | null;
    signals: string[];
  } {
    return buildPriorityExplanationPure(toPriorityInput(e), {
      excludePriorityCategories: EXCLUDE_PRIORITY_CATEGORIES,
      boostCategories: BOOST_CATEGORIES,
    });
  }

  const priorityCandidates = nonDigest.filter((e) => {
    const imp = e.importanceScore ?? 0;
    const needs = e.needsAction ?? false;
    const unread = e.unread;
    const catName = e.category?.name ?? null;

    // Explicitly suppress obvious low-signal categories unless they truly need action.
    // Keep this conservative: allow through if needsAction or very-high importance.
    if (isLowSignalPriorityCategory(catName) && !needs && imp < 0.9) return false;

    if (!unread && !needs && imp < 0.8) return false;
    return priorityScore(e) >= 0.6;
  });

  const priorities = priorityCandidates
    .sort((a, b) => {
      const d = priorityScore(b) - priorityScore(a);
      if (d !== 0) return d;
      const imp = (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
      if (imp !== 0) return imp;
      return b.date.getTime() - a.date.getTime();
    })
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
    const accountType =
      accountTypeById.get(latest.googleAccountId) ?? inferAccountTypeFromEmail(acc.email);
    const accountLabel = acc.userDefinedLabel || (accountType === "work" ? "Work" : "Personal");
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
        accountLabel,
      });
    } else if (!isFromUser && latest.date < cutoffWait && days >= WAITING_REPLY_DAYS) {
      openLoopCandidates.push({
        threadId,
        lastDate: latest.date,
        lastFrom: latest.from_,
        subject: latest.subject,
        isFromUser: false,
        googleAccountId: latest.googleAccountId,
        accountLabel,
      });
    }
  }
  const openLoops = openLoopCandidates
    .sort(
    (a, b) => a.lastDate.getTime() - b.lastDate.getTime()
    )
    .slice(0, MAX_OPEN_LOOPS);

  const visibleUpcomingEvents = upcomingEvents.filter((e) => {
    const ex = (e.explainJson as Record<string, unknown> | null) ?? null;
    return !ex?.briefHiddenAt;
  });

  const eventsByDay = new Map<string, typeof visibleUpcomingEvents>();
  for (const e of visibleUpcomingEvents) {
    const k = localDayKey(e.startAt, timeZone);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }
  const overloaded: Array<{ date: string; count: number }> = [];
  const earlyStarts: Array<{ date: string; time: string }> = [];
  const backToBackChains: Array<{ date: string; count: number }> = [];

  for (const [day, evs] of eventsByDay) {
    if (evs.length >= 5) overloaded.push({ date: day, count: evs.length });
    for (const e of evs) {
      if (localHour(e.startAt, timeZone) < 8) {
        earlyStarts.push({
          date: day,
          time: formatLocalTime(e.startAt, timeZone),
        });
      }
    }
  }
  const backToBackByDay = new Map<string, number>();
  for (const e of visibleUpcomingEvents) {
    const after = visibleUpcomingEvents.find(
      (o) => o.id !== e.id && o.startAt >= e.endAt && o.startAt.getTime() - e.endAt.getTime() < 15 * 60 * 1000
    );
    if (after) {
      const k = localDayKey(e.startAt, timeZone);
      backToBackByDay.set(k, (backToBackByDay.get(k) ?? 0) + 1);
    }
  }
  for (const [date, count] of backToBackByDay) {
    backToBackChains.push({ date, count });
  }

  const meetingEvents = visibleUpcomingEvents.filter((e) => (e.attendees?.length ?? 0) >= 2);
  const familyKeyword = /\b(school|pickup|drop[- ]?off|soccer|practice|kids?|camp|birthday|pediatric|dentist|daycare)\b/i;
  const familyEvents = visibleUpcomingEvents.filter((e) => familyKeyword.test(e.title ?? ""));
  const meetingHours = meetingEvents.reduce((s, e) => {
    const mins =
      typeof e.durationMinutes === "number" && Number.isFinite(e.durationMinutes)
        ? e.durationMinutes
        : Math.max(0, Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60000));
    return s + mins / 60;
  }, 0);

  let calendarNarrative: string | undefined;
  // Keep calendar guidance action-oriented; metrics remain supporting evidence below.
  const visibleGoal = activeGoals.find((g) => g.title?.trim());
  if (visibleGoal && meetingHours >= 6) {
    calendarNarrative = `Protect time for ${visibleGoal.title}; meetings may crowd it out this week.`;
  } else if (backToBackChains.length > 0 && meetingEvents.length >= 4) {
    calendarNarrative = "A few meetings are tightly stacked; choose one prep block before they start.";
  } else if (overloaded.length > 0) {
    calendarNarrative = "Pick the meetings that need preparation and protect one recovery block.";
  } else if (familyEvents.length >= 2 && meetingHours >= 2) {
    calendarNarrative = "Work and family logistics overlap this week; keep buffers visible.";
  } else if (meetingHours === 0 && visibleGoal) {
    calendarNarrative = `No meetings are blocking your week; reserve time for ${visibleGoal.title}.`;
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
  const digestGroups = Array.from(senderGroups.entries()).map(([_sender, emails]) => {
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

  const byDayFormatted: Record<
    string,
    Array<{
      id: string;
      title: string | null;
      startAt: string;
      accountType: "work" | "personal" | "unknown";
      accountLabel: string;
      flags: string[];
      insights?: {
        focusType?: string;
        reason?: string;
        watchouts?: string[];
        confidence?: number;
      };
    }>
  > = {};
  for (const e of visibleUpcomingEvents) {
    const k = localDayKey(e.startAt, timeZone);
    if (!byDayFormatted[k]) byDayFormatted[k] = [];
    const flags: string[] = [];
    if (eventsByDay.get(k)?.length && (eventsByDay.get(k)?.length ?? 0) >= 5) flags.push("overloaded");
    if (localHour(e.startAt, timeZone) < 8) flags.push("early");
    const bb = visibleUpcomingEvents.find(
      (o) => o.id !== e.id && o.startAt >= e.endAt && o.startAt.getTime() - e.endAt.getTime() < 15 * 60 * 1000
    );
    if (bb) flags.push("back-to-back");

    const acc = accountById.get(e.googleAccountId)!;
    const accountType = accountTypeById.get(e.googleAccountId) ?? inferAccountTypeFromEmail(acc.email);
    const accountLabel = acc.userDefinedLabel || (accountType === "work" ? "Work" : "Personal");

    const ex = (e.explainJson as Record<string, unknown> | null) ?? null;
    const insights =
      ex && ex.source === "llm"
        ? {
            focusType: typeof ex.focus_type === "string" ? ex.focus_type : undefined,
            reason: typeof ex.reason === "string" ? ex.reason : undefined,
            watchouts: Array.isArray(ex.watchouts)
              ? (ex.watchouts.filter((w) => typeof w === "string") as string[])
              : undefined,
            confidence: typeof ex.confidence === "number" ? ex.confidence : undefined,
          }
        : undefined;

    byDayFormatted[k].push({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      accountType,
      accountLabel,
      flags,
      ...(insights ? { insights } : {}),
    });
  }

  const nextEv = visibleUpcomingEvents[0];
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
        accountType: accountTypeById.get(a.id) ?? inferAccountTypeFromEmail(a.email),
        displayName: displayNameById.get(a.id) ?? null,
        messagesTotal: stats.messagesTotal,
        messagesUnread: stats.messagesUnread,
        archivedLast24h: archivedLast24hByAccountId.get(a.id) ?? 0,
      };
    })
  );
  const inboxByAccount = inboxResults
    .filter(
      (
        r
      ): r is PromiseFulfilledResult<{
        accountId: string;
        email: string;
        accountLabel: string | null;
        accountType: "work" | "personal" | "unknown";
        displayName: string | null;
        messagesTotal: number;
        messagesUnread: number;
        archivedLast24h: number;
      }> => r.status === "fulfilled"
    )
    .map((r) => r.value);

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
    categories,
    llmStatus: {
      enabled: llmStatus.enabled,
      provider: llmStatus.provider,
      model: llmStatus.model,
    },
    suggestedActions: suggestedActions.map((s) => ({
      emailEventId: s.emailEventId,
      from: s.from,
      snippet: s.snippet,
      categoryId: s.categoryId,
      categoryName: s.categoryName,
      confidence: s.confidence,
      band: s.band,
      recommendedRuleType: s.recommendedRuleType,
      recommendedValue: s.recommendedValue,
      email: s.email,
      domain: s.domain,
      needsSender: s.needsSender,
      needsDomain: s.needsDomain,
    })),
    topPriorities: priorities.map((e) => {
      const acc = accountById.get(e.googleAccountId)!;
      const accountType = accountTypeById.get(e.googleAccountId) ?? inferAccountTypeFromEmail(acc.email);
      const accountLabel = acc.userDefinedLabel || (accountType === "work" ? "Work" : "Personal");
      const px = buildPriorityExplanation(e);
      return {
        id: e.id,
        messageId: e.messageId,
        threadId: e.threadId,
        googleAccountId: e.googleAccountId,
        accountLabel,
        accountType,
        subject: e.subject,
        from: e.from_,
        snippet: e.snippet,
        date: e.date.toISOString(),
        categoryId: e.classificationCategoryId ?? null,
        categoryName: e.category?.name ?? null,
        confidence: e.confidence ?? null,
        actionType: e.actionType ?? null,
        prioritySummary: px.summary,
        prioritySignals: px.signals,
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
      accountType: accountTypeById.get(o.googleAccountId) ?? "unknown",
    })),
    calendarWatchouts: {
      summary: {
        narrative: calendarNarrative,
        overloadedDays: overloaded,
        earlyStarts: earlyStarts.slice(0, 5),
        backToBackChains: Array.from(backToBackByDay.entries()).map(([date, count]) => ({ date, count })),
      },
      localTodayKey: localToday,
      timeZone,
      byDay: byDayFormatted,
    },
    digest: {
      summary: digestByCategory,
      groups: digestGroups,
    },
  };
}
