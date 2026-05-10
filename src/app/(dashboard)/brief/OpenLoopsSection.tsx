"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { Button } from "@/components/ui/Button";

const GMAIL_BASE = "https://mail.google.com/mail";

function text(s: string | null | undefined): string {
  return s ? decodeHtmlEntities(s) : "";
}

export interface OpenLoopItem {
  threadId: string;
  subject: string | null;
  badge: "owe_reply" | "waiting_on";
  lastActivityDaysAgo: number;
  lastFrom: string;
  googleAccountId: string;
  accountLabel: string;
  accountType: "work" | "personal" | "unknown";
}

async function postAttention(body: {
  googleAccountId: string;
  threadId: string;
  action: string;
  lastFrom?: string;
}): Promise<void> {
  const res = await fetch("/api/attention/thread", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || data?.ok === false) {
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  }
}

function OpenLoopRow({ loop, onDone }: { loop: OpenLoopItem; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: string) {
    setError(null);
    start(async () => {
      try {
        await postAttention({
          googleAccountId: loop.googleAccountId,
          threadId: loop.threadId,
          action,
          lastFrom: loop.lastFrom,
        });
        await mutate("/api/brief");
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <li className="rounded-2xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                loop.badge === "owe_reply"
                  ? "bg-accent/15 text-accent"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {loop.badge === "owe_reply" ? "Owe reply" : "Waiting on"}
            </span>
            <span className="text-muted-foreground text-sm">{loop.lastActivityDaysAgo}d ago</span>
          </div>
          <div className="font-medium text-foreground mt-0.5 truncate">
            {text(loop.subject) || "(No subject)"}
          </div>
          <div className="text-muted-foreground text-xs truncate">
            {text(loop.lastFrom)} · {loop.accountLabel}
          </div>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div className="flex flex-wrap gap-1.5 justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => act("important")}>
              Important
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => act("not_important")}>
              Not important
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => act("handled")}>
              Handled
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            <Button variant="tertiary" disabled={pending} onClick={() => act("snooze_later_today")}>
              Later today
            </Button>
            <Button variant="tertiary" disabled={pending} onClick={() => act("snooze_tomorrow")}>
              Tomorrow
            </Button>
            <Button variant="tertiary" disabled={pending} onClick={() => act("snooze_next_week")}>
              Next week
            </Button>
            <Button variant="tertiary" disabled={pending} onClick={() => act("waiting_on")}>
              Waiting on
            </Button>
          </div>
          {error && (
            <p className="text-xs text-red-400/90 w-full text-right sm:text-right">{error}</p>
          )}
          <div className="flex flex-wrap gap-1.5 justify-end">
            <Button variant="destructive" disabled={pending} onClick={() => act("never_similar")}>
              Never surface similar
            </Button>
            <a
              href={`${GMAIL_BASE}/#inbox/${loop.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60"
            >
              Open in Gmail
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

export function OpenLoopsSection({ loops }: { loops: OpenLoopItem[] }) {
  const router = useRouter();
  if (loops.length === 0) return null;

  return (
    <section id="open-loops" className="scroll-mt-6">
      <h2 className="text-lg font-medium text-foreground mb-1">Open loops</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Commitments that look stalled — either you owe a reply, or you&apos;re waiting on someone else.
        Actions here apply everywhere your Brief runs.
      </p>
      <ul className="space-y-3">
        {loops.map((o) => (
          <OpenLoopRow key={o.threadId} loop={o} onDone={() => router.refresh()} />
        ))}
      </ul>
    </section>
  );
}
