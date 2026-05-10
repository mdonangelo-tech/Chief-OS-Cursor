import test from "node:test";
import assert from "node:assert/strict";
import { renderMorningBriefEmail } from "./render";
import type { MorningBriefEmail } from "./types";

const brief: MorningBriefEmail = {
  date: "2026-05-10",
  timezone: "America/New_York",
  openingSummary: "Today is focused around one sensitive reply and a prep-heavy meeting.",
  todayPriorities: [
    {
      title: "Reply to <Partner>",
      rationale: "The thread needs a decision & response today.",
      suggestedAction: "Send a short reply.",
      confidence: "high",
    },
  ],
  calendarHighlights: [
    {
      time: "10:00 AM",
      title: "Investor update",
      rationale: "Likely needs prep.",
      prepNeeded: "20 min prep",
    },
  ],
  criticalEmails: [
    {
      group: "needs_response",
      sender: "Partner <partner@example.com>",
      title: "Board materials",
      rationale: "Materials are due today.",
      suggestedAction: "Reply.",
    },
  ],
  risksAndOpenLoops: [
    {
      title: "Reply overdue",
      rationale: "A thread has been quiet for 4 days.",
    },
  ],
  suggestedFocusPlan: "Handle urgent replies before meetings.",
  dataFreshness: {
    gmailSyncAt: "2026-05-10T10:59:00.000Z",
    calendarSyncAt: "2026-05-10T10:58:00.000Z",
    hasSyncErrors: false,
    isLimited: false,
    staleSources: [],
  },
  generatedAt: "2026-05-10T11:05:00.000Z",
};

test("renderMorningBriefEmail escapes dynamic HTML and includes CTAs", () => {
  const rendered = renderMorningBriefEmail(brief, {
    briefUrl: "https://chief-os.ai/brief",
    settingsUrl: "https://chief-os.ai/settings/workspace-sync",
  });

  assert.match(rendered.subject, /Morning Brief/);
  assert.match(rendered.html, /Reply to &lt;Partner&gt;/);
  assert.doesNotMatch(rendered.html, /Reply to <Partner>/);
  assert.match(rendered.html, /Open live Brief/);
  assert.match(rendered.html, /Settings → Brief freshness/);
  assert.match(rendered.text, /Open live Brief: https:\/\/chief-os.ai\/brief/);
});
