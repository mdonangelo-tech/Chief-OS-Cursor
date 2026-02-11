"use client";

import Link from "next/link";
import { EmailCard } from "./EmailCard";

interface DigestEmail {
  id: string;
  subject: string | null;
  from: string;
  snippet: string | null;
  date: Date;
  categoryName: string | null;
  categoryId: string | null;
  confidence: number | null;
  explainJson: {
    source?: string;
    categoryName?: string;
    reason?: string;
    confidence?: number;
  } | null;
}

interface DigestSectionProps {
  digestBySender: { sender: string; emails: DigestEmail[] }[];
}

export function DigestSection({ digestBySender }: DigestSectionProps) {
  if (digestBySender.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-medium text-zinc-200">Digest</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            Newsletters & promotions — scan when you have time
          </span>
          <Link
            href="/settings/declutter"
            className="text-amber-500 hover:text-amber-400"
          >
            Archive 48h+
          </Link>
          <Link href="/audit" className="text-amber-500 hover:text-amber-400">
            Undo last run
          </Link>
          <Link href="/settings/declutter#email-actions" className="text-zinc-500 hover:text-zinc-400">
            Email actions
          </Link>
        </div>
      </div>
      <div className="space-y-4">
        {digestBySender.map(({ sender, emails }) => (
          <div
            key={sender}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            <div className="px-4 py-2 bg-zinc-800/50 text-sm font-medium text-zinc-300 truncate">
              {sender}
            </div>
            <ul className="divide-y divide-zinc-800/80">
              {emails.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <EmailCard
                    subject={e.subject}
                    from={e.from}
                    snippet={e.snippet}
                    categoryName={e.categoryName}
                    confidence={e.confidence}
                    explainJson={e.explainJson}
                    compact
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
