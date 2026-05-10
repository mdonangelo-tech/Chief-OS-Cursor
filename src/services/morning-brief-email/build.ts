import type { BriefPayload } from "@/services/brief/api-brief";
import { formatLocalTime } from "@/lib/calendar-time";
import type {
  MorningBriefCalendarHighlight,
  MorningBriefCriticalEmail,
  MorningBriefEmail,
  MorningBriefEmailItem,
} from "./types";

const STALE_HOURS = 18;

function truncate(value: string | null | undefined, max = 140): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function isStale(iso: string | null, now: Date): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > STALE_HOURS * 60 * 60 * 1000;
}

function todayEvents(payload: BriefPayload) {
  const todayKey = payload.calendarWatchouts.localTodayKey;
  return [...(payload.calendarWatchouts.byDay[todayKey] ?? [])].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
}

function meetingLoad(events: ReturnType<typeof todayEvents>): "light" | "focus-heavy" | "fragmented" | "meeting-heavy" {
  const meetingMinutes = events.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const hasBackToBack = events.some((e) => e.flags.includes("back-to-back"));
  if (events.length >= 5 || meetingMinutes >= 300) return "meeting-heavy";
  if (events.length >= 3 || hasBackToBack) return "fragmented";
  if (events.length <= 1) return "focus-heavy";
  return "light";
}

function sourceLabel(accountLabel: string | null | undefined): string | undefined {
  return accountLabel ? `${accountLabel} account` : undefined;
}

function actionForEmail(actionType: string | null | undefined): string {
  if (actionType === "reply") return "Reply or decide who owns the next step.";
  if (actionType === "schedule") return "Schedule or confirm the timing.";
  if (actionType === "read") return "Review enough to decide whether action is needed.";
  return "Decide whether this needs a response today.";
}

function criticalEmailGroup(
  email: BriefPayload["topPriorities"][number]
): MorningBriefCriticalEmail["group"] {
  const signals = new Set(email.prioritySignals ?? []);
  const text = `${email.subject ?? ""} ${email.snippet ?? ""}`.toLowerCase();
  if (email.actionType === "reply" || signals.has("needs_action")) return "needs_response";
  if (text.match(/\b(deadline|due|today|tomorrow|urgent|asap|eod)\b/)) return "deadline_sensitive";
  if (text.match(/\b(board|legal|confidential|sensitive|investor|offer|contract)\b/)) return "sensitive";
  if ((email.confidence ?? 0) >= 0.85 || signals.has("high_importance")) {
    return "external_high_importance";
  }
  return "needs_response";
}

function buildCriticalEmails(payload: BriefPayload): MorningBriefCriticalEmail[] {
  return payload.topPriorities.slice(0, 5).map((email) => {
    const title = truncate(email.subject, 90) || "(No subject)";
    const rationale =
      email.prioritySummary ||
      truncate(email.snippet, 120) ||
      "ChiefOS ranked this as requiring attention today.";
    return {
      sender: truncate(email.from, 80),
      title,
      rationale,
      source: sourceLabel(email.accountLabel),
      confidence:
        typeof email.confidence === "number" && email.confidence >= 0.8
          ? "high"
          : "medium",
      suggestedAction: actionForEmail(email.actionType),
      group: criticalEmailGroup(email),
    };
  });
}

function buildCalendarHighlights(payload: BriefPayload): MorningBriefCalendarHighlight[] {
  return todayEvents(payload)
    .filter((event, index) => {
      if (index < 3) return true;
      return (
        event.flags.length > 0 ||
        event.insights?.needsPrep === true ||
        !!event.insights?.reason ||
        (event.durationMinutes ?? 0) >= 60
      );
    })
    .slice(0, 4)
    .map((event) => {
      const watchouts = event.insights?.watchouts?.filter(Boolean) ?? [];
      const flagText = event.flags.length > 0 ? event.flags.join(", ") : null;
      const rationale =
        event.insights?.reason ||
        (flagText ? `Calendar flow needs attention: ${flagText}.` : "Worth keeping visible in today's plan.");
      const prepNeeded =
        event.insights?.needsPrep === true
          ? event.insights.prepTimeMinutes
            ? `${event.insights.prepTimeMinutes} min prep`
            : "Prep likely needed"
          : watchouts[0] ?? undefined;
      return {
        time: formatLocalTime(new Date(event.startAt), payload.calendarWatchouts.timeZone),
        title: truncate(event.title, 90) || "(No title)",
        rationale,
        source: sourceLabel(event.accountLabel),
        confidence:
          typeof event.insights?.confidence === "number" && event.insights.confidence >= 0.75
            ? "high"
            : "medium",
        suggestedAction: prepNeeded ? "Review context before the meeting." : undefined,
        prepNeeded,
      };
    });
}

function buildRisks(payload: BriefPayload): MorningBriefEmailItem[] {
  const risks: MorningBriefEmailItem[] = [];
  const summary = payload.calendarWatchouts.summary;

  for (const loop of payload.openLoops.slice(0, 4)) {
    risks.push({
      title: loop.badge === "owe_reply" ? "Reply overdue" : "Follow-up may be stalled",
      rationale: `${truncate(loop.subject, 90) || "Thread"} has been quiet for ${loop.lastActivityDaysAgo} day${loop.lastActivityDaysAgo === 1 ? "" : "s"}.`,
      source: sourceLabel(loop.accountLabel),
      confidence: "medium",
      suggestedAction:
        loop.badge === "owe_reply"
          ? "Send a short reply or mark it handled."
          : "Nudge only if this is still important.",
    });
  }

  if (summary.earlyStarts.length > 0) {
    const first = summary.earlyStarts[0];
    risks.push({
      title: "Early start",
      rationale: `Your calendar starts early ${first ? `at ${first.time}` : "today"}, so prep needs to happen before the day accelerates.`,
      confidence: "high",
      suggestedAction: "Check the first meeting before inbox triage.",
    });
  }

  if (summary.backToBackChains.length > 0) {
    risks.push({
      title: "Tight handoffs",
      rationale: "There are back-to-back blocks with limited room for context switching.",
      confidence: "high",
      suggestedAction: "Pick one prep block before meetings begin.",
    });
  }

  return risks.slice(0, 5);
}

function buildPriorities(
  payload: BriefPayload,
  calendarHighlights: MorningBriefCalendarHighlight[],
  criticalEmails: MorningBriefCriticalEmail[],
  risks: MorningBriefEmailItem[]
): MorningBriefEmailItem[] {
  const priorities: MorningBriefEmailItem[] = [];

  for (const email of criticalEmails.slice(0, 3)) {
    priorities.push({
      title: email.title,
      rationale: email.rationale,
      source: email.source,
      confidence: email.confidence,
      suggestedAction: email.suggestedAction,
    });
  }

  if (calendarHighlights.length > 0) {
    const first = calendarHighlights[0];
    priorities.push({
      title: `Protect attention around ${first.title}`,
      rationale: `${first.time}: ${first.rationale}`,
      source: first.source,
      confidence: first.confidence,
      suggestedAction: first.prepNeeded ?? first.suggestedAction,
    });
  }

  for (const risk of risks) {
    if (priorities.length >= 5) break;
    if (!priorities.some((p) => p.title === risk.title)) priorities.push(risk);
  }

  if (priorities.length === 0) {
    priorities.push({
      title: "Keep the day intentional",
      rationale: "ChiefOS did not find a high-confidence urgent thread or calendar risk.",
      confidence: "low",
      suggestedAction: "Use the live Brief if you want to scan the underlying context.",
    });
  }

  return priorities.slice(0, 5);
}

function buildOpeningSummary(
  payload: BriefPayload,
  dayType: string,
  priorities: MorningBriefEmailItem[],
  calendarHighlights: MorningBriefCalendarHighlight[]
): string {
  const parts: string[] = [];
  const priorityCount = payload.topPriorities.length;
  const loopCount = payload.openLoops.length;
  const calendarNarrative = payload.calendarWatchouts.summary.narrative;

  parts.push(
    `Today looks ${dayType.replace("-", " ")}: ${calendarHighlights.length} calendar item${calendarHighlights.length === 1 ? "" : "s"} deserve attention and ${priorityCount} email priorit${priorityCount === 1 ? "y" : "ies"} surfaced.`
  );
  if (calendarNarrative) {
    parts.push(calendarNarrative);
  } else if (priorities[0]) {
    parts.push(`The main theme is ${priorities[0].title.toLowerCase()}, with the strongest signal coming from ${priorities[0].source ?? "your current Brief context"}.`);
  }
  if (loopCount > 0) {
    parts.push(`${loopCount} open loop${loopCount === 1 ? "" : "s"} may need a decision, reply, or deliberate deferral.`);
  }
  if (payload.syncStatus.hasSyncErrors) {
    parts.push("A sync warning is present, so treat this as a limited brief and open ChiefOS for the full view.");
  }

  return parts.slice(0, 4).join(" ");
}

function buildFocusPlan(
  dayType: string,
  priorities: MorningBriefEmailItem[],
  calendarHighlights: MorningBriefCalendarHighlight[]
): string | null {
  if (priorities.length === 0 && calendarHighlights.length === 0) return null;
  if (dayType === "meeting-heavy" || dayType === "fragmented") {
    return "Handle the highest-signal replies before meetings start, then use the first clean gap for prep and decisions rather than inbox scanning.";
  }
  if (dayType === "focus-heavy") {
    return "Clear the few urgent replies early, then protect the largest open block for focused work and batch admin later.";
  }
  return "Start with the top priority, review the key calendar context, and batch lower-priority admin after the main work block.";
}

export function buildMorningBriefEmail(payload: BriefPayload, now = new Date()): MorningBriefEmail {
  const timeZone = payload.calendarWatchouts.timeZone;
  const staleSources = [
    isStale(payload.syncStatus.gmailSyncAt, now) ? "gmail" : null,
    isStale(payload.syncStatus.calendarSyncAt, now) ? "calendar" : null,
  ].filter((source): source is string => !!source);
  const calendarHighlights = buildCalendarHighlights(payload);
  const criticalEmails = buildCriticalEmails(payload);
  const risks = buildRisks(payload);
  const dayType = meetingLoad(todayEvents(payload));
  const priorities = buildPriorities(payload, calendarHighlights, criticalEmails, risks);

  return {
    date: payload.calendarWatchouts.localTodayKey,
    timezone: timeZone,
    openingSummary: buildOpeningSummary(payload, dayType, priorities, calendarHighlights),
    todayPriorities: priorities,
    calendarHighlights,
    criticalEmails,
    risksAndOpenLoops: risks,
    suggestedFocusPlan: buildFocusPlan(dayType, priorities, calendarHighlights),
    dataFreshness: {
      gmailSyncAt: payload.syncStatus.gmailSyncAt,
      calendarSyncAt: payload.syncStatus.calendarSyncAt,
      hasSyncErrors: payload.syncStatus.hasSyncErrors,
      isLimited: payload.syncStatus.hasSyncErrors || staleSources.length > 0,
      staleSources,
    },
    generatedAt: payload.assembledAt,
  };
}
