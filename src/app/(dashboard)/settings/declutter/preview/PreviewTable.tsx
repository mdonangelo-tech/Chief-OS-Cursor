"use client";

import { useCallback, useEffect, useState } from "react";
import type { DecisionResult } from "@/lib/decision-engine";

type PreviewEmail = {
  id: string;
  from_: string;
  subject: string | null;
  snippet: string | null;
  date: string;
  labels: string[];
  googleAccountId: string;
};

type PreviewItem = {
  email: PreviewEmail;
  decision: DecisionResult;
};

export function PreviewTable({
  categoriesById,
}: {
  categoriesById: Record<string, { id: string; name: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/declutter/preview", { method: "GET" });
      const data = (await res.json()) as
        | { ok: true; items: PreviewItem[] }
        | { error: string };
      if (!res.ok || !("ok" in data)) {
        throw new Error("error" in data ? data.error : "Failed to load preview");
      }
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-zinc-400 text-sm">
          Newest 50 emails currently in <strong>INBOX</strong>, with the deterministic decision engine output.
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-zinc-900/60 text-zinc-400">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>From</th>
              <th>Subject</th>
              <th>Category</th>
              <th>Action</th>
              <th>ArchiveAt</th>
              <th>Winner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No INBOX emails found.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const catId = it.decision.finalCategoryId;
                const categoryName = catId ? categoriesById[catId]?.name ?? "—" : "—";
                return (
                  <tr
                    key={it.email.id}
                    className="text-zinc-200 [&>td]:px-3 [&>td]:py-2 align-top"
                  >
                    <td className="max-w-[260px] truncate text-zinc-400" title={it.email.from_}>
                      {it.email.from_}
                    </td>
                    <td className="max-w-[340px]">
                      <div className="truncate" title={it.email.subject ?? ""}>
                        {it.email.subject || "(No subject)"}
                      </div>
                      {it.email.snippet ? (
                        <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                          {it.email.snippet}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200">
                        {categoryName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-zinc-300">{it.decision.action}</td>
                    <td className="whitespace-nowrap text-zinc-400">
                      {it.decision.archiveAt ?? "—"}
                    </td>
                    <td className="whitespace-nowrap text-zinc-400">{it.decision.reason.winner}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

