"use client";

import { useRef, useState } from "react";
import type { PreviewAutoArchiveResponse, RunAutoArchiveResponse } from "@/types/declutter";
import { apiFetch } from "@/lib/api-base";

export function AutoArchiveRunner() {
  const [loading, setLoading] = useState<"preview" | "runPreview" | "run" | "runAll" | null>(null);
  const [preview, setPreview] = useState<PreviewAutoArchiveResponse | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const stopAllRef = useRef(false);
  const [horizonDays, setHorizonDays] = useState<number>(2);

  const blockedCount = preview?.protectedBlockedCount ?? 0;
  const requiresDoubleConfirm = (preview?.total ?? 0) > 200 || blockedCount > 0;

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function fetchPreview(mode: "preview" | "run") {
    setLoading(mode === "run" ? "runPreview" : "preview");
    try {
      const previewHorizonDays = mode === "run" ? 0 : horizonDays;
      const res = await apiFetch(
        `/api/declutter/preview-auto-archive?horizonDays=${encodeURIComponent(String(previewHorizonDays))}`,
        { method: "GET" }
      );
      const data = (await res.json()) as PreviewAutoArchiveResponse | { error?: string };
      if (!res.ok || !("ok" in data)) throw new Error((data as any).error ?? "Failed");
      setPreview(data as PreviewAutoArchiveResponse);
      if (mode === "run") {
        setConfirmChecked(false);
        setConfirmOpen(true);
      }
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function runArchive() {
    setLoading("run");
    try {
      const res = await apiFetch("/api/declutter/run-auto-archive", { method: "POST" });
      const data = (await res.json()) as RunAutoArchiveResponse | { error?: string };
      if (!res.ok || !("ok" in data)) throw new Error((data as any).error ?? "Failed");
      showToast(
        "success",
        `Archived ${data.processed}. ${data.remainingEligible} still eligible — run again to continue.`
      );
      setConfirmOpen(false);
      await fetchPreview("preview");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function runArchiveAll() {
    setLoading("runAll");
    stopAllRef.current = false;
    try {
      let totalProcessed = 0;
      let remaining = preview?.total ?? null;
      let batches = 0;
      const MAX_BATCHES = 50; // safety: up to 50k per click

      while (!stopAllRef.current && batches < MAX_BATCHES) {
        const res = await apiFetch("/api/declutter/run-auto-archive", { method: "POST" });
        const data = (await res.json()) as RunAutoArchiveResponse | { error?: string };
        if (!res.ok || !("ok" in data)) throw new Error((data as any).error ?? "Failed");
        totalProcessed += data.processed;
        remaining = data.remainingEligible;
        batches++;

        if (data.processed === 0 || data.remainingEligible === 0) break;
      }

      showToast(
        "success",
        stopAllRef.current
          ? `Archived ${totalProcessed}. Stopped with ${remaining ?? "?"} still eligible.`
          : `Archived ${totalProcessed}. ${remaining ?? 0} still eligible — run again to continue.`
      );
      setConfirmOpen(false);
      await fetchPreview("preview");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
      stopAllRef.current = false;
    }
  }

  function fmt(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Preview what will be eligible under your auto-archive rules. Running archives only what’s eligible <strong>right now</strong> (and records everything in Audit).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="rounded-xl border border-border/10 bg-background px-3 py-1.5 text-sm text-foreground"
            aria-label="Preview window"
          >
            <option value={2}>Next 48 hours</option>
            <option value={7}>Next 7 days</option>
            <option value={30}>Next 30 days</option>
          </select>
          <input
            type="number"
            min={0}
            max={365}
            value={horizonDays}
            onChange={(e) =>
              setHorizonDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))
            }
            className="w-20 rounded-xl border border-border/10 bg-background px-3 py-1.5 text-sm text-foreground"
            aria-label="Custom preview days"
          />
        </div>
        <button
          type="button"
          onClick={() => fetchPreview("preview")}
          disabled={loading !== null}
          className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-foreground hover:bg-surface2/60 disabled:opacity-50"
        >
          {loading === "preview" ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          type="button"
          onClick={() => fetchPreview("run")}
          disabled={loading !== null}
          className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading === "run" ? "Archiving…" : loading === "runPreview" ? "Loading…" : "Archive all eligible"}
        </button>
      </div>

      {preview && (
        <div
          className={`rounded-lg border px-3 py-3 text-sm ${
            preview.total > 0
              ? "border-border/10 bg-surface/60 text-foreground/90 shadow-soft"
              : "border-border/10 bg-surface/40 text-muted-foreground"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Preview</span>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          {preview.total === 0 ? (
            <p>Nothing eligible to archive right now.</p>
          ) : (
            <>
              <p>
                Eligible by preview window: <strong>{preview.total}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <span
                  className="underline decoration-dotted"
                  title="These are the received dates of emails currently eligible to be archived by this rule."
                >
                  Eligible email dates
                </span>
                : {fmt(preview.oldestDate)} → {fmt(preview.newestDate)}
                {blockedCount > 0 ? ` · Protected blocked: ${blockedCount}` : ""}
              </p>
              {preview.byCategory.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {preview.byCategory.slice(0, 8).map((c) => (
                    <li key={c.categoryId ?? "null"} className="flex justify-between gap-4">
                      <span className="text-muted-foreground truncate">{c.categoryName}</span>
                      <span className="text-foreground tabular-nums">{c.count}</span>
                    </li>
                  ))}
                  {preview.byCategory.length > 8 && (
                    <li className="text-muted-foreground/70">+{preview.byCategory.length - 8} more</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl border border-border/10 bg-surface p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-foreground font-medium">Confirm auto-archive</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Eligible now: {preview.total} ·{" "}
                  <span
                    className="underline decoration-dotted"
                    title="These are the received dates of emails currently eligible to be archived by this rule."
                  >
                    Eligible email dates
                  </span>
                  : {fmt(preview.oldestDate)} → {fmt(preview.newestDate)}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  ChiefOS archives in safe batches and records everything in Audit.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            {preview.total === 0 ? (
              <div className="mt-4 text-muted-foreground text-sm">Nothing eligible to archive.</div>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground/90">
                  {preview.byCategory.slice(0, 10).map((c) => (
                    <div key={c.categoryId ?? "null"} className="flex justify-between gap-4">
                      <span className="truncate text-muted-foreground">{c.categoryName}</span>
                      <span className="tabular-nums">{c.count}</span>
                    </div>
                  ))}
                  {blockedCount > 0 && (
                    <div className="mt-2 text-muted-foreground text-xs">
                      Protected blocked: {blockedCount}
                    </div>
                  )}
                </div>

                {requiresDoubleConfirm && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-foreground/90">
                    <input
                      type="checkbox"
                      checked={confirmChecked}
                      onChange={(e) => setConfirmChecked(e.target.checked)}
                      className="mt-1"
                    />
                    <span>I understand</span>
                  </label>
                )}
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loading === "run" || loading === "runAll"}
                className="rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface2/60 disabled:opacity-50"
              >
                Cancel
              </button>
              {loading === "runAll" ? (
                <button
                  type="button"
                  onClick={() => {
                    stopAllRef.current = true;
                  }}
                  className="rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface2/60"
                >
                  Stop
                </button>
              ) : null}
              <button
                type="button"
                onClick={runArchiveAll}
                disabled={
                  loading === "run" ||
                  loading === "runAll" ||
                  preview.total === 0 ||
                  (requiresDoubleConfirm && !confirmChecked)
                }
                className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading === "runAll" ? "Archiving all…" : "Archive all eligible"}
              </button>
              <details className="ml-2">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
                  Advanced
                </summary>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={runArchive}
                    disabled={
                      loading === "run" ||
                      loading === "runAll" ||
                      preview.total === 0 ||
                      (requiresDoubleConfirm && !confirmChecked)
                    }
                    className="rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface2/60 disabled:opacity-50"
                    title="Processes a limited batch per click"
                  >
                    {loading === "run" ? "Archiving…" : "Archive a batch"}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-sm ${
            toast.kind === "success"
              ? "border-emerald-800 bg-emerald-950/60 text-emerald-200"
              : "border-red-800 bg-red-950/60 text-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
