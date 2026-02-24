"use client";

import { useState } from "react";
import type { BriefPayload } from "@/services/brief/api-brief";
import { TodayAtGlance } from "./TodayAtGlance";
import { PriorityCard } from "./PriorityCard";
import { OpenLoopsSection } from "./OpenLoopsSection";
import { CalendarWatchoutsSection } from "./CalendarWatchoutsSection";
import { DeclutterSection } from "./DeclutterSection";
import Link from "next/link";

type AccountFilter = "all" | "personal" | "work";
const MAX_OPEN_LOOPS_RENDER = 30;

function matchFilter(label: string | null, filter: AccountFilter): boolean {
  if (filter === "all") return true;
  const l = (label || "personal").toLowerCase();
  if (filter === "personal") return l === "personal";
  if (filter === "work") return l === "work";
  return true;
}

export function BriefContent({ payload }: { payload: BriefPayload }) {
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");

  const priorities = payload.topPriorities.filter((p) =>
    matchFilter(p.accountLabel, accountFilter)
  );
  const openLoops = payload.openLoops.filter((o) =>
    matchFilter(o.accountLabel, accountFilter)
  );

  return (
    <div className="space-y-8">
      <div className="flex gap-2 mb-2">
        {(["all", "personal", "work"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setAccountFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              accountFilter === f
                ? "bg-amber-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <TodayAtGlance
        prioritiesCount={priorities.length}
        openLoopsCount={openLoops.length}
        nextMeeting={payload.summary.nextMeeting}
        calendarWatchouts={payload.summary.calendarWatchouts}
        archivedLast24h={payload.summary.archivedLast24h}
        inboxByAccount={payload.inboxByAccount}
      />

      <section id="priorities" className="scroll-mt-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-3">Top priorities</h2>
        {priorities.length > 0 ? (
          <ul className="space-y-4">
            {priorities.map((p) => (
              <li key={p.id}>
                <PriorityCard
                  id={p.id}
                  messageId={p.messageId}
                  threadId={p.threadId}
                  googleAccountId={p.googleAccountId}
                  accountLabel={p.accountLabel}
                  subject={p.subject}
                  from={p.from}
                  snippet={p.snippet}
                  categoryName={p.categoryName}
                  confidence={p.confidence}
                  actionType={p.actionType}
                  explainJson={p.explainJson}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500 text-sm">No priorities for this filter.</p>
        )}
      </section>

      <OpenLoopsSection loops={openLoops.slice(0, MAX_OPEN_LOOPS_RENDER)} />
      {openLoops.length > MAX_OPEN_LOOPS_RENDER && (
        <p className="text-zinc-600 text-xs">
          Showing {MAX_OPEN_LOOPS_RENDER} of {openLoops.length}. Tighten filters above to narrow.
        </p>
      )}

      <CalendarWatchoutsSection
        summary={payload.calendarWatchouts.summary}
        byDay={payload.calendarWatchouts.byDay}
      />

      <DeclutterSection
        summary={payload.digest.summary}
        groups={payload.digest.groups}
      />
    </div>
  );
}
