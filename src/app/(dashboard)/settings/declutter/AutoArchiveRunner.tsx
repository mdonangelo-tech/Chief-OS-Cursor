"use client";

import { useState } from "react";
import type { PreviewAutoArchiveResponse, RunAutoArchiveResponse } from "@/types/declutter";

export function AutoArchiveRunner() {
  const [loading, setLoading] = useState<"preview" | "runPreview" | "run" | null>(null);
  const [preview, setPreview] = useState<PreviewAutoArchiveResponse | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const blockedCount = preview?.protectedBlockedCount ?? 0;
  const requiresDoubleConfirm = (preview?.total ?? 0) > 200 || blockedCount > 0;

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function fetchPreview(mode: "preview" | "run") {
    setLoading(mode === "run" ? "runPreview" : "preview");
    try {
      const res = await fetch("/api/declutter/preview-auto-archive", { method: "GET" });
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
      const res = await fetch("/api/declutter/run-auto-archive", { method: "POST" });
      const data = (await res.json()) as RunAutoArchiveResponse | { error?: string };
      if (!res.ok || !("ok" in data)) throw new Error((data as any).error ?? "Failed");
      showToast("success", `Archived ${data.processed} email(s).`);
      setConfirmOpen(false);
      await fetchPreview("preview");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  function fmt(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-sm">
        Test the 48h rule: Preview what would be archived, or run now. Requires auto-archive On and at least one category with &quot;Archive after 48h&quot;.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fetchPreview("preview")}
          disabled={loading !== null}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading === "preview" ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          type="button"
          onClick={() => fetchPreview("run")}
          disabled={loading !== null}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {loading === "run" ? "Running…" : loading === "runPreview" ? "Loading…" : "Run auto-archive now"}
        </button>
      </div>

      {preview && (
        <div
          className={`rounded-lg border px-3 py-3 text-sm ${
            preview.total > 0
              ? "border-zinc-700 bg-zinc-900/50 text-zinc-300"
              : "border-zinc-800 bg-zinc-900/20 text-zinc-400"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs text-zinc-500">Preview</span>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs text-zinc-500 hover:text-zinc-400"
            >
              Clear
            </button>
          </div>
          {preview.total === 0 ? (
            <p>Nothing eligible to archive right now.</p>
          ) : (
            <>
              <p>
                Eligible now: <strong>{preview.total}</strong>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Range: {fmt(preview.oldestDate)} → {fmt(preview.newestDate)}
                {blockedCount > 0 ? ` · Protected blocked: ${blockedCount}` : ""}
              </p>
              {preview.byCategory.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {preview.byCategory.slice(0, 8).map((c) => (
                    <li key={c.categoryId ?? "null"} className="flex justify-between gap-4">
                      <span className="text-zinc-400 truncate">{c.categoryName}</span>
                      <span className="text-zinc-200 tabular-nums">{c.count}</span>
                    </li>
                  ))}
                  {preview.byCategory.length > 8 && (
                    <li className="text-zinc-600">+{preview.byCategory.length - 8} more</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-zinc-200 font-medium">Confirm auto-archive</div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  Eligible now: {preview.total} · Range: {fmt(preview.oldestDate)} → {fmt(preview.newestDate)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ✕
              </button>
            </div>

            {preview.total === 0 ? (
              <div className="mt-4 text-zinc-400 text-sm">Nothing eligible to archive.</div>
            ) : (
              <>
                <div className="mt-4 rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  {preview.byCategory.slice(0, 10).map((c) => (
                    <div key={c.categoryId ?? "null"} className="flex justify-between gap-4">
                      <span className="truncate text-zinc-400">{c.categoryName}</span>
                      <span className="tabular-nums">{c.count}</span>
                    </div>
                  ))}
                  {blockedCount > 0 && (
                    <div className="mt-2 text-amber-300 text-xs">
                      Protected blocked: {blockedCount}
                    </div>
                  )}
                </div>

                {requiresDoubleConfirm && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-zinc-300">
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
                disabled={loading === "run"}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runArchive}
                disabled={
                  loading === "run" ||
                  preview.total === 0 ||
                  (requiresDoubleConfirm && !confirmChecked)
                }
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {loading === "run" ? "Archiving…" : "Confirm archive"}
              </button>
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
