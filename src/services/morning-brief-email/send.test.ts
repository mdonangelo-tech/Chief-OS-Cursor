import test from "node:test";
import assert from "node:assert/strict";
import type { BriefPayload } from "@/services/brief/api-brief";
import type { MorningBriefEmailDeps } from "./send";
import { sendMorningBriefEmailForUserWithDeps } from "./send";

function payload(syncStatus: BriefPayload["syncStatus"] = {
  gmailSyncAt: "2026-05-10T10:59:00.000Z",
  calendarSyncAt: "2026-05-10T10:58:00.000Z",
  accountsCount: 1,
  hasSyncErrors: false,
}): BriefPayload {
  return {
    assembledAt: "2026-05-10T11:05:00.000Z",
    summary: {
      prioritiesCount: 0,
      openLoopsCount: 0,
      nextMeeting: null,
      calendarWatchouts: { overloadedDays: 0, earlyStarts: 0, backToBackChains: 0 },
      archivedLast24h: 0,
    },
    syncStatus,
    inboxByAccount: [],
    categories: [],
    llmStatus: { enabled: false, provider: "openai", model: "gpt-4o-mini" },
    suggestedActions: [],
    topPriorities: [],
    openLoops: [],
    calendarWatchouts: {
      summary: { overloadedDays: [], earlyStarts: [], backToBackChains: [] },
      localTodayKey: "2026-05-10",
      timeZone: "America/New_York",
      byDay: {},
    },
    digest: { summary: {}, groups: [] },
  };
}

function deps(overrides: Partial<MorningBriefEmailDeps> = {}) {
  const calls = {
    created: [] as unknown[],
    updated: [] as unknown[],
    sent: [] as unknown[],
  };
  const base: MorningBriefEmailDeps = {
    async findUserPrefs() {
      return {
        email: "mariana@example.com",
        calendarPreferences: {
          timezone: "America/New_York",
          morningBriefEmailEnabled: true,
          morningBriefEmailRecipient: null,
        },
      };
    },
    async findExistingLog() {
      return null;
    },
    async createLog(input) {
      calls.created.push(input);
      return { id: "log-1" };
    },
    async updateLog(_id, data) {
      calls.updated.push(data);
    },
    async getBriefPayload() {
      return payload();
    },
    async sendEmail(input) {
      calls.sent.push(input);
      return { success: true, messageId: "msg-1" };
    },
  };
  return { deps: { ...base, ...overrides }, calls };
}

test("sendMorningBriefEmailForUserWithDeps does not send when disabled", async () => {
  const { deps: fakeDeps, calls } = deps({
    async findUserPrefs() {
      return {
        email: "mariana@example.com",
        calendarPreferences: {
          timezone: "America/New_York",
          morningBriefEmailEnabled: false,
          morningBriefEmailRecipient: null,
        },
      };
    },
  });

  const result = await sendMorningBriefEmailForUserWithDeps(
    "user-1",
    new Date("2026-05-10T11:00:00.000Z"),
    fakeDeps
  );

  assert.equal(result.status, "disabled");
  assert.equal(calls.sent.length, 0);
});

test("sendMorningBriefEmailForUserWithDeps skips duplicates for the local day", async () => {
  const { deps: fakeDeps, calls } = deps({
    async findExistingLog() {
      return { status: "sent", providerMessageId: "existing" };
    },
  });

  const result = await sendMorningBriefEmailForUserWithDeps(
    "user-1",
    new Date("2026-05-10T11:00:00.000Z"),
    fakeDeps
  );

  assert.equal(result.status, "duplicate");
  assert.equal(calls.sent.length, 0);
});

test("sendMorningBriefEmailForUserWithDeps sends only to account email and uses idempotency", async () => {
  const { deps: fakeDeps, calls } = deps({
    async findUserPrefs() {
      return {
        email: "mariana@example.com",
        calendarPreferences: {
          timezone: "America/New_York",
          morningBriefEmailEnabled: true,
          morningBriefEmailRecipient: "other@example.com",
        },
      };
    },
  });

  const result = await sendMorningBriefEmailForUserWithDeps(
    "user-1",
    new Date("2026-05-10T11:00:00.000Z"),
    fakeDeps
  );

  assert.equal(result.status, "sent");
  const sent = calls.sent[0] as { to: string; idempotencyKey: string };
  assert.equal(sent.to, "mariana@example.com");
  assert.equal(sent.idempotencyKey, "morning-brief/user-1/2026-05-10");
});

test("sendMorningBriefEmailForUserWithDeps skips when both sources are stale", async () => {
  const { deps: fakeDeps, calls } = deps({
    async getBriefPayload() {
      return payload({
        gmailSyncAt: "2026-05-08T10:00:00.000Z",
        calendarSyncAt: "2026-05-08T10:00:00.000Z",
        accountsCount: 1,
        hasSyncErrors: false,
      });
    },
  });

  const result = await sendMorningBriefEmailForUserWithDeps(
    "user-1",
    new Date("2026-05-10T11:00:00.000Z"),
    fakeDeps
  );

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "stale_sources");
  assert.equal(calls.sent.length, 0);
});
