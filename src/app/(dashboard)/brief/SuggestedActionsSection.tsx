import { saveAsRule, acceptSuggestion } from "@/lib/brief-actions";

type SuggestedAction = {
  emailEventId: string;
  from: string;
  snippet: string | null;
  categoryId: string;
  categoryName: string;
  confidence: number | null;
  band: "high" | "mid";
  recommendedRuleType: "domain" | "sender";
  recommendedValue: string;
};

function labelForRuleType(t: "domain" | "sender"): string {
  return t === "domain" ? "domain rule" : "sender rule";
}

export function SuggestedActionsSection({ actions }: { actions: SuggestedAction[] }) {
  if (!actions || actions.length === 0) return null;

  return (
    <section id="suggested-actions" className="scroll-mt-6">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-lg font-medium text-foreground">Suggested actions</h2>
        <span className="text-xs text-muted-foreground">2–3 taps to improve your Brief</span>
      </div>

      <ul className="space-y-3">
        {actions.slice(0, 4).map((a) => (
          <li
            key={a.emailEventId}
            className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                  Save a {labelForRuleType(a.recommendedRuleType)} for{" "}
                  <span className="text-foreground/90">{a.recommendedValue}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
                  <span className="inline-flex rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                    {a.categoryName}
                  </span>
                  {a.confidence != null && (
                    <span className="tabular-nums">{Math.round(a.confidence * 100)}%</span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {a.band === "high" ? "High confidence" : "Medium confidence"}
                  </span>
                </div>
                {a.snippet && (
                  <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {a.snippet}
                  </div>
                )}
                <div className="text-xs text-muted-foreground/70 mt-2 truncate" title={a.from}>
                  {a.from}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <form action={saveAsRule}>
                  <input type="hidden" name="emailEventId" value={a.emailEventId} />
                  <input type="hidden" name="categoryId" value={a.categoryId} />
                  <input
                    type="hidden"
                    name="ruleType"
                    value={a.recommendedRuleType === "domain" ? "domain" : "sender"}
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                  >
                    Save rule
                  </button>
                </form>

                <form action={acceptSuggestion}>
                  <input type="hidden" name="emailEventId" value={a.emailEventId} />
                  <input type="hidden" name="returnTo" value="/brief#suggested-actions" />
                  <button
                    type="submit"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Not now
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

