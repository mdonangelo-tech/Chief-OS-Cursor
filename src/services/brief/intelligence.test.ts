import test from "node:test";
import assert from "node:assert/strict";
import {
  computePriorityScore,
  buildPriorityExplanation,
  selectTopPriorities,
  type PriorityEmailInput,
} from "./intelligence";

const baseOpts = {
  excludePriorityCategories: ["Newsletters", "Promotions", "Low-priority"],
  boostCategories: ["Work"],
};

const baseEmail: PriorityEmailInput = {
  id: "1",
  unread: true,
  importanceScore: 0.9,
  needsAction: true,
  actionType: "reply",
  confidence: 0.9,
  categoryName: "Work",
  fromEmail: "a@example.com",
  senderDomain: "example.com",
};

test("computePriorityScore returns 0 when thread is snoozed until future", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const score = computePriorityScore(
    { ...baseEmail, threadSnoozeUntil: future },
    { ...baseOpts, nowMs: Date.now() }
  );
  assert.equal(score, 0);
});

test("computePriorityScore applies sender penalty from ranking profile", () => {
  const score = computePriorityScore(
    { ...baseEmail, needsAction: false, importanceScore: 0.7, unread: true },
    {
      ...baseOpts,
      nowMs: Date.now(),
      rankingPenalties: { bySender: { "a@example.com": 0.5 } },
    }
  );
  assert.ok(score < 0.5, `expected reduced score, got ${score}`);
});

test("buildPriorityExplanation mentions learned downrank when penalties apply", () => {
  const ex = buildPriorityExplanation(
    { ...baseEmail, needsAction: false, importanceScore: 0.5, unread: true },
    {
      ...baseOpts,
      nowMs: Date.now(),
      rankingPenalties: { byDomain: { "example.com": 0.4 } },
    }
  );
  assert.ok(
    ex.signals.includes("learned:domain_downrank"),
    `signals: ${ex.signals.join(",")}`
  );
});

const facebookNotification: PriorityEmailInput = {
  id: "fb1",
  unread: true,
  importanceScore: 0.7,
  needsAction: false,
  actionType: "read",
  confidence: 1,
  categoryName: "Notifications",
  fromEmail: "friendupdates@facebookmail.com",
  senderDomain: "facebookmail.com",
  labels: ["CATEGORY_SOCIAL", "INBOX"],
  subject: "Mariana, you have new reel activity",
  snippet: "Your friend commented on a reel.",
};

test("repeated not-important feedback suppresses future Facebook social notifications", () => {
  const score = computePriorityScore(facebookNotification, {
    ...baseOpts,
    rankingPenalties: {
      bySender: { "friendupdates@facebookmail.com": 0.34 },
      byDomain: { "facebookmail.com": 0.22 },
      byPattern: { "facebookmail.com:social_notification": 0.38 },
    },
  });

  assert.equal(score, 0);
});

test("domain and pattern learning suppresses Facebook sender variants", () => {
  const selected = selectTopPriorities(
    [
      {
        ...facebookNotification,
        id: "fb-variant",
        fromEmail: "groupupdates@facebookmail.com",
        subject: "New activity in a Facebook group",
      },
    ],
    {
      ...baseOpts,
      maxPriorities: 5,
      rankingPenalties: {
        bySender: { "groupupdates@facebookmail.com": 0.1 },
        byDomain: { "facebookmail.com": 0.5 },
        byPattern: { "facebookmail.com:social_notification": 0.38 },
      },
    }
  );

  assert.deepEqual(selected, []);
});

test("learned notification suppression can override low-signal needsAction classification", () => {
  const score = computePriorityScore(
    { ...facebookNotification, needsAction: true, actionType: "read", importanceScore: 0.9 },
    {
      ...baseOpts,
      rankingPenalties: {
        byPattern: { "facebookmail.com:social_notification": 0.38 },
      },
    }
  );

  assert.equal(score, 0);
});

test("security/account emails are preserved despite Facebook domain suppression", () => {
  const selected = selectTopPriorities(
    [
      {
        ...facebookNotification,
        id: "fb-security",
        fromEmail: "security@facebookmail.com",
        subject: "Security alert: new login to your Facebook account",
        snippet: "Review this login and reset your password if it was not you.",
        needsAction: true,
        actionType: "read",
        importanceScore: 0.9,
      },
    ],
    {
      ...baseOpts,
      maxPriorities: 5,
      rankingPenalties: {
        byDomain: { "facebookmail.com": 0.85 },
        byPattern: { "facebookmail.com:social_notification": 0.95 },
      },
    }
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "fb-security");
});

test("protected social-label account emails bypass low-signal notification filtering", () => {
  const selected = selectTopPriorities(
    [
      {
        ...facebookNotification,
        id: "fb-protected-social",
        fromEmail: "security@facebookmail.com",
        subject: "Security alert: new login to your Facebook account",
        snippet: "Review this login and reset your password if it was not you.",
        needsAction: false,
        importanceScore: 0.7,
      },
    ],
    {
      ...baseOpts,
      maxPriorities: 5,
      rankingPenalties: {
        byDomain: { "facebookmail.com": 0.85 },
        byPattern: { "facebookmail.com:social_notification": 0.95 },
      },
    }
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "fb-protected-social");
});

test("category-only notification learning does not suppress unrelated notifications", () => {
  const score = computePriorityScore(
    {
      ...baseEmail,
      id: "school-notification",
      categoryName: "Notifications",
      fromEmail: "alerts@hackleyschool.org",
      senderDomain: "hackleyschool.org",
      needsAction: false,
      actionType: "read",
      importanceScore: 0.9,
      subject: "School schedule update",
      snippet: "Please review the updated pickup schedule.",
    },
    {
      ...baseOpts,
      rankingPenalties: {
        byCategory: { notifications: 0.65 },
      },
    }
  );

  assert.ok(score >= 0.6, `expected unrelated notification to remain eligible, got ${score}`);
});

test("priority explanation names pattern-based learned downranking", () => {
  const ex = buildPriorityExplanation(facebookNotification, {
    ...baseOpts,
    rankingPenalties: {
      byPattern: { "facebookmail.com:social_notification": 0.38 },
    },
  });

  assert.ok(ex.signals.includes("learned:pattern_downrank"), ex.signals.join(","));
  assert.match(ex.summary ?? "", /not important/i);
});
