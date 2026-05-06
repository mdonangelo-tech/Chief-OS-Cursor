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
        <h2 className="text-lg font-medium text-foreground">
          Calendar (next 7 days)
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-sm text-accent hover:text-accent/80"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft">
        <p className="text-foreground/90 text-sm">{summary}</p>
      </div>
      {expanded && (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-border/10 bg-surface/40 px-4 py-2 text-muted-foreground"
            >
              <span className="font-medium text-foreground/90">
                {text(e.title) || "(No title)"}
              </span>
              <span className="text-muted-foreground text-sm ml-2">
                {toDate(e.startAt).toLocaleString()} — {text(e.organizer) || "—"}
              </span>
              {e.flags.length > 0 && (
                <span className="ml-2 text-accent/80 text-xs">
                  ({e.flags.join(", ")})
                </span>
              )}
              {e.explainJson?.reason && (
                <span className="ml-2 text-muted-foreground/80 text-xs italic block mt-1">
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
