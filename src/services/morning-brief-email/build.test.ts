import test from "node:test";
import assert from "node:assert/strict";
import type { BriefPayload } from "@/services/brief/api-brief";
import { buildMorningBriefEmail } from "./build";

function payload(overrides: Partial<BriefPayload> = {}): BriefPayload {
  const base: BriefPayload = {
    assembledAt: "2026-05-10T11:05:00.000Z",
    summary: {
      prioritiesCount: 1,
      openLoopsCount: 1,
      nextMeeting: null,
      calendarWatchouts: { overloadedDays: 0, earlyStarts: 0, backToBackChains: 0 },
      archivedLast24h: 0,
    },
    syncStatus: {
      gmailSyncAt: "2026-05-10T10:59:00.000Z",
      calendarSyncAt: "2026-05-10T10:58:00.000Z",
      accountsCount: 1,
      hasSyncErrors: false,
    },
    inboxByAccount: [],
    categories: [],
    llmStatus: { enabled: true, provider: "openai", model: "gpt-4o-mini" },
    suggestedActions: [],
    topPriorities: [
      {
        id: "email-1",
        messageId: "msg-1",
        threadId: "thread-1",
        googleAccountId: "ga-1",
        accountLabel: "Work",
        accountType: "work",
        subject: "Board materials due today",
        from: "Partner <partner@example.com>",
        snippet: "Can you send the updated materials by EOD?",
        date: "2026-05-10T10:00:00.000Z",
        categoryId: null,
        categoryName: "Work",
        confidence: 0.91,
        actionType: "reply",
        prioritySummary: "Needs a response today because materials are due by EOD.",
        prioritySignals: ["needs_action"],
        explainJson: null,
      },
    ],
    openLoops: [
      {
        threadId: "loop-1",
        subject: "Follow up on intro",
        badge: "owe_reply",
        lastActivityDaysAgo: 4,
        lastFrom: "Founder <founder@example.com>",
        googleAccountId: "ga-1",
        accountLabel: "Work",
        accountType: "work",
      },
    ],
    calendarWatchouts: {
      summary: {
        narrative: undefined,
        overloadedDays: [],
        earlyStarts: [],
        backToBackChains: [],
      },
      localTodayKey: "2026-05-10",
      timeZone: "America/New_York",
      byDay: {
        "2026-05-10": [
          {
            id: "cal-1",
            title: "Investor update",
            startAt: "2026-05-10T14:00:00.000Z",
            endAt: "2026-05-10T15:00:00.000Z",
            durationMinutes: 60,
            accountType: "work",
            accountLabel: "Work",
            flags: ["back-to-back"],
            insights: {
              focusType: "meeting",
              needsPrep: true,
              prepTimeMinutes: 20,
              reason: "Likely needs prep based on attendees and title.",
              confidence: 0.8,
            },
          },
        ],
      },
    },
    digest: { summary: {}, groups: [] },
  };
  return { ...base, ...overrides };
}

test("buildMorningBriefEmail synthesizes priorities, calendar, risks, and focus plan", () => {
  const brief = buildMorningBriefEmail(payload(), new Date("2026-05-10T11:10:00.000Z"));

  assert.equal(brief.date, "2026-05-10");
  assert.match(brief.openingSummary, /email priority surfaced/i);
  assert.equal(brief.todayPriorities.length >= 3, true);
  assert.equal(brief.calendarHighlights[0]?.title, "Investor update");
  assert.equal(brief.calendarHighlights[0]?.prepNeeded, "20 min prep");
  assert.equal(brief.criticalEmails[0]?.group, "needs_response");
  assert.match(brief.risksAndOpenLoops[0]?.rationale ?? "", /4 days/);
  assert.ok(brief.suggestedFocusPlan);
});

test("buildMorningBriefEmail marks stale sources as limited", () => {
  const brief = buildMorningBriefEmail(
    payload({
      syncStatus: {
        gmailSyncAt: "2026-05-08T10:00:00.000Z",
        calendarSyncAt: "2026-05-10T10:58:00.000Z",
        accountsCount: 1,
        hasSyncErrors: false,
      },
    }),
    new Date("2026-05-10T11:10:00.000Z")
  );

  assert.equal(brief.dataFreshness.isLimited, true);
  assert.deepEqual(brief.dataFreshness.staleSources, ["gmail"]);
});
