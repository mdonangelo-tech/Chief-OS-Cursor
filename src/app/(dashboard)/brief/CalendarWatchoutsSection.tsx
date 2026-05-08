"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { labelLocalDayKey } from "@/lib/calendar-time";

interface CalendarWatchoutsSectionProps {
  summary: {
    narrative?: string;
    overloadedDays: Array<{ date: string; count: number }>;
    earlyStarts: Array<{ date: string; time: string }>;
    backToBackChains: Array<{ date: string; count: number }>;
  };
  byDay: Record<
    string,
    Array<{
      id: string;
      title: string | null;
      startAt: string;
      accountType: "work" | "personal" | "unknown";
      accountLabel: string;
      flags: string[];
      insights?: { focusType?: string; reason?: string; watchouts?: string[]; confidence?: number };
    }>
  >;
  localTodayKey: string;
  timeZone: string;
}

function fmtDate(s: string, todayKey: string): string {
  return labelLocalDayKey(s, todayKey);
}

export function CalendarWatchoutsSection({
  summary,
  byDay,
  localTodayKey,
  timeZone,
}: CalendarWatchoutsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const router = useRouter();

  const todayEvents = byDay[localTodayKey] ?? [];

  const summaryParts: string[] = [];
  if (summary.overloadedDays.length > 0) {
    summaryParts.push(
      `Packed: ${summary.overloadedDays.map((d) => `${fmtDate(d.date, localTodayKey)} (${d.count})`).join(", ")}`
    );
  }
  if (summary.earlyStarts.length > 0) {
    summaryParts.push(
      `Early: ${summary.earlyStarts
        .slice(0, 3)
        .map((e) => `${fmtDate(e.date, localTodayKey)} ${e.time}`)
        .join(", ")}`
    );
  }
  if (summary.backToBackChains.length > 0) {
    summaryParts.push(
      `Tightly stacked: ${summary.backToBackChains.map((b) => `${fmtDate(b.date, localTodayKey)} (${b.count})`).join(", ")}`
    );
  }

  async function hideEvent(id: string) {
    setSavingId(id);
    try {
      const res = await fetch("/api/brief/calendar-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarEventId: id, feedback: "hide" }),
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section id="calendar" className="scroll-mt-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="text-lg font-medium text-foreground">Calendar</h2>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-sm text-accent hover:text-accent/80"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft">
        <p className="text-foreground/90 text-sm">
          {summary.narrative
            ? summary.narrative
            : summaryParts.length > 0
              ? `Review calendar flow: ${summaryParts.join(" · ")}`
              : "Your calendar has no obvious prep needs right now."}
        </p>
        {summary.narrative && summaryParts.length > 0 && (
          <p className="text-muted-foreground text-xs mt-1">{summaryParts.join(" · ")}</p>
        )}
        {todayEvents.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-muted-foreground">Today</div>
            <ul className="mt-1 space-y-1">
              {todayEvents.slice(0, 3).map((e) => (
                <li key={e.id} className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {new Date(e.startAt).toLocaleTimeString(undefined, {
                      timeZone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-foreground/90">{e.title || "(No title)"}</span>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="text-xs text-muted-foreground/80">{e.accountLabel}</span>
                  {e.insights?.reason && (
                    <span className="text-xs text-muted-foreground/70 italic">
                      {e.insights.reason}
                    </span>
                  )}
                </li>
              ))}
              {todayEvents.length > 3 && (
                <li className="text-xs text-muted-foreground/70">+{todayEvents.length - 3} more today</li>
              )}
            </ul>
          </div>
        )}
      </div>
      {expanded && Object.keys(byDay).length > 0 && (
        <div className="mt-3 space-y-2">
          {Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, events]) => (
              <div key={day} className="rounded-xl border border-border/10 bg-surface/40 px-3 py-2">
                <div className="text-sm font-medium text-muted-foreground">{fmtDate(day, localTodayKey)}</div>
                <ul className="mt-1 space-y-1">
                  {events.slice(0, 5).map((e) => (
                    <li key={e.id} className="text-muted-foreground text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="shrink-0">
                        {new Date(e.startAt).toLocaleTimeString(undefined, {
                          timeZone,
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                          </span>
                          <span className="truncate">{e.title || "(No title)"}</span>
                          <span className="text-xs text-muted-foreground/70">· {e.accountLabel}</span>
                          {e.flags.length > 0 && (
                            <span className="text-accent/80 text-xs">({e.flags.join(", ")})</span>
                          )}
                        </div>
                        {e.insights?.reason && (
                          <div className="text-xs text-muted-foreground/70 italic mt-0.5">
                            {e.insights.reason}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={savingId === e.id}
                        onClick={() => hideEvent(e.id)}
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {savingId === e.id ? "Hiding…" : "Hide"}
                      </button>
                    </li>
                  ))}
                  {events.length > 5 && (
                    <li className="text-muted-foreground/70 text-xs">+{events.length - 5} more</li>
                  )}
                </ul>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
