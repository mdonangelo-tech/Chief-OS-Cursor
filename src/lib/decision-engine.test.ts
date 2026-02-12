// src/lib/decision-engine.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { decideEmail, DecideEmailContext } from "./decision-engine";

const baseCtx = (): DecideEmailContext => ({
  now: new Date("2026-02-11T12:00:00Z"),
  personRuleCategoryId: null,
  domainRuleCategoryId: null,
  llmCategoryId: null,
  defaultCategoryId: "other",
  categoryById: {
    other: { id: "other", name: "Other", declutterPolicy: { action: "LABEL_ONLY" } },
    newsletters: { id: "newsletters", name: "Newsletters", declutterPolicy: { action: "ARCHIVE_AFTER_48H" } },
    work: { id: "work", name: "Work", protected: true, declutterPolicy: { action: "ARCHIVE_AFTER_N_DAYS", days: 2 } },
  },
});

test("precedence: person rule beats domain rule", () => {
  const ctx = baseCtx();
  ctx.personRuleCategoryId = "newsletters";
  ctx.domainRuleCategoryId = "other";

  const res = decideEmail({ id: "e1", date: new Date("2026-02-10T00:00:00Z") }, ctx);
  assert.equal(res.finalCategoryId, "newsletters");
  assert.equal(res.reason.winner, "PERSON_RULE");
});

test("default fallback used when no candidates", () => {
  const ctx = baseCtx();
  const res = decideEmail({ id: "e1", date: new Date("2026-02-10T00:00:00Z") }, ctx);
  assert.equal(res.finalCategoryId, "other");
  assert.equal(res.action, "LABEL_ONLY");
});

test("protected category blocks archive, downgrades to LABEL_ONLY", () => {
  const ctx = baseCtx();
  ctx.personRuleCategoryId = "work"; // protected + would archive after N days

  const res = decideEmail({ id: "e1", date: new Date("2026-02-10T00:00:00Z") }, ctx);
  assert.equal(res.finalCategoryId, "work");
  assert.equal(res.action, "LABEL_ONLY");
  assert.equal(res.archiveAt, null);
  assert.equal(res.reason.overrides.length, 1);
});
