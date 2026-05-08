"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SyncOutcome = "completed" | "unchanged" | "partial" | "reconnect";

export function BriefSyncControls() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setSyncing(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch("/api/sync/all", { method: "POST", keepalive: true });
      const dataUnknown = (await res.json().catch(() => ({}))) as unknown;
      const data =
        dataUnknown && typeof dataUnknown === "object"
          ? (dataUnknown as Record<string, unknown>)
          : {};

      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : `Sync failed (${res.status})`;
        throw new Error(msg);
      }

      const reconnectRequired = data.reconnectRequired === true;
      const hasErrors = data.hasErrors === true;
      const summary = data.summary && typeof data.summary === "object"
        ? (data.summary as Record<string, unknown>)
        : {};
      const changed = typeof summary.changed === "number" ? summary.changed : null;
      setOutcome(
        reconnectRequired
          ? "reconnect"
          : hasErrors
            ? "partial"
            : changed === 0
              ? "unchanged"
              : "completed"
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-busy={syncing}
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>

      {outcome === "completed" && (
        <span className="text-sm text-muted-foreground">Brief refreshed just now.</span>
      )}
      {outcome === "unchanged" && (
        <span className="text-sm text-muted-foreground">
          No new Gmail or Calendar items were imported, but your workspace was refreshed.
        </span>
      )}
      {outcome === "reconnect" && (
        <Link
          href="/settings/accounts"
          className="text-sm text-accent hover:text-accent/80"
        >
          Reconnect needed
        </Link>
      )}
      {outcome === "partial" && (
        <Link
          href="/settings/accounts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Sync partially completed
        </Link>
      )}
      {error && (
        <span className="text-sm text-muted-foreground" title={error}>
          Sync failed
        </span>
      )}
    </div>
  );
}

