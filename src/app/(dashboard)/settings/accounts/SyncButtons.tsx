"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButtons() {
  const [syncing, setSyncing] = useState<"all" | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing("all");
    try {
      const res = await fetch(`/api/sync/all`, { method: "POST", keepalive: true });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
      const data = (await res.json().catch(() => null)) as
        | { hasErrors?: boolean; reconnectRequired?: boolean }
        | null;
      const status = data?.reconnectRequired ? "reconnect" : data?.hasErrors ? "warn" : "ok";
      router.push(`/settings/accounts?sync=${status}`);
      router.refresh();
    } catch (e) {
      const msg =
        (e as Error)?.message?.trim() || "Sync failed. Please try again in a minute.";
      router.push(
        `/settings/accounts?sync=error&error=${encodeURIComponent(msg)}`
      );
      router.refresh();
    } finally {
      setSyncing(null);
    }
  }

  const disabled = syncing !== null;

  return (
    <div className="flex gap-3 items-center flex-wrap">
      <button
        type="button"
        onClick={() => handleSync()}
        disabled={disabled}
        className="inline-flex rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-foreground hover:bg-surface2/60 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing === "all" ? "Syncing…" : "Sync Gmail + Calendar"}
      </button>
      <a
        href="/api/google/health"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        Test connection
      </a>
    </div>
  );
}
