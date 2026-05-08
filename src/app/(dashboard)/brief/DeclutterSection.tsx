"use client";

import Link from "next/link";

interface DeclutterSectionProps {
  summary: Record<string, { newCount: number; olderThan48hCount: number }>;
}

export function DeclutterSection({ summary }: DeclutterSectionProps) {
  const entries = Object.entries(summary ?? {}).map(([category, v]) => ({
    category,
    newCount: v?.newCount ?? 0,
    overdueCount: v?.olderThan48hCount ?? 0,
  }));
  const totalNew = entries.reduce((s, e) => s + e.newCount, 0);
  const totalOverdue = entries.reduce((s, e) => s + e.overdueCount, 0);
  const top = entries
    .filter((e) => e.newCount > 0)
    .sort((a, b) => b.newCount - a.newCount)
    .slice(0, 2);
  const topLine =
    top.length === 0
      ? null
      : top
          .map((t) => `${t.category} (${t.newCount.toLocaleString()})`)
          .join(" · ");

  return (
    <section id="declutter" className="scroll-mt-6">
      <h2 className="text-lg font-medium text-foreground mb-3">Declutter</h2>
      <div className="rounded-xl border border-border/10 bg-surface/60 px-4 py-3 mb-3 shadow-soft">
        {totalNew === 0 ? (
          <p className="text-foreground/90 text-sm">
            Quiet right now. No low-priority items surfaced.
          </p>
        ) : (
          <>
            <p className="text-foreground/90 text-sm">
              ChiefOS found{" "}
              <span className="font-medium text-foreground">
                {totalNew.toLocaleString()}
              </span>{" "}
              low-priority email{totalNew === 1 ? "" : "s"} ready for a rules pass.
            </p>
            {topLine && (
              <p className="text-muted-foreground text-xs mt-1">
                Biggest sources: {topLine}.
              </p>
            )}
            {totalOverdue > 0 && (
              <p className="text-muted-foreground text-xs mt-1">
                {totalOverdue.toLocaleString()} {totalOverdue === 1 ? "is" : "are"} past your archive window. Preview before archiving.
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link
          href="/settings/declutter#suggested-actions"
          className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Review rule suggestions
        </Link>
        <Link
          href="/settings/declutter/preview"
          className="rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60"
        >
          Preview bulk actions
        </Link>
        <Link href="/audit" className="text-sm text-muted-foreground hover:text-foreground">
          See recent actions
        </Link>
      </div>
    </section>
  );
}
