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
        <h2 className="text-lg font-medium text-foreground">Digest</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Newsletters & promotions — scan when you have time
          </span>
          <Link
            href="/settings/declutter"
            className="text-accent hover:text-accent/80"
          >
            Archive 48h+
          </Link>
          <Link href="/audit" className="text-accent hover:text-accent/80">
            Undo last run
          </Link>
          <Link href="/settings/declutter#suggested-actions" className="text-muted-foreground hover:text-foreground">
            Suggested actions
          </Link>
        </div>
      </div>
      <div className="space-y-4">
        {digestBySender.map(({ sender, emails }) => (
          <div
            key={sender}
            className="rounded-2xl border border-border/10 bg-surface/60 overflow-hidden shadow-soft"
          >
            <div className="px-4 py-2 bg-surface2/50 text-sm font-medium text-foreground/90 truncate">
              {sender}
            </div>
            <ul className="divide-y divide-border/10">
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
