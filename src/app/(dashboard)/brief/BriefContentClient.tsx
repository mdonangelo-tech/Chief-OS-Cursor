"use client";

import { useState } from "react";
import type { BriefPayload } from "@/services/brief/api-brief";
import { TodayAtGlance } from "./TodayAtGlance";
import { PriorityCard } from "./PriorityCard";
import { OpenLoopsSection } from "./OpenLoopsSection";
import { CalendarWatchoutsSection } from "./CalendarWatchoutsSection";
import { DeclutterSection } from "./DeclutterSection";

type AccountFilter = "all" | "personal" | "work";
const MAX_OPEN_LOOPS_RENDER = 30;

function matchFilter(
  accountType: "work" | "personal" | "unknown" | null | undefined,
  filter: AccountFilter
): boolean {
  if (filter === "all") return true;
  if (accountType === "unknown" || !accountType) return filter === "personal";
  return accountType === filter;
}

export function BriefContentClient({ payload }: { payload: BriefPayload }) {
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");

  const priorities = payload.topPriorities.filter((p) =>
    matchFilter(p.accountType, accountFilter)
  );
  const openLoops = payload.openLoops.filter((o) =>
    matchFilter(o.accountType, accountFilter)
  );
  const inboxByAccount = (payload.inboxByAccount ?? []).filter((a) =>
    matchFilter(a.accountType, accountFilter)
  );
  const archivedLast24h = inboxByAccount.reduce((s, a) => s + (a.archivedLast24h ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex gap-2 mb-2">
        {(["all", "personal", "work"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setAccountFilter(f)}
            aria-pressed={accountFilter === f}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              accountFilter === f
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
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
        calendarNarrative={payload.calendarWatchouts.summary.narrative ?? null}
        calendarWatchouts={payload.summary.calendarWatchouts}
        archivedLast24h={archivedLast24h}
        inboxByAccount={inboxByAccount}
      />

      <section id="priorities" className="scroll-mt-6">
        <h2 className="text-lg font-medium text-foreground mb-3">Top priorities</h2>
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
                  categoryId={p.categoryId}
                  categoryName={p.categoryName}
                  confidence={p.confidence}
                  actionType={p.actionType}
                  explainJson={p.explainJson}
                  categories={payload.categories}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No priorities for this filter.</p>
        )}
      </section>

      <OpenLoopsSection loops={openLoops.slice(0, MAX_OPEN_LOOPS_RENDER)} />
      {openLoops.length > MAX_OPEN_LOOPS_RENDER && (
        <p className="text-muted-foreground/80 text-xs">
          Showing {MAX_OPEN_LOOPS_RENDER} of {openLoops.length}. Tighten filters above to narrow.
        </p>
      )}

      <CalendarWatchoutsSection
        summary={payload.calendarWatchouts.summary}
        byDay={payload.calendarWatchouts.byDay}
      />

      <DeclutterSection summary={payload.digest.summary} />
    </div>
  );
}

