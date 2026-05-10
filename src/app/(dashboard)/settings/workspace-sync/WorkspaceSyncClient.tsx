"use client";

import { useMemo, useState } from "react";

type RefreshMode = "morning_prep" | "smart_periodic" | "manual";

function getLocalParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
  };
}

function minutesSinceMidnight(h: number, m: number) {
  return h * 60 + m;
}

function parseHHMM(s: string): { h: number; m: number } | null {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { h: hh, m: mm };
}

function estimateUtcForLocalTime(
  timeZone: string,
  localHHMM: string,
  referenceUtcDate: Date
): Date | null {
  const hm = parseHHMM(localHHMM);
  if (!hm) return null;

  // Get the local date (Y-M-D) for the reference date in the target time zone.
  const refLocal = getLocalParts(referenceUtcDate, timeZone);

  // Initial guess: interpret the local time as if it were UTC on that Y-M-D.
  let guess = new Date(Date.UTC(refLocal.year, refLocal.month - 1, refLocal.day, hm.h, hm.m, 0, 0));

  // Iteratively adjust until the formatted local time matches the desired local time.
  for (let i = 0; i < 3; i++) {
    const got = getLocalParts(guess, timeZone);
    const gotMin = minutesSinceMidnight(got.hour, got.minute);
    const wantMin = minutesSinceMidnight(hm.h, hm.m);
    let delta = gotMin - wantMin;
    // Handle midnight wrap (keep delta small).
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    if (delta === 0) break;
    guess = new Date(guess.getTime() - delta * 60_000);
  }
  return guess;
}

function recommendCronSchedule(timeZone: string, localHHMM: string) {
  const year = new Date().getUTCFullYear();
  // Sample winter vs summer to detect DST shift.
  const winterRef = new Date(Date.UTC(year, 0, 15, 12, 0, 0));
  const summerRef = new Date(Date.UTC(year, 6, 15, 12, 0, 0));
  const winterUtc = estimateUtcForLocalTime(timeZone, localHHMM, winterRef);
  const summerUtc = estimateUtcForLocalTime(timeZone, localHHMM, summerRef);
  const fmt = (d: Date | null) =>
    d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC` : "—";
  return {
    winter: fmt(winterUtc),
    summer: fmt(summerUtc),
  };
}

export function WorkspaceSyncClient({
  initialTimezone,
  initialMorningPrepLocalTime,
  initialUserEmail,
  initialMorningBriefEmailEnabled,
  initialMorningBriefEmailRecipient,
  initialRefreshMode,
  initialPeriodicRefreshHours,
}: {
  initialTimezone: string | null;
  initialMorningPrepLocalTime: string | null;
  initialUserEmail: string | null;
  initialMorningBriefEmailEnabled: boolean;
  initialMorningBriefEmailRecipient: string | null;
  initialRefreshMode: RefreshMode | null;
  initialPeriodicRefreshHours: number | null;
}) {
  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  }, []);

  const [timezone, setTimezone] = useState<string>(
    initialTimezone ?? browserTz ?? ""
  );
  const [morningTime, setMorningTime] = useState<string>(
    initialMorningPrepLocalTime ?? "07:00"
  );
  const [morningBriefEmailEnabled, setMorningBriefEmailEnabled] = useState(
    initialMorningBriefEmailEnabled
  );
  const [morningBriefEmailRecipient, setMorningBriefEmailRecipient] = useState(
    initialMorningBriefEmailRecipient ?? initialUserEmail ?? ""
  );
  const [mode, setMode] = useState<RefreshMode>(initialRefreshMode ?? "morning_prep");
  const [periodicHours, setPeriodicHours] = useState<number>(initialPeriodicRefreshHours ?? 3);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cron = useMemo(() => {
    if (!timezone.trim()) return null;
    return recommendCronSchedule(timezone.trim(), morningTime);
  }, [timezone, morningTime]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings/workspace-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timezone: timezone.trim() || null,
          morningPrepLocalTime: morningTime.trim() || null,
          refreshMode: mode,
          periodicRefreshHours: mode === "smart_periodic" ? periodicHours : null,
          morningBriefEmailEnabled,
          morningBriefEmailRecipient: morningBriefEmailRecipient.trim() || initialUserEmail || null,
        }),
      });
      const dataUnknown = (await res.json().catch(() => ({}))) as unknown;
      const data =
        dataUnknown && typeof dataUnknown === "object"
          ? (dataUnknown as Record<string, unknown>)
          : {};
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : `Save failed (${res.status})`);
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 shadow-soft space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <div className="text-xs text-muted-foreground">Timezone (IANA)</div>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/Los_Angeles"
            className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
          />
          <div className="text-xs text-muted-foreground/70">
            Used to interpret “7:00am local” for cron guidance.
          </div>
        </label>

        <label className="space-y-1">
          <div className="text-xs text-muted-foreground">Morning prep time (local)</div>
          <input
            type="time"
            value={morningTime}
            onChange={(e) => setMorningTime(e.target.value)}
            className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
          />
          <div className="text-xs text-muted-foreground/70">
            ChiefOS aims to be ready before you arrive.
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <div className="text-xs text-muted-foreground">Refresh mode</div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as RefreshMode)}
            className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="morning_prep">Morning prep only</option>
            <option value="smart_periodic">Smart periodic updates</option>
            <option value="manual">Manual only</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-xs text-muted-foreground">Periodic cadence</div>
          <select
            value={periodicHours}
            onChange={(e) => setPeriodicHours(parseInt(e.target.value, 10))}
            disabled={mode !== "smart_periodic"}
            className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
          >
            <option value={1}>Every 1 hour</option>
            <option value={3}>Every 3 hours</option>
            <option value={6}>Every 6 hours</option>
          </select>
          <div className="text-xs text-muted-foreground/70">
            {mode === "smart_periodic"
              ? "Not real-time; just a lightweight freshness baseline."
              : "Enable Smart periodic updates to use this."}
          </div>
        </label>
      </div>

      <div className="rounded-xl bg-muted/60 px-4 py-3">
        <div className="text-xs text-muted-foreground">Schedule guidance</div>
        {cron ? (
          <div className="text-sm text-foreground/90 mt-1">
            For {timezone.trim()} at {morningTime}: winter roughly <span className="font-medium">{cron.winter}</span>, summer roughly{" "}
            <span className="font-medium">{cron.summer}</span>.
          </div>
        ) : (
          <div className="text-sm text-muted-foreground mt-1">Set a timezone to see the UTC conversion.</div>
        )}
        <div className="text-xs text-muted-foreground/70 mt-2">
          Daylight saving time can shift automated updates. Use this as a best-fit schedule check.
        </div>
      </div>

      <div className="rounded-xl border border-border/10 bg-background/60 px-4 py-3 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={morningBriefEmailEnabled}
            onChange={(e) => setMorningBriefEmailEnabled(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Email my Morning Brief</span>
            <span className="block text-xs text-muted-foreground/80 mt-0.5">
              Send one concise strategic summary after the morning refresh completes.
            </span>
          </span>
        </label>

        <label className="block space-y-1">
          <div className="text-xs text-muted-foreground">Recipient</div>
          <input
            type="email"
            value={morningBriefEmailRecipient}
            onChange={(e) => setMorningBriefEmailRecipient(e.target.value)}
            placeholder={initialUserEmail ?? "you@example.com"}
            className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
          />
          <div className="text-xs text-muted-foreground/70">
            For the MVP, ChiefOS only sends to your signed-in account email
            {initialUserEmail ? ` (${initialUserEmail})` : ""}.
          </div>
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        {error && <span className="text-sm text-muted-foreground" title={error}>Save failed</span>}
      </div>
    </div>
  );
}

