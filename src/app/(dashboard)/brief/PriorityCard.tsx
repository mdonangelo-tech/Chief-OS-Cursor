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
  prioritySummary: string | null;
  prioritySignals: string[];
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
  prioritySummary,
  prioritySignals,
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
  const whyLine = (prioritySummary ?? reason)?.trim() || null;

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const dataUnknown = (await res.json().catch(() => ({}))) as unknown;
    const data =
      dataUnknown && typeof dataUnknown === "object" ? (dataUnknown as Record<string, unknown>) : {};
    if (!res.ok || data?.ok === false) {
      const errMsg =
        typeof data?.error === "string" ? data.error : `Request failed (${res.status})`;
      throw new Error(errMsg);
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
    <article className="rounded-2xl border border-border/10 bg-surface/60 p-5 shadow-soft">
      <div className="font-medium text-foreground">{text(subject) || "(No subject)"}</div>
      <div className="text-muted-foreground text-sm mt-1 flex flex-wrap items-center gap-2">
        {text(from)}
        <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {accountLabel}
        </span>
        {categoryName && (
          <span className="inline-flex rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
            {categoryName}
          </span>
        )}
        {confidence != null && (
          <span className="text-muted-foreground/80">{Math.round(confidence * 100)}%</span>
        )}
        {actionType && (
          <span className="text-muted-foreground italic">{actionLabel(actionType)}</span>
        )}
      </div>
      {snippet && (
        <p className="text-muted-foreground text-sm mt-2 line-clamp-1">{text(snippet)}</p>
      )}
      {whyLine && (
        <p className="text-muted-foreground/80 text-sm mt-2">
          <span className="text-muted-foreground/70">Why now:</span> {whyLine}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <a
          href={gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent hover:text-accent/80"
        >
          Do now
        </a>
        <button
          type="button"
          disabled={saving}
          onClick={() => submitFeedback("not_important")}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Not important
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submitFeedback("dismiss")}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setShowCategory((x) => !x)}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Change category
        </button>
        <button
          type="button"
          onClick={() => setShowWhy((x) => !x)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Details
        </button>
      </div>
      {showCategory && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="rounded-xl border border-border/10 bg-background px-2 py-1 text-sm text-foreground"
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
            className="rounded-xl bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          {(categoryName || categoryId) && (
            <span className="text-xs text-muted-foreground/80">
              Current:{" "}
              {categoryId ? (categoryLabelById.get(categoryId) ?? categoryName ?? "—") : categoryName ?? "—"}
            </span>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
      {showWhy && (
        <div className="mt-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground italic">
          {reason ?? "Signals: " + (prioritySignals?.length ? prioritySignals.join(" · ") : "—")}
        </div>
      )}
    </article>
  );
}
