"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-base";

type Goal = { key: string; label: string; enabled: boolean; notes: string | null };

export function OnboardingGoalsClient({
  initialGoals,
  initialFreeText,
  mode = "onboarding",
}: {
  initialGoals: Goal[];
  initialFreeText: string;
  mode?: "onboarding" | "settings";
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
        <h1 className="text-2xl font-semibold">
          {mode === "settings" ? "Personal context" : "Goals"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {mode === "settings"
            ? "What are you optimizing for right now? This helps ChiefOS prioritize your Brief."
            : "What are you optimizing for over the next 30 days?"}
        </p>
      </div>

      <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Suggested</h2>
          <button
            type="button"
            disabled={saving}
            onClick={() => saveAll()}
            className="rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface2/60 disabled:opacity-50"
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
                  ? "border-accent/40 bg-accent/15 text-foreground"
                  : "border-border/10 bg-surface/50 text-muted-foreground hover:bg-surface2/60 hover:text-foreground"
              }`}
              title={g.enabled ? "Enabled" : "Disabled"}
            >
              {g.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: leave more on. We’ll learn what to dial down during the scan.
        </p>
      </div>

      <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
        <h2 className="text-lg font-medium">Your words (optional)</h2>
        <textarea
          className="w-full min-h-28 rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
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
            className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save goals"}
          </button>
          {mode === "onboarding" && (
            <Link href="/onboarding/scan" className="text-sm text-muted-foreground hover:text-foreground">
              Continue
            </Link>
          )}
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

