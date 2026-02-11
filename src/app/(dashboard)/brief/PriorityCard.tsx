"use client";

import { useState } from "react";
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
  categoryName: string | null;
  confidence: number | null;
  actionType: string | null;
  explainJson: Record<string, unknown> | null;
}

export function PriorityCard({
  threadId,
  googleAccountId,
  accountLabel,
  subject,
  from,
  snippet,
  categoryName,
  confidence,
  actionType,
  explainJson,
}: PriorityCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const gmailUrl = `${GMAIL_BASE}/#inbox/${threadId}`;

  const reason =
    (explainJson?.reason as string) ??
    (explainJson?.categoryName as string) ??
    (explainJson?.source ? `From ${explainJson.source}` : null);

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
          onClick={() => setShowWhy((x) => !x)}
          className="text-sm text-zinc-500 hover:text-zinc-400"
        >
          Why?
        </button>
      </div>
      {showWhy && reason && (
        <div className="mt-2 rounded bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 italic">
          {reason}
        </div>
      )}
    </article>
  );
}
