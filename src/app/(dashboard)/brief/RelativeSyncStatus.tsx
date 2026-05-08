"use client";

import { useEffect, useState } from "react";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return "—";
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function RelativeSyncStatus({
  gmailSyncAt,
  calendarSyncAt,
}: {
  gmailSyncAt: string | null;
  calendarSyncAt: string | null;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((v) => v + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span title={`Gmail: ${gmailSyncAt ?? "never"} · Calendar: ${calendarSyncAt ?? "never"}`}>
      Last synced {relativeTime(gmailSyncAt)} · {relativeTime(calendarSyncAt)}
    </span>
  );
}
