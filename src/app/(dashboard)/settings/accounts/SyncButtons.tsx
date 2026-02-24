"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButtons() {
  const [syncing, setSyncing] = useState<"all" | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing("all");
    router.replace("/settings/accounts");
    try {
      const res = await fetch(`/api/sync/all`, { method: "POST" });
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
    } catch {
      router.push(`/settings/accounts?sync=error`);
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
        className="inline-flex rounded-lg border border-zinc-600 px-4 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing === "all" ? "Syncing…" : "Sync Gmail + Calendar"}
      </button>
      <a
        href="/api/google/health"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 hover:text-zinc-300 text-sm"
      >
        Test connection
      </a>
    </div>
  );
}
