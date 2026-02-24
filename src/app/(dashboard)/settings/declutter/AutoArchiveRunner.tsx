"use client";

import { useState } from "react";

export function AutoArchiveRunner() {
  const [running, setRunning] = useState<"preview" | "run" | null>(null);
  const [result, setResult] = useState<{
    dryRun?: boolean;
    eligible: number;
    archived: number;
    skipped: number;
    errors: string[];
    items?: { from: string; subject: string | null; snippet: string | null; categoryName: string; labels: string[] }[];
  } | null>(null);

  async function handleRun(dryRun: boolean) {
    setRunning(dryRun ? "preview" : "run");
    setResult(null);
    try {
      const res = await fetch(
        `/api/declutter/auto-archive?dryRun=${dryRun}`,
        { method: "POST" }
      );
    
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(data);
    } catch (err) {
      setResult({
        dryRun: !!dryRun,
        eligible: 0,
        archived: 0,
        skipped: 0,
        errors: [(err as Error).message],
        items: [],
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-sm">
        Test the 48h rule: Preview what would be archived, or run now. Requires auto-archive On and at least one category with &quot;Archive after 48h&quot;.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleRun(true)}
          disabled={running !== null}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {running === "preview" ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          type="button"
          onClick={() => handleRun(false)}
          disabled={running !== null}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {running === "run" ? "Running…" : "Run auto-archive now"}
        </button>
      </div>
      {result && (
        <div
          className={`rounded-lg border px-3 py-3 text-sm ${
            result.errors.length > 0
              ? "border-red-800 bg-red-950/30 text-red-300"
              : "border-zinc-700 bg-zinc-900/50 text-zinc-300"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span />
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-xs text-zinc-500 hover:text-zinc-400"
            >
              Clear
            </button>
          </div>
          {result.dryRun ? (
            <p>Would archive <strong>{result.eligible}</strong> email(s) 48h+ old in archive-after-48h categories.</p>
          ) : (
            <p>Archived <strong>{result.archived}</strong> of {result.eligible} eligible. {result.skipped > 0 && `${result.skipped} skipped.`}</p>
          )}
          {result.items && result.items.length > 0 && (
            <ul className="mt-4 space-y-3">
              {result.items.map((item, i) => (
                <li key={i} className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-left">
                  <div className="font-medium text-zinc-200 truncate" title={item.subject ?? undefined}>
                    {item.subject || "(No subject)"}
                  </div>
                  <div className="text-zinc-400 text-xs mt-0.5 truncate">{item.from}</div>
                  {item.snippet && (
                    <div className="text-zinc-500 text-xs mt-1 line-clamp-2">{item.snippet}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-block rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">
                      {item.categoryName}
                    </span>
                    {item.labels.length > 0 && (
                      <span className="text-zinc-600 text-xs">
                        Labels: {item.labels.slice(0, 5).join(", ")}
                        {item.labels.length > 5 ? " …" : ""}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 text-red-400 text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
