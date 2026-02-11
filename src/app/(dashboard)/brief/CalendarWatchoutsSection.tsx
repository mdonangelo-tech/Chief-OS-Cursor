"use client";

import { useState } from "react";

interface CalendarWatchoutsSectionProps {
  summary: {
    overloadedDays: Array<{ date: string; count: number }>;
    earlyStarts: Array<{ date: string; time: string }>;
    backToBackChains: Array<{ date: string; count: number }>;
  };
  byDay: Record<string, Array<{ id: string; title: string | null; startAt: string; flags: string[] }>>;
}

function fmtDate(s: string): string {
  const d = new Date(s);
  const today = new Date();
  const diff = Math.floor((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function CalendarWatchoutsSection({ summary, byDay }: CalendarWatchoutsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const hasAny =
    summary.overloadedDays.length > 0 ||
    summary.earlyStarts.length > 0 ||
    summary.backToBackChains.length > 0;

  const summaryParts: string[] = [];
  if (summary.overloadedDays.length > 0) {
    summaryParts.push(
      `Overloaded: ${summary.overloadedDays.map((d) => `${fmtDate(d.date)} (${d.count})`).join(", ")}`
    );
  }
  if (summary.earlyStarts.length > 0) {
    summaryParts.push(
      `Early: ${summary.earlyStarts
        .slice(0, 3)
        .map((e) => `${fmtDate(e.date)} ${e.time}`)
        .join(", ")}`
    );
  }
  if (summary.backToBackChains.length > 0) {
    summaryParts.push(
      `Back-to-back: ${summary.backToBackChains.map((b) => `${fmtDate(b.date)} (${b.count})`).join(", ")}`
    );
  }

  return (
    <section id="calendar" className="scroll-mt-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="text-lg font-medium text-zinc-200">Calendar (next 7 days)</h2>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-zinc-300 text-sm">
          {summaryParts.length > 0 ? summaryParts.join(" · ") : "No watchouts"}
        </p>
      </div>
      {expanded && Object.keys(byDay).length > 0 && (
        <div className="mt-3 space-y-2">
          {Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, events]) => (
              <div key={day} className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2">
                <div className="text-sm font-medium text-zinc-400">{fmtDate(day)}</div>
                <ul className="mt-1 space-y-1">
                  {events.slice(0, 5).map((e) => (
                    <li key={e.id} className="text-zinc-500 text-sm flex items-center gap-2">
                      <span>
                        {new Date(e.startAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>{e.title || "(No title)"}</span>
                      {e.flags.length > 0 && (
                        <span className="text-amber-500/80 text-xs">({e.flags.join(", ")})</span>
                      )}
                    </li>
                  ))}
                  {events.length > 5 && (
                    <li className="text-zinc-600 text-xs">+{events.length - 5} more</li>
                  )}
                </ul>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
