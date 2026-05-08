import assert from "node:assert/strict";
import test from "node:test";
import { labelLocalDayKey, localDayKey, localHour } from "./calendar-time";

test("localDayKey respects the supplied timezone", () => {
  const instant = new Date("2026-05-08T06:30:00.000Z");

  assert.equal(localDayKey(instant, "America/Los_Angeles"), "2026-05-07");
  assert.equal(localDayKey(instant, "Asia/Tokyo"), "2026-05-08");
});

test("localHour respects the supplied timezone", () => {
  const instant = new Date("2026-05-08T14:30:00.000Z");

  assert.equal(localHour(instant, "America/Los_Angeles"), 7);
  assert.equal(localHour(instant, "Europe/Berlin"), 16);
});

test("labelLocalDayKey compares calendar keys without UTC drift", () => {
  assert.equal(labelLocalDayKey("2026-05-07", "2026-05-07"), "Today");
  assert.equal(labelLocalDayKey("2026-05-08", "2026-05-07"), "Tomorrow");
});
