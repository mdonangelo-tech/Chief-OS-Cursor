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
      <h2 className="text-lg font-medium text-foreground mb-3">Open loops</h2>
      <ul className="space-y-2">
        {loops.map((o) => (
          <li
            key={o.threadId}
            className="flex items-center justify-between gap-4 rounded-xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft"
          >
            <div className="min-w-0">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-2 ${
                  o.badge === "owe_reply"
                    ? "bg-accent/15 text-accent"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {o.badge === "owe_reply" ? "Owe reply" : "Waiting on"}
              </span>
              <span className="text-muted-foreground text-sm">{o.lastActivityDaysAgo}d ago</span>
              <div className="font-medium text-foreground mt-0.5 truncate">
                {text(o.subject) || "(No subject)"}
              </div>
              <div className="text-muted-foreground text-xs truncate">{text(o.lastFrom)} · {o.accountLabel}</div>
            </div>
            <a
              href={`${GMAIL_BASE}/#inbox/${o.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:text-accent/80 shrink-0"
            >
              Open in Gmail
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
