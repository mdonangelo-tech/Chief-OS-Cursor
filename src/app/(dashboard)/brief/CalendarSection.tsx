"use client";

import { useState } from "react";

interface CalendarEvent {
  id: string;
  title: string | null;
  startAt: Date | string;
  endAt: Date | string;
  organizer: string | null;
  flags: string[];
  explainJson: { reason?: string; confidence?: number } | null;
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

interface CalendarSectionProps {
  events: CalendarEvent[];
}

function text(s: string | null | undefined): string {
  return s ?? "";
}

export function CalendarSection({ events }: CalendarSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const today = new Date().toDateString();
  const todayEvents = events.filter(
    (e) => toDate(e.startAt).toDateString() === today
  );
  const overloadedCount = new Set(
    events
      .filter((e) => e.flags.includes("overloaded"))
      .map((e) => toDate(e.startAt).toDateString())
  ).size;

  const summaryParts: string[] = [];
  if (todayEvents.length > 0) {
    summaryParts.push(`${todayEvents.length} today`);
  }
  const backToBackCount = events.filter((e) => e.flags.includes("back-to-back")).length;
  if (backToBackCount > 0) {
    summaryParts.push(`${backToBackCount} back-to-back`);
  }
  if (overloadedCount > 0) {
    summaryParts.push(`${overloadedCount} busy day(s)`);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : "No watchouts";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-zinc-200">
          Calendar (next 7 days)
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-zinc-300 text-sm">{summary}</p>
      </div>
      {expanded && (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded border border-zinc-800/80 bg-zinc-900/30 px-4 py-2 text-zinc-400"
            >
              <span className="font-medium text-zinc-300">
                {text(e.title) || "(No title)"}
              </span>
              <span className="text-zinc-500 text-sm ml-2">
                {toDate(e.startAt).toLocaleString()} — {text(e.organizer) || "—"}
              </span>
              {e.flags.length > 0 && (
                <span className="ml-2 text-amber-500/80 text-xs">
                  ({e.flags.join(", ")})
                </span>
              )}
              {e.explainJson?.reason && (
                <span className="ml-2 text-zinc-600 text-xs italic block mt-1">
                  {e.explainJson.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
