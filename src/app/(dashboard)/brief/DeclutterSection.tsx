"use client";

import Link from "next/link";

interface DeclutterSectionProps {
  summary: Record<string, { newCount: number; olderThan48hCount: number }>;
}

export function DeclutterSection({ summary }: DeclutterSectionProps) {
  const parts = Object.entries(summary)
    .filter(([, v]) => (v.newCount ?? 0) > 0)
    .map(([cat, v]) => `${cat}: ${v.newCount}`);
  const totalNew = Object.values(summary).reduce((s, v) => s + (v.newCount ?? 0), 0);
  const totalOverdue = Object.values(summary).reduce((s, v) => s + (v.olderThan48hCount ?? 0), 0);

  return (
    <section id="declutter" className="scroll-mt-6">
      <h2 className="text-lg font-medium text-zinc-200 mb-3">Declutter</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 mb-3">
        <p className="text-zinc-300 text-sm">
          {totalNew === 0 ? "All clear." : `Digest: ${parts.join(" · ")}`}
          {totalOverdue > 0 ? ` · ${totalOverdue} past your archive window` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href="/settings/declutter"
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          Review in Declutter
        </Link>
        <Link href="/audit" className="text-sm text-zinc-500 hover:text-zinc-400">
          Undo last batch
        </Link>
      </div>
    </section>
  );
}
