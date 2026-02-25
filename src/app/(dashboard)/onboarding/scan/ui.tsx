"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-base";

type RunStatus = "queued" | "running" | "complete" | "failed";

type Run = {
  id: string;
  status: RunStatus;
  createdAt: string;
  completedAt: string | null;
  accountIds: string[];
  resultsJson: unknown;
  error: string | null;
};

type GetRunResp =
  | { ok: true; run: Run }
  | { ok: false; error: string; requestId?: string };

export function OnboardingScanClient({ initialRunId }: { initialRunId: string | null }) {
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState<"start" | "poll" | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );
  const stopRef = useRef(false);
  const statusRef = useRef<RunStatus | null>(null);

  const phase = useMemo(() => {
    const s = run?.status ?? (runId ? "queued" : null);
    if (!s) return "idle";
    if (s === "queued") return "queued";
    if (s === "running") return "running";
    if (s === "complete") return "complete";
    return "failed";
  }, [run?.status, runId]);

  const progressMessage = useMemo(() => {
    const p = (run?.resultsJson as any)?.progress;
    if (!p || typeof p !== "object") return null;
    return typeof p.message === "string" ? p.message : null;
  }, [run?.resultsJson]);

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function startRun() {
    setLoading("start");
    try {
      const res = await apiFetch("/api/onboarding/run", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; runId?: string; error?: string };
      if (!res.ok || !data.ok || !data.runId) throw new Error(data.error ?? "Failed to start");
      setRunId(data.runId);
      // Keep URL shareable
      window.history.replaceState(null, "", `/onboarding/scan?runId=${encodeURIComponent(data.runId)}`);
      showToast("success", "Scan started");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function fetchRun(id: string) {
    setLoading("poll");
    try {
      const res = await apiFetch(`/api/onboarding/run/${encodeURIComponent(id)}`, { method: "GET" });
      const data = (await res.json()) as GetRunResp;
      if (!res.ok || !data.ok) throw new Error((data as any).error ?? "Failed to load run");
      setRun(data.run);
      statusRef.current = data.run.status;
      if (data.run.status === "complete") showToast("success", "Scan complete");
      if (data.run.status === "failed") showToast("error", data.run.error ?? "Scan failed");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    stopRef.current = false;
    if (!runId) return;

    let t: number | null = null;
    const loop = async () => {
      if (stopRef.current) return;
      await fetchRun(runId);
      if (stopRef.current) return;

      const s = statusRef.current;
      if (s === "complete" || s === "failed") return;
      t = window.setTimeout(loop, 1500);
    };

    void loop();
    return () => {
      stopRef.current = true;
      if (t) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scan</h1>
        <p className="text-zinc-400 mt-1">
          We’ll scan the last 30 days across email + calendar (all included accounts by default).
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
        <div className="text-sm text-zinc-400">
          Status:{" "}
          <strong className="text-zinc-200">
            {phase === "idle"
              ? "Not started"
              : phase === "queued"
                ? "Queued"
                : phase === "running"
                  ? "Running"
                  : phase === "complete"
                    ? "Complete"
                    : "Failed"}
          </strong>
        </div>

        {progressMessage && (
          <div className="text-sm text-zinc-400">{progressMessage}</div>
        )}

        {run && (
          <div className="text-xs text-zinc-500 space-y-1">
            <div>Run ID: {run.id}</div>
            <div>Accounts in run: {run.accountIds.length}</div>
            {run.completedAt && <div>Completed: {new Date(run.completedAt).toLocaleString()}</div>}
          </div>
        )}

        <div className="flex items-center gap-3">
          {!runId ? (
            <button
              type="button"
              onClick={startRun}
              disabled={loading !== null}
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              {loading === "start" ? "Starting…" : "Start scan"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fetchRun(runId)}
              disabled={loading !== null}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading === "poll" ? "Refreshing…" : "Refresh"}
            </button>
          )}

          <Link
            href="/onboarding/goals"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Back
          </Link>

          <Link
            href={runId ? `/onboarding/tune?runId=${encodeURIComponent(runId)}` : "/onboarding/insights"}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            Continue
          </Link>
        </div>

        <div className="text-xs text-zinc-500">
          Keep this tab open while it runs. This is a cooperative poll-driven job (serverless-friendly).
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

