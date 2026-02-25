import assert from "node:assert/strict";
import test from "node:test";

import { appendUndo } from "./undo-snapshot";
import { stableActionId, markApplied } from "./recommendations";

test("appendUndo merges created/updated entries", () => {
  const a = appendUndo(null, { createdIds: [{ model: "OrgRule", id: "1" }] }) as any;
  const b = appendUndo(a, {
    updated: [{ model: "UserCalendarPreferences", id: "c1", before: { x: 1 }, after: { x: 2 } }],
  }) as any;

  assert.equal(b.createdIds.length, 1);
  assert.equal(b.updated.length, 1);
  assert.equal(b.createdIds[0].model, "OrgRule");
  assert.equal(b.updated[0].model, "UserCalendarPreferences");
});

test("stableActionId is deterministic for same payload", () => {
  const id1 = stableActionId("ORG_RULE", { domain: "example.com", categoryName: "Newsletters" });
  const id2 = stableActionId("ORG_RULE", { domain: "example.com", categoryName: "Newsletters" });
  assert.equal(id1, id2);
});

test("markApplied is idempotent", () => {
  const base: any = {};
  const a1 = markApplied(base, "x");
  assert.equal(a1.alreadyApplied, false);
  const a2 = markApplied(a1.next, "x");
  assert.equal(a2.alreadyApplied, true);
});

