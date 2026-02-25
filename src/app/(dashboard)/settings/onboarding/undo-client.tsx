"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-base";

export function SettingsOnboardingUndoClient({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function undo() {
    if (!confirm("Undo onboarding changes for the last run? This will revert applied rules/prefs.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/onboarding/undo/${encodeURIComponent(runId)}`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Undo failed");
      showToast("success", "Undone");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={undo}
        className="rounded-lg border border-red-800 bg-red-950/20 px-4 py-2 text-sm text-red-200 hover:bg-red-950/40 disabled:opacity-50"
      >
        {loading ? "Undoing…" : "Undo onboarding changes"}
      </button>
      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-2 text-sm shadow-lg ${
            toast.kind === "success"
              ? "bg-emerald-900/80 text-emerald-200 border border-emerald-700"
              : "bg-red-950/80 text-red-200 border border-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

