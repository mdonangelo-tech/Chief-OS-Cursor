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
  email: string;
  accountLabel: string | null;
  messagesTotal: number;
  messagesUnread: number;
}

interface TodayAtGlanceProps {
  prioritiesCount: number;
  openLoopsCount: number;
  nextMeeting: NextMeeting | null;
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

export function TodayAtGlance({
  prioritiesCount,
  openLoopsCount,
  nextMeeting,
  calendarWatchouts,
  archivedLast24h,
  inboxByAccount,
}: TodayAtGlanceProps) {
  const inboxAccounts = inboxByAccount ?? [];
  const totalInbox = inboxAccounts.reduce((s, a) => s + a.messagesTotal, 0);
  const cw = calendarWatchouts;
  const summary = [
    cw.overloadedDays > 0 && `Overloaded: ${cw.overloadedDays}`,
    cw.earlyStarts > 0 && `Early: ${cw.earlyStarts}`,
    cw.backToBackChains > 0 && `Back-to-back: ${cw.backToBackChains}`,
  ]
    .filter(Boolean)
    .join(" · ") || "None";

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8"
      aria-label="Today at a glance"
    >
      <a
        href="#declutter"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
        title={inboxAccounts.map((a) => `${a.accountLabel || a.email}: ${a.messagesTotal} in inbox`).join(" · ")}
      >
        <div className="text-2xl font-semibold text-foreground tabular-nums">{totalInbox.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
          Inbox{inboxAccounts.length > 1 ? ` (${inboxAccounts.length})` : ""}
        </div>
        {inboxAccounts.length > 1 && (
          <div className="text-xs text-muted-foreground/80 mt-1 space-y-0.5">
            {inboxAccounts.map((a) => (
              <div key={a.email} className="truncate" title={`${a.messagesTotal} total, ${a.messagesUnread} unread`}>
                {a.accountLabel || a.email.split("@")[0]}: {a.messagesTotal.toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </a>
      <a
        href="#priorities"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-2xl font-semibold text-accent tabular-nums">{prioritiesCount}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Priorities</div>
      </a>
      <a
        href="#open-loops"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-2xl font-semibold text-foreground tabular-nums">{openLoopsCount}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Open loops</div>
      </a>
      <a
        href="#calendar"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-lg font-medium text-foreground truncate" title={nextMeeting?.title ?? undefined}>
          {nextMeeting ? inMinutes(nextMeeting.inMinutes) : "—"}
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Next meeting</div>
        {nextMeeting?.title && (
          <div className="text-xs text-muted-foreground/80 truncate mt-1">{nextMeeting.title}</div>
        )}
      </a>
      <a
        href="#calendar"
        className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 hover:bg-surface2/60 hover:border-border/20 transition-colors block shadow-soft"
      >
        <div className="text-sm font-medium text-foreground/90 truncate">{summary}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Calendar</div>
      </a>
      <div className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft">
        <div className="text-2xl font-semibold text-foreground tabular-nums">{archivedLast24h}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Archived 24h</div>
        {archivedLast24h > 0 && (
          <Link
            href="/audit"
            className="text-xs text-accent hover:text-accent/80 mt-1 block"
          >
            Undo
          </Link>
        )}
      </div>
    </div>
  );
}
