"use client";

import { useState } from "react";
import Link from "next/link";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { UnsubscribeButton } from "./UnsubscribeButton";

function text(s: string | null | undefined): string {
  return s ? decodeHtmlEntities(s) : "";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface DeclutterSectionProps {
  summary: Record<string, { newCount: number; olderThan48hCount: number }>;
  groups: Array<{
    sender: string;
    categoryName: string | null;
    items: Array<{
      id: string;
      messageId: string;
      googleAccountId: string;
      subject: string | null;
      date: string;
    }>;
  }>;
}

export function DeclutterSection({ summary, groups }: DeclutterSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const summaryParts = Object.entries(summary).map(
    ([cat, v]) => `${cat}: ${v.newCount} new${v.olderThan48hCount > 0 ? ` (${v.olderThan48hCount} >48h)` : ""}`
  );

  return (
    <section id="declutter" className="scroll-mt-6">
      <h2 className="text-lg font-medium text-zinc-200 mb-3">Declutter</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 mb-3">
        <p className="text-zinc-300 text-sm">{summaryParts.join(" · ") || "No digest"}</p>
        <p className="text-zinc-500 text-xs mt-1">
          Unsubscribe appears next to each sender (uses Gmail&apos;s List-Unsubscribe).
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href="/settings/declutter"
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          Archive 48h+ now
        </Link>
        <Link href="/settings/declutter" className="text-sm text-zinc-500 hover:text-zinc-400">
          Preview (dry run)
        </Link>
        <Link href="/audit" className="text-sm text-zinc-500 hover:text-zinc-400">
          Undo last batch
        </Link>
      </div>
      <div className="space-y-2">
        {groups.slice(0, 8).map((g, i) => {
          const key = g.sender + (g.categoryName ?? "");
          const isExp = expanded[key] ?? false;
          return (
            <div
              key={key}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded((s) => ({ ...s, [key]: !s[key] }));
                  }
                }}
                className="w-full px-4 py-2 flex items-center justify-between text-left bg-zinc-800/30 hover:bg-zinc-800/50 cursor-pointer"
              >
                <span className="font-medium text-zinc-300 truncate">{g.sender}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {g.categoryName && (
                    <span className="text-xs text-zinc-500">{g.categoryName}</span>
                  )}
                  {g.items[0] && (
                    <UnsubscribeButton
                      emailEventId={g.items[0].id}
                      messageId={g.items[0].messageId}
                      googleAccountId={g.items[0].googleAccountId}
                      className="text-xs text-amber-500 hover:text-amber-400"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <span className="text-zinc-500 text-xs">{g.items.length} items</span>
                </span>
              </div>
              {isExp && (
                <ul className="px-4 py-2 divide-y divide-zinc-800/50">
                  {g.items.slice(0, 3).map((it) => (
                    <li key={it.id} className="py-1 text-sm text-zinc-400 truncate">
                      {text(it.subject) || "(No subject)"} — {fmtDate(it.date)}
                    </li>
                  ))}
                  {g.items.length > 3 && (
                    <li className="py-1 text-xs text-zinc-600">+{g.items.length - 3} more</li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
