"use client";

import { useState } from "react";
import Link from "next/link";

const DAY_OPTIONS = [7, 14, 30, 60, 90];

export function ArchiveByDaysRunner() {
  const [days, setDays] = useState(30);
  const [running, setRunning] = useState<"preview" | "run" | null>(null);
  const [result, setResult] = useState<{
    dryRun?: boolean;
    eligible: number;
    archived: number;
    runId?: string | null;
    errors: string[];
    items?: { from: string; subject: string | null; categoryName: string; date: string }[];
  } | null>(null);

  async function handleRun(dryRun: boolean) {
    setRunning(dryRun ? "preview" : "run");
    setResult(null);
    try {
      const res = await fetch(
        `/api/declutter/archive-by-days?days=${days}&dryRun=${dryRun}`,
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
        errors: [(err as Error).message],
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-sm">
        Archive <strong>all</strong> inbox messages older than <strong>X</strong> days.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleRun(true)}
          disabled={running !== null}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {running === "preview" ? "Previewing…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => handleRun(false)}
          disabled={running !== null}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {running === "run" ? "Archiving…" : "Archive here"}
        </button>
        <a
          href={`https://mail.google.com/mail/#search/${encodeURIComponent(`in:inbox older_than:${days}d`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Archive in Gmail
        </a>
      </div>
      <p className="text-zinc-500 text-xs">
        <strong>Archive in Gmail</strong> opens Gmail with the search—select all, then Archive. No ChiefOS resources used.{" "}
        <strong>Archive here</strong> processes via ChiefOS (up to 10k/run, undoable via Audit).
      </p>
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
            <p>
              Would archive <strong>{result.eligible}</strong> email(s) older than{" "}
              {days} days.
            </p>
          ) : (
            <p>
              Archived <strong>{result.archived}</strong> of {result.eligible}.{" "}
              {result.runId && (
                <Link href="/audit" className="text-amber-500 hover:text-amber-400 ml-2">
                  Undo run →
                </Link>
              )}
            </p>
          )}
          {result.items && result.items.length > 0 && result.items.some((i) => i.subject || i.from) && (
            <ul className="mt-3 space-y-2">
              {result.items.slice(0, 5).map((item, i) => (
                <li key={i} className="rounded border border-zinc-700 px-2 py-1 text-xs">
                  {item.subject || "(No subject)"} — {item.from || "—"} · {item.categoryName}
                </li>
              ))}
              {result.items.length > 5 && (
                <li className="text-zinc-600 text-xs">+{result.items.length - 5} more</li>
              )}
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
