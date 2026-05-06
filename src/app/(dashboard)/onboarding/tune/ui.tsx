"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-base";

type AnyQuestion = {
  id?: string;
  kind?: string;
  title?: string;
  prompt?: string;
  options?: Array<{ id?: string; label?: string }>;
  applyToAllDefault?: boolean;
};

export function OnboardingTuneClient({
  runId,
  status,
  questions,
}: {
  runId: string;
  status: string;
  questions: unknown[];
}) {
  const qs = useMemo(() => questions as AnyQuestion[], [questions]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/onboarding/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, answers }),
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
        <h1 className="text-2xl font-semibold">Tune</h1>
        <p className="text-muted-foreground mt-1">
          A few quick questions to make the scan more accurate.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Run: <span className="text-foreground/90">{runId}</span> · Status:{" "}
          <span className="text-foreground/90">{status}</span>
        </p>
      </div>

      {qs.length === 0 ? (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 text-sm text-muted-foreground shadow-soft">
          No questions needed right now.
          <div className="mt-4">
            <Link
              href={`/onboarding/insights`}
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Continue
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {qs.slice(0, 5).map((q) => (
            <div key={q.id} className="rounded-2xl border border-border/10 bg-surface/60 p-5 shadow-soft">
              <div className="font-medium text-foreground">{q.title ?? "Question"}</div>
              <div className="text-sm text-muted-foreground mt-1">{q.prompt ?? ""}</div>

              {q.kind === "single_select" && Array.isArray(q.options) && (
                <div className="mt-3 space-y-2">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-foreground/90">
                      <input
                        type="radio"
                        name={q.id}
                        value={o.id}
                        onChange={() =>
                          setAnswers((a) => ({
                            ...a,
                            [String(q.id)]: { value: o.id, applyToAll: q.applyToAllDefault ?? true },
                          }))
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}

              {q.kind === "free_text" && (
                <div className="mt-3">
                  <input
                    className="w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
                    placeholder="Type your answer…"
                    onChange={(e) =>
                      setAnswers((a) => ({
                        ...a,
                        [String(q.id)]: { value: e.target.value, applyToAll: q.applyToAllDefault ?? true },
                      }))
                    }
                  />
                </div>
              )}

              <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  defaultChecked={q.applyToAllDefault ?? true}
                  onChange={(e) => {
                    const id = String(q.id);
                    setAnswers((a) => {
                      const prev = a[id] as any;
                      return {
                        ...a,
                        [id]: { ...(prev ?? { value: null }), applyToAll: e.target.checked },
                      };
                    });
                  }}
                />
                Apply to all similar
              </label>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save answers"}
            </button>
            <Link href="/onboarding/insights" className="text-sm text-muted-foreground hover:text-foreground">
              Continue
            </Link>
          </div>
        </div>
      )}

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

