"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { RuleSuggestionCard, type RuleSuggestionCategoryOption } from "@/components/rules/RuleSuggestionCard";
import type { RuleSuggestion } from "@/services/declutter/suggestions";

const DECLUTTER_RETURN = "/settings/declutter#suggested-actions";

export function DeclutterSuggestionsList({
  suggestions,
  categories,
}: {
  suggestions: RuleSuggestion[];
  categories: RuleSuggestionCategoryOption[];
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  const clearCard = useCallback(
    (emailEventId: string) => {
      setHiddenIds((prev) => new Set(prev).add(emailEventId));
      void mutate("/api/brief");
    },
    [mutate]
  );

  const visible = suggestions.filter((s) => !hiddenIds.has(s.emailEventId));

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-border/10 bg-surface/50 px-6 py-8 text-center shadow-soft">
        <p className="text-emerald-400/90 font-medium">All clear!</p>
        <p className="text-muted-foreground text-sm mt-1">No rules to review in this list.</p>
      </div>
    );
  }

  return (
    <>
      {flash && (
        <div
          role="status"
          className="mb-3 rounded-xl border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100"
        >
          {flash}
        </div>
      )}
      <ul className="space-y-3">
        {visible.map((s) => (
          <RuleSuggestionCard
            key={s.emailEventId}
            mode="declutter"
            suggestion={s}
            categories={categories}
            declutterReturn={DECLUTTER_RETURN}
            onFlashMessage={(msg) => {
              setFlash(msg);
              window.setTimeout(() => setFlash(null), 5000);
            }}
            onCleared={() => clearCard(s.emailEventId)}
          />
        ))}
      </ul>
    </>
  );
}
