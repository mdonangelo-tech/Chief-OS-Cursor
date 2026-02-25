"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-base";

type Goal = { key: string; label: string; enabled: boolean; notes: string | null };

export function OnboardingGoalsClient({
  initialGoals,
  initialFreeText,
}: {
  initialGoals: Goal[];
  initialFreeText: string;
}) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [freeText, setFreeText] = useState<string>(initialFreeText);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function saveAll(nextGoals: Goal[] = goals, nextFreeText: string = freeText) {
    setSaving(true);
    try {
      const res = await apiFetch("/api/onboarding/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: nextGoals, freeText: nextFreeText }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save");
      showToast("success", "Saved");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="text-zinc-400 mt-1">
          What are you optimizing for over the next 30 days?
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Suggested</h2>
          <button
            type="button"
            disabled={saving}
            onClick={() => saveAll()}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {goals.map((g) => (
            <button
              key={g.key}
              type="button"
              disabled={saving}
              onClick={() => {
                const next = goals.map((x) =>
                  x.key === g.key ? { ...x, enabled: !x.enabled } : x
                );
                setGoals(next);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                g.enabled
                  ? "border-amber-600/60 bg-amber-600/10 text-amber-200"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
              }`}
              title={g.enabled ? "Enabled" : "Disabled"}
            >
              {g.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-zinc-500">
          Tip: leave more on. We’ll learn what to dial down during the scan.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
        <h2 className="text-lg font-medium">Your words (optional)</h2>
        <textarea
          className="w-full min-h-28 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500"
          placeholder="Example: ‘Protect mornings for deep work, and make sure I never miss investors or my spouse. Keep kids logistics visible without clutter.’"
          value={freeText}
          disabled={saving}
          onChange={(e) => setFreeText(e.target.value)}
          onBlur={() => saveAll(goals, freeText)}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => saveAll()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save goals"}
          </button>
          <Link href="/onboarding/scan" className="text-sm text-zinc-400 hover:text-zinc-200">
            Continue
          </Link>
        </div>
      </div>

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
    </div>
  );
}

