"use client";

import Link from "next/link";

interface NextMeeting {
  title: string | null;
  startAt: string;
  inMinutes: number;
}

interface CalendarWatchouts {
  overloadedDays: number;
  earlyStarts: number;
  backToBackChains: number;
}

interface InboxAccount {
  accountId?: string;
  email: string;
  accountLabel: string | null;
  displayName?: string | null;
  accountType?: "work" | "personal" | "unknown";
  messagesTotal: number;
  messagesUnread: number;
  archivedLast24h?: number;
}

interface TodayAtGlanceProps {
  prioritiesCount: number;
  openLoopsCount: number;
  nextMeeting: NextMeeting | null;
  calendarNarrative?: string | null;
  calendarWatchouts: CalendarWatchouts;
  archivedLast24h: number;
  inboxByAccount: InboxAccount[];
}

function inMinutes(m: number): string {
  if (m < 0) return "passed";
  if (m < 60) return `in ${m}m`;
  if (m < 1440) return `in ${Math.round(m / 60)}h`;
  return `in ${Math.round(m / 1440)}d`;
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) return `${Math.round((n / 1000) * 10) / 10}k`;
  return `${Math.round((n / 1_000_000) * 10) / 10}m`;
}

export function TodayAtGlance({
  prioritiesCount,
  openLoopsCount,
  nextMeeting,
  calendarNarrative,
  calendarWatchouts,
  archivedLast24h,
  inboxByAccount,
}: TodayAtGlanceProps) {
  const inboxAccounts = inboxByAccount ?? [];
  const totalInbox = inboxAccounts.reduce((s, a) => s + a.messagesTotal, 0);
  const totalUnread = inboxAccounts.reduce((s, a) => s + a.messagesUnread, 0);
  const cw = calendarWatchouts;
  const watchouts = [
    cw.overloadedDays > 0 && `${cw.overloadedDays} packed day${cw.overloadedDays === 1 ? "" : "s"} to plan around`,
    cw.earlyStarts > 0 && `${cw.earlyStarts} early start${cw.earlyStarts === 1 ? "" : "s"} to prepare for`,
    cw.backToBackChains > 0 && `${cw.backToBackChains} tight handoff${cw.backToBackChains === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const calendarLine = calendarNarrative?.trim() || watchouts || "No obvious prep needs.";

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
      aria-label="Today at a glance"
    >
      <a
        href="#declutter"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
        title={inboxAccounts
          .map((a) => `${a.displayName || a.accountLabel || a.email}: ${a.messagesTotal} in inbox`)
          .join(" · ")}
      >
        <div className="text-sm font-medium text-foreground">Inbox scan</div>
        <div className="text-muted-foreground text-sm mt-1">
          {totalUnread === 0
            ? "Nothing unread right now."
            : `${fmtCompact(totalUnread)} unread`}
          {inboxAccounts.length > 1 ? ` across ${inboxAccounts.length} accounts` : ""}
        </div>
        <div className="text-muted-foreground/70 text-xs mt-1">
          {totalInbox > 0 ? `${fmtCompact(totalInbox)} total in inbox` : "Inbox totals unavailable."}
        </div>
        {archivedLast24h > 0 ? (
          <div className="text-muted-foreground/80 text-xs mt-2">
            ChiefOS auto-managed {fmtCompact(archivedLast24h)} in the last 24h.{" "}
            <Link href="/audit" className="text-accent hover:text-accent/80">
              Review
            </Link>
          </div>
        ) : (
          <div className="text-muted-foreground/70 text-xs mt-2">No automated archiving in the last 24h.</div>
        )}
      </a>
      <a
        href="#priorities"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-sm font-medium text-foreground">Focus</div>
        <div className="text-muted-foreground text-sm mt-1">
          {prioritiesCount === 0
            ? "Nothing urgent surfaced."
            : `${prioritiesCount} priority item${prioritiesCount === 1 ? "" : "s"} surfaced.`}{" "}
          {openLoopsCount > 0
            ? `${openLoopsCount} open loop${openLoopsCount === 1 ? "" : "s"} aging.`
            : "No aging loops."}
        </div>
        <div className="text-xs text-muted-foreground/70 mt-2">
          If something is wrong, correct it once — ChiefOS will adapt.
        </div>
      </a>
      <a
        href="#calendar"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-sm font-medium text-foreground">Calendar</div>
        <div className="text-muted-foreground text-sm mt-1">
          {nextMeeting ? `Next commitment ${inMinutes(nextMeeting.inMinutes)}.` : "No upcoming meetings."}
        </div>
        {nextMeeting?.title && (
          <div className="text-xs text-muted-foreground/80 truncate mt-1" title={nextMeeting.title}>
            {nextMeeting.title}
          </div>
        )}
        <div className="text-xs text-muted-foreground/70 mt-2 line-clamp-2" title={calendarLine}>
          {calendarLine}
        </div>
      </a>
    </div>
  );
}
