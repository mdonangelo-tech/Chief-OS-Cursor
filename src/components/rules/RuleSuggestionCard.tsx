"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveAsRule, acceptSuggestion, approveRule, rejectSuggestion } from "@/lib/brief-actions";
import { UnsubscribeButton } from "@/app/(dashboard)/brief/UnsubscribeButton";
import type { RuleSuggestion } from "@/services/declutter/suggestions";

export interface RuleSuggestionCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { name: string } | null;
}

function labelForRuleType(t: "domain" | "sender"): string {
  return t === "domain" ? "domain rule" : "sender rule";
}

function valueForRuleType(s: RuleSuggestion, t: "domain" | "sender"): string | null {
  return t === "domain" ? s.domain : s.email;
}

function categoryLabel(c: RuleSuggestionCategoryOption): string {
  if (c.parent) {
    return `${c.parent.name} › ${c.name}`;
  }
  return c.name;
}

function decodeSnippet(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

export type RuleSuggestionCardMode = "brief" | "declutter";

export interface RuleSuggestionCardProps {
  mode: RuleSuggestionCardMode;
  suggestion: RuleSuggestion;
  /** Declutter: full category tree for rule target. */
  categories?: RuleSuggestionCategoryOption[];
  /** Brief: fragment for return after dismiss. */
  briefReturnHash?: string;
}

export function RuleSuggestionCard({
  mode,
  suggestion: s,
  categories = [],
  briefReturnHash = "#suggested-actions",
}: RuleSuggestionCardProps) {
  if (mode === "brief") {
    return (
      <li className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">
              Recommended:{" "}
              <span className="font-medium text-foreground/90">
                {labelForRuleType(s.recommendedRuleType)}
              </span>{" "}
              for <span className="text-foreground/90">{s.recommendedValue}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
              <span className="inline-flex rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                {s.categoryName}
              </span>
              {s.confidence != null && (
                <span className="tabular-nums">{Math.round(s.confidence * 100)}%</span>
              )}
              <span className="rounded bg-muted px-1.5 py-0.5">
                {s.band === "high" ? "High confidence" : "Medium confidence"}
              </span>
            </div>
            {s.snippet && (
              <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{s.snippet}</div>
            )}
            <div className="text-xs text-muted-foreground/70 mt-2">
              Why: recent mail from this source consistently matched{" "}
              <span className="text-foreground/80">{s.categoryName}</span>
              {s.recommendedRuleType === "domain"
                ? " — a domain rule covers everyone at that address."
                : " — a sender rule targets this exact address."}
            </div>
            <div className="text-xs text-muted-foreground/70 mt-2 truncate" title={s.from}>
              {s.from}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {(["domain", "sender"] as const)
              .filter((ruleType) => {
                if (ruleType === "domain") return s.needsDomain && valueForRuleType(s, ruleType);
                return s.needsSender && valueForRuleType(s, ruleType);
              })
              .sort((ruleType) => (ruleType === s.recommendedRuleType ? -1 : 1))
              .map((ruleType, index) => (
                <form key={ruleType} action={saveAsRule}>
                  <input type="hidden" name="emailEventId" value={s.emailEventId} />
                  <input type="hidden" name="categoryId" value={s.categoryId} />
                  <input type="hidden" name="ruleType" value={ruleType} />
                  <button
                    type="submit"
                    className={
                      index === 0
                        ? "rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                        : "rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60"
                    }
                  >
                    {ruleType === s.recommendedRuleType
                      ? `Save recommended (${labelForRuleType(ruleType)})`
                      : `Alternative: ${labelForRuleType(ruleType)}`}
                  </button>
                </form>
              ))}

            <form action={acceptSuggestion}>
              <input type="hidden" name="emailEventId" value={s.emailEventId} />
              <input type="hidden" name="returnTo" value={`/brief${briefReturnHash}`} />
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
    );
  }

  // declutter
  return <DeclutterSuggestionBody suggestion={s} categories={categories} />;
}

function DeclutterSuggestionBody({
  suggestion: s,
  categories,
}: {
  suggestion: RuleSuggestion;
  categories: RuleSuggestionCategoryOption[];
}) {
  const [useNew, setUseNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [savedSender, setSavedSender] = useState(false);
  const [savedDomain, setSavedDomain] = useState(false);
  const id = s.emailEventId;
  const roots = categories.filter((c) => !c.parentId);
  const hasSender = s.needsSender;
  const hasDomain = s.needsDomain;

  const handleCreateRule = (ruleType: "sender" | "domain") => {
    startTransition(async () => {
      const form = document.getElementById(`suggestion-form-${id}`) as HTMLFormElement;
      if (!form) return;
      const fd = new FormData(form);
      fd.set("ruleType", ruleType);
      fd.set("noRedirect", "true");
      await approveRule(fd);
      if (ruleType === "sender") setSavedSender(true);
      else setSavedDomain(true);
    });
  };

  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl border border-border/10 bg-surface/60 px-4 py-3 transition-opacity shadow-soft ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground">
            Recommended:{" "}
            <span className="font-medium text-foreground/90">
              {labelForRuleType(s.recommendedRuleType)}
            </span>{" "}
            for <span className="text-foreground/90">{s.recommendedValue}</span>
          </div>
          <div className="text-xs text-muted-foreground/80 mt-1">
            Why: recent mail from this source consistently matched{" "}
            <span className="text-foreground/80">{s.categoryName}</span>.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {s.confidence != null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.round(s.confidence * 100)}%
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {s.band === "high" ? "High confidence" : "Medium confidence"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-foreground min-w-0 truncate" title={s.from}>
          {s.from}
        </span>
        <span className="text-muted-foreground shrink-0">→</span>

        {(hasSender || hasDomain) && (
          <form id={`suggestion-form-${id}`} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="emailEventId" value={id} />
            <span className="text-muted-foreground text-sm shrink-0">to</span>
            {useNew ? (
              <>
                <input
                  type="text"
                  name="newCategoryName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New category name"
                  required
                  className="rounded-xl border border-border/10 bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground w-40"
                />
                <select
                  name="newCategoryParentId"
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="rounded-xl border border-border/10 bg-background px-2 py-1 text-sm text-foreground w-32"
                >
                  <option value="">— Root (no parent)</option>
                  {roots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseNew(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <select
                name="categoryId"
                defaultValue={s.categoryId}
                className="rounded-xl border border-border/10 bg-background px-2 py-1.5 text-sm text-foreground font-medium min-w-[140px]"
                title="Category for this rule"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            )}
            {!useNew && (
              <button
                type="button"
                onClick={() => setUseNew(true)}
                className="text-xs text-muted-foreground hover:text-accent"
              >
                + New category
              </button>
            )}

            <span className="text-muted-foreground/60 hidden sm:inline">|</span>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {hasSender &&
                (savedSender ? (
                  <span className="rounded-md bg-emerald-800/50 px-2.5 py-1 text-sm text-emerald-200 font-medium">
                    ✓ Saved sender rule
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateRule("sender")}
                    disabled={isPending}
                    className={
                      s.recommendedRuleType === "sender"
                        ? "rounded-xl bg-accent px-2.5 py-1 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-60"
                        : "rounded-xl border border-border/10 bg-surface/50 px-2.5 py-1 text-sm font-medium text-foreground hover:bg-surface2/60 disabled:opacity-60"
                    }
                  >
                    {isPending
                      ? "Saving…"
                      : s.recommendedRuleType === "sender"
                        ? "Save recommended (sender rule)"
                        : "Alternative: sender rule"}
                  </button>
                ))}
              {hasDomain &&
                (savedDomain ? (
                  <span className="rounded-md bg-emerald-800/50 px-2.5 py-1 text-sm text-emerald-200 font-medium">
                    ✓ Saved domain rule
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateRule("domain")}
                    disabled={isPending}
                    className={
                      s.recommendedRuleType === "domain"
                        ? "rounded-xl bg-accent px-2.5 py-1 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-60"
                        : "rounded-xl border border-border/10 bg-surface/50 px-2.5 py-1 text-sm font-medium text-foreground hover:bg-surface2/60 disabled:opacity-60"
                    }
                  >
                    {isPending
                      ? "Saving…"
                      : s.recommendedRuleType === "domain"
                        ? "Save recommended (domain rule)"
                        : "Alternative: domain rule"}
                  </button>
                ))}
            </div>
          </form>
        )}

        {["newsletters", "promotions", "low-priority"].includes(s.categoryName?.toLowerCase() ?? "") && (
          <UnsubscribeButton emailEventId={id} className="text-xs text-accent hover:text-accent/80" />
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set("emailEventId", id);
              await acceptSuggestion(fd);
            });
          }}
          className="rounded-md bg-emerald-600/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {isPending ? "Clearing…" : "✓ Accept"}
        </button>

        {s.band === "mid" && (hasSender || hasDomain) && (
          <form action={rejectSuggestion} className="inline">
            <input type="hidden" name="emailEventId" value={id} />
            <input type="hidden" name="ruleType" value="both" />
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
              Don&apos;t suggest again
            </button>
          </form>
        )}
      </div>
      {s.snippet && (
        <p className="text-muted-foreground text-sm line-clamp-2">{decodeSnippet(s.snippet)}</p>
      )}
      <p className="text-xs text-muted-foreground/80">
        <Link href="/brief#suggested-actions" className="text-accent hover:underline">
          Same suggestions on Brief →
        </Link>
      </p>
    </li>
  );
}
