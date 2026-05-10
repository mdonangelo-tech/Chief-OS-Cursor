import Link from "next/link";
import { RuleSuggestionCard } from "@/components/rules/RuleSuggestionCard";
import type { RuleSuggestion } from "@/services/declutter/suggestions";

export function SuggestedActionsSection({ actions }: { actions: RuleSuggestion[] }) {
  const high = (actions ?? []).filter((a) => a.band === "high");
  if (high.length === 0) return null;

  return (
    <section id="suggested-actions" className="scroll-mt-6">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-lg font-medium text-foreground">Suggested actions</h2>
        <span className="text-xs text-muted-foreground">Review, adjust, and ChiefOS will adapt</span>
      </div>

      <ul className="space-y-3">
        {high.slice(0, 3).map((a) => (
          <RuleSuggestionCard key={a.emailEventId} mode="brief" suggestion={a} />
        ))}
      </ul>

      <div className="mt-3">
        <Link
          href="/settings/declutter"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Manage all suggestions in Settings → Declutter
        </Link>
      </div>
    </section>
  );
}
