"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decodeHtmlEntities } from "@/lib/html-entities";

const GMAIL_BASE = "https://mail.google.com/mail";

function text(s: string | null | undefined): string {
  return s ? decodeHtmlEntities(s) : "";
}

function actionLabel(action: string | null): string {
  const m: Record<string, string> = {
    reply: "Reply",
    schedule: "Schedule",
    read: "Read",
    ignore: "Ignore",
  };
  return action ? (m[action] ?? action) : "—";
}

interface PriorityCardProps {
  id: string;
  messageId: string;
  threadId: string;
  googleAccountId: string;
  accountLabel: string;
  subject: string | null;
  from: string;
  snippet: string | null;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number | null;
  actionType: string | null;
  explainJson: Record<string, unknown> | null;
  categories: Array<{ id: string; name: string }>;
}

export function PriorityCard({
  id,
  threadId,
  accountLabel,
  subject,
  from,
  snippet,
  categoryId,
  categoryName,
  confidence,
  actionType,
  explainJson,
  categories,
}: PriorityCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [saving, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryId ?? "");
  const categoryLabelById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name] as const)),
    [categories]
  );

  const gmailUrl = `${GMAIL_BASE}/#inbox/${threadId}`;

  const reason =
    (explainJson?.reason as string) ??
    (explainJson?.categoryName as string) ??
    (explainJson?.source ? `From ${explainJson.source}` : null);

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data as T;
  }

  function submitFeedback(feedback: "dismiss" | "not_important") {
    startTransition(async () => {
      setError(null);
      try {
        await postJson<{ ok: true }>("/api/brief/priority-feedback", { emailEventId: id, feedback });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function saveCategory() {
    startTransition(async () => {
      setError(null);
      try {
        const nextId = selectedCategoryId.trim() || null;
        await postJson<{ ok: true }>("/api/brief/update-category", {
          emailEventId: id,
          categoryId: nextId,
        });
        setShowCategory(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="font-medium text-zinc-200">{text(subject) || "(No subject)"}</div>
      <div className="text-zinc-500 text-sm mt-1 flex flex-wrap items-center gap-2">
        {text(from)}
        <span className="inline-flex rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
          {accountLabel}
        </span>
        {categoryName && (
          <span className="inline-flex rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">
            {categoryName}
          </span>
        )}
        {confidence != null && (
          <span className="text-zinc-600">{Math.round(confidence * 100)}%</span>
        )}
        {actionType && (
          <span className="text-zinc-500 italic">{actionLabel(actionType)}</span>
        )}
      </div>
      {snippet && (
        <p className="text-zinc-400 text-sm mt-2 line-clamp-1">{text(snippet)}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <a
          href={gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          Do now
        </a>
        <button
          type="button"
          disabled={saving}
          onClick={() => submitFeedback("not_important")}
          className="text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        >
          Not important
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submitFeedback("dismiss")}
          className="text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setShowCategory((x) => !x)}
          className="text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        >
          Change category
        </button>
        <button
          type="button"
          onClick={() => setShowWhy((x) => !x)}
          className="text-sm text-zinc-500 hover:text-zinc-400"
        >
          Why?
        </button>
      </div>
      {showCategory && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
          >
            <option value="">— Unset —</option>
            {categories
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={saveCategory}
            className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Save
          </button>
          {(categoryName || categoryId) && (
            <span className="text-xs text-zinc-600">
              Current:{" "}
              {categoryId ? (categoryLabelById.get(categoryId) ?? categoryName ?? "—") : categoryName ?? "—"}
            </span>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
      {showWhy && reason && (
        <div className="mt-2 rounded bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 italic">
          {reason}
        </div>
      )}
    </article>
  );
}
