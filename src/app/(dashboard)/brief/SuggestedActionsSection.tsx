import { saveAsRule, acceptSuggestion } from "@/lib/brief-actions";
import Link from "next/link";

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
  email: string | null;
  domain: string | null;
  needsSender: boolean;
  needsDomain: boolean;
};

function labelForRuleType(t: "domain" | "sender"): string {
  return t === "domain" ? "domain rule" : "sender rule";
}

function valueForRuleType(action: SuggestedAction, t: "domain" | "sender"): string | null {
  return t === "domain" ? action.domain : action.email;
}

export function SuggestedActionsSection({ actions }: { actions: SuggestedAction[] }) {
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
          <li
            key={a.emailEventId}
            className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                  ChiefOS recommends a {labelForRuleType(a.recommendedRuleType)} for{" "}
                  <span className="text-foreground/90">{a.recommendedValue}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
                  <span className="inline-flex rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                    {a.categoryName}
                  </span>
                  {a.confidence != null && (
                    <span className="tabular-nums">{Math.round(a.confidence * 100)}%</span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5">High confidence</span>
                </div>
                {a.snippet && (
                  <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {a.snippet}
                  </div>
                )}
                <div className="text-xs text-muted-foreground/70 mt-2">
                  Why: recent mail from this source consistently matched{" "}
                  <span className="text-foreground/80">{a.categoryName}</span>.
                </div>
                <div className="text-xs text-muted-foreground/70 mt-2 truncate" title={a.from}>
                  {a.from}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {(["domain", "sender"] as const)
                  .filter((ruleType) => {
                    if (ruleType === "domain") return a.needsDomain && valueForRuleType(a, ruleType);
                    return a.needsSender && valueForRuleType(a, ruleType);
                  })
                  .sort((ruleType) => (ruleType === a.recommendedRuleType ? -1 : 1))
                  .map((ruleType, index) => (
                    <form key={ruleType} action={saveAsRule}>
                      <input type="hidden" name="emailEventId" value={a.emailEventId} />
                      <input type="hidden" name="categoryId" value={a.categoryId} />
                      <input type="hidden" name="ruleType" value={ruleType} />
                      <button
                        type="submit"
                        className={
                          index === 0
                            ? "rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                            : "rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60"
                        }
                      >
                        {ruleType === a.recommendedRuleType ? "Save recommended" : `Use ${labelForRuleType(ruleType)}`}
                      </button>
                    </form>
                  ))}

                <form action={acceptSuggestion}>
                  <input type="hidden" name="emailEventId" value={a.emailEventId} />
                  <input type="hidden" name="returnTo" value="/brief#suggested-actions" />
                  <button
                    type="submit"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Dismiss suggestion
                  </button>
                </form>
              </div>
            </div>
          </li>
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

