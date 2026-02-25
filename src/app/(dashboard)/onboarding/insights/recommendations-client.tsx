"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-base";

type Rec = {
  actionId: string;
  type: string;
  title: string;
  reason: string;
  payload: any;
  applied?: boolean;
  appliedAt?: string | null;
};

export function OnboardingRecommendationsClient({
  runId,
  initialRecommendations,
}: {
  runId: string;
  initialRecommendations: unknown[];
}) {
  const initial = useMemo(
    () =>
      (initialRecommendations as Rec[]).filter(
        (r) => r && typeof r === "object" && typeof (r as any).actionId === "string"
      ),
    [initialRecommendations]
  );
  const [recs, setRecs] = useState<Rec[]>(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  function previewFor(r: Rec): { label: string; href: string } | null {
    if (r.type === "DECLUTTER_CATEGORY_RULE") {
      const action = String(r.payload?.action ?? "");
      if (action === "archive_after_48h") return { label: "Preview", href: "/settings/declutter" };
      if (action === "archive_after_days") return { label: "Preview", href: "/settings/declutter" };
      return { label: "Preview", href: "/settings/declutter" };
    }
    if (r.type === "ORG_RULE" || r.type === "PERSON_RULE") {
      return { label: "Preview decisions", href: "/settings/declutter/preview" };
    }
    return null;
  }

  async function apply(actionId: string) {
    setLoadingId(actionId);
    try {
      const res = await apiFetch("/api/onboarding/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, actionId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; noop?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Apply failed");

      setRecs((prev) =>
        prev.map((r) =>
          r.actionId === actionId ? { ...r, applied: true, appliedAt: new Date().toISOString() } : r
        )
      );
      showToast("success", data.noop ? "Already applied" : "Applied");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  if (recs.length === 0) {
    return <div className="text-sm text-zinc-500">No actions to apply.</div>;
  }

  return (
    <div className="space-y-3">
      {recs.map((r) => {
        const preview = previewFor(r);
        return (
          <div
            key={r.actionId}
            className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-200">{r.title}</div>
                <div className="text-sm text-zinc-400 mt-1">{r.reason}</div>
                <div className="text-xs text-zinc-600 mt-2">Action: {r.actionId}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {r.applied ? (
                  <span className="text-xs text-emerald-400">✓ Applied</span>
                ) : (
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => apply(r.actionId)}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white font-medium hover:bg-amber-500 disabled:opacity-50"
                  >
                    {loadingId === r.actionId ? "Applying…" : "Apply"}
                  </button>
                )}
                {preview && (
                  <a
                    href={preview.href}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline decoration-dotted"
                  >
                    {preview.label}
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}

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

