"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const { mutate } = useSWRConfig();
  const router = useRouter();

  const clearCard = useCallback(
    (suggestionKey: string) => {
      setHiddenKeys((prev) => new Set(prev).add(suggestionKey));
      void mutate("/api/brief");
      router.refresh();
    },
    [mutate, router]
  );

  const visible = suggestions.filter((s) => !hiddenKeys.has(s.suggestionKey));

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
            key={s.suggestionKey}
            mode="declutter"
            suggestion={s}
            categories={categories}
            declutterReturn={DECLUTTER_RETURN}
            onFlashMessage={(msg) => {
              setFlash(msg);
              window.setTimeout(() => setFlash(null), 5000);
            }}
            onCleared={() => clearCard(s.suggestionKey)}
          />
        ))}
      </ul>
    </>
  );
}
