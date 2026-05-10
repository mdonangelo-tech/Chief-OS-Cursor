import test from "node:test";
import assert from "node:assert/strict";
import { computePriorityScore, buildPriorityExplanation, type PriorityEmailInput } from "./intelligence";

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
