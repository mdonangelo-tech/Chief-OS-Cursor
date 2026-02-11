"use client";

import { decodeHtmlEntities } from "@/lib/html-entities";

const GMAIL_BASE = "https://mail.google.com/mail";

function text(s: string | null | undefined): string {
  return s ? decodeHtmlEntities(s) : "";
}

interface OpenLoop {
  threadId: string;
  subject: string | null;
  badge: "owe_reply" | "waiting_on";
  lastActivityDaysAgo: number;
  lastFrom: string;
  accountLabel: string;
}

export function OpenLoopsSection({ loops }: { loops: OpenLoop[] }) {
  if (loops.length === 0) return null;

  return (
    <section id="open-loops" className="scroll-mt-6">
      <h2 className="text-lg font-medium text-zinc-200 mb-3">Open loops</h2>
      <ul className="space-y-2">
        {loops.map((o) => (
          <li
            key={o.threadId}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <div className="min-w-0">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-2 ${
                  o.badge === "owe_reply"
                    ? "bg-amber-900/50 text-amber-200"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {o.badge === "owe_reply" ? "Owe reply" : "Waiting on"}
              </span>
              <span className="text-zinc-400 text-sm">{o.lastActivityDaysAgo}d ago</span>
              <div className="font-medium text-zinc-200 mt-0.5 truncate">
                {text(o.subject) || "(No subject)"}
              </div>
              <div className="text-zinc-500 text-xs truncate">{text(o.lastFrom)} · {o.accountLabel}</div>
            </div>
            <a
              href={`${GMAIL_BASE}/#inbox/${o.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-amber-500 hover:text-amber-400 shrink-0"
            >
              Open in Gmail
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
