export function safeTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      // Fall through to runtime locale.
    }
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function partsFor(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number.parseInt(get("hour"), 10),
    minute: Number.parseInt(get("minute"), 10),
  };
}

export function localDayKey(date: Date, timeZone: string): string {
  const p = partsFor(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHour(date: Date, timeZone: string): number {
  return partsFor(date, timeZone).hour;
}

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: safeTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function addDaysToLocalKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map((v) => Number.parseInt(v, 10));
  const d = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

export function labelLocalDayKey(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === addDaysToLocalKey(todayKey, 1)) return "Tomorrow";

  const [year, month, day] = key.split("-").map((v) => Number.parseInt(v, 10));
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  );
}
