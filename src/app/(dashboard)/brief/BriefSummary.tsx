"use client";

import Link from "next/link";

interface BriefSummaryProps {
  prioritiesCount: number;
  openLoopsCount: number;
  nextMeeting: { title: string | null; startAt: Date | string } | null;
  overloadedDaysCount: number;
  declutterCount: number;
  recentAutoArchived: number;
}

function formatNextMeeting(start: Date | string): string {
  const d = typeof start === "string" ? new Date(start) : start;
  const now = new Date();
  const today = now.toDateString();
  const startDate = d.toDateString();
  if (startDate === today) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BriefSummary({
  prioritiesCount,
  openLoopsCount,
  nextMeeting,
  overloadedDaysCount,
  declutterCount,
  recentAutoArchived,
}: BriefSummaryProps) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8"
      aria-label="Today at a glance"
    >
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-2xl font-semibold text-amber-500 tabular-nums">
          {prioritiesCount}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Priorities
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-2xl font-semibold text-zinc-200 tabular-nums">
          {openLoopsCount}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Open loops
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-lg font-medium text-zinc-200 truncate" title={nextMeeting?.title ?? undefined}>
          {nextMeeting ? formatNextMeeting(nextMeeting.startAt as Date | string) : "—"}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Next meeting
        </div>
        {nextMeeting?.title && (
          <div className="text-xs text-zinc-600 truncate mt-1">{nextMeeting.title}</div>
        )}
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-2xl font-semibold text-zinc-200 tabular-nums">
          {overloadedDaysCount}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Busy days
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-2xl font-semibold text-zinc-200 tabular-nums">
          {declutterCount}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Declutter
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="text-2xl font-semibold text-zinc-200 tabular-nums">
          {recentAutoArchived}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-0.5">
          Auto-archived 24h
        </div>
        {recentAutoArchived > 0 && (
          <Link
            href="/audit"
            className="text-xs text-amber-500 hover:text-amber-400 mt-1 block"
          >
            Undo →
          </Link>
        )}
      </div>
    </div>
  );
}
