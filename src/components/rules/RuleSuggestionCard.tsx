"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import {
  saveAsRule,
  acceptSuggestion,
  approveRule,
  rejectSuggestion,
} from "@/lib/brief-actions";
import { UnsubscribeButton } from "@/app/(dashboard)/brief/UnsubscribeButton";
import { Button } from "@/components/ui/Button";
import type { RuleSuggestion } from "@/services/declutter/suggestions";

export interface RuleSuggestionCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { name: string } | null;
}

const BRIEF_RETURN = "/brief#suggested-actions";
const DEFAULT_DECLUTTER_RETURN = "/settings/declutter#suggested-actions";

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

function useUnsubscribeProbe(emailEventId: string): "loading" | "yes" | "no" | "error" {
  const [state, setState] = useState<"loading" | "yes" | "no" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/gmail/unsubscribe?emailEventId=${encodeURIComponent(emailEventId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("probe failed");
        return r.json() as Promise<{ hasUnsubscribe?: boolean }>;
      })
      .then((d) => {
        if (!cancelled) setState(d.hasUnsubscribe ? "yes" : "no");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [emailEventId]);

  return state;
}

function anchorSuggestedActions() {
  requestAnimationFrame(() => {
    document.getElementById("suggested-actions")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

function preserveBriefSuggestedHash() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/brief") {
    window.history.replaceState(null, "", BRIEF_RETURN);
  }
}

export type RuleSuggestionCardMode = "brief" | "declutter";

export interface RuleSuggestionCardProps {
  mode: RuleSuggestionCardMode;
  suggestion: RuleSuggestion;
  categories?: RuleSuggestionCategoryOption[];
  /** Declutter: return path for any legacy redirect (inline flow uses noRedirect). */
  declutterReturn?: string;
  /** Remove row / clear local list after save, dismiss, or reject. */
  onCleared?: () => void;
  /** Brief / Declutter: success copy above the list so it survives row removal. */
  onFlashMessage?: (message: string) => void;
}

export function RuleSuggestionCard({
  mode,
  suggestion: s,
  categories = [],
  declutterReturn = DEFAULT_DECLUTTER_RETURN,
  onCleared,
  onFlashMessage,
}: RuleSuggestionCardProps) {
  if (mode === "brief") {
    return (
      <BriefSuggestionBody
        suggestion={s}
        onCleared={onCleared}
        onFlashMessage={onFlashMessage}
      />
    );
  }
  return (
    <DeclutterSuggestionBody
      suggestion={s}
      categories={categories}
      declutterReturn={declutterReturn}
      onCleared={onCleared}
      onFlashMessage={onFlashMessage}
    />
  );
}

function BriefSuggestionBody({
  suggestion: s,
  onCleared,
  onFlashMessage,
}: {
  suggestion: RuleSuggestion;
  onCleared?: () => void;
  onFlashMessage?: (message: string) => void;
}) {
  const { mutate } = useSWRConfig();
  const [pending, startTransition] = useTransition();
  const unsub = useUnsubscribeProbe(s.emailEventId);

  const showUnsub = unsub === "yes";
  const showUnsubHint =
    unsub === "no" &&
    ["newsletters", "promotions", "low-priority"].some((k) =>
      (s.categoryName ?? "").toLowerCase().includes(k)
    );

  const runInline = useCallback(
    (fn: (fd: FormData) => Promise<void>, build: (fd: FormData) => void, message: string) => {
      startTransition(async () => {
        const fd = new FormData();
        build(fd);
        fd.set("noRedirect", "true");
        fd.set("returnTo", BRIEF_RETURN);
        await fn(fd);
        onFlashMessage?.(message);
        onCleared?.();
        await mutate("/api/brief");
        preserveBriefSuggestedHash();
        anchorSuggestedActions();
      });
    },
    [mutate, onCleared, onFlashMessage]
  );

  const saveRule = (ruleType: "domain" | "sender") => {
    runInline(saveAsRule, (fd) => {
      fd.set("emailEventId", s.emailEventId);
      fd.set("categoryId", s.categoryId);
      fd.set("ruleType", ruleType);
    }, `${labelForRuleType(ruleType)} saved. Future mail will be classified with your categories.`);
  };

  const dismiss = () => {
    runInline(
      acceptSuggestion,
      (fd) => {
        fd.set("emailEventId", s.emailEventId);
      },
      "Got it — we will not suggest this again for now."
    );
  };

  return (
    <li className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
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
          <div className="text-xs text-muted-foreground/80 mt-2 space-y-1">
            <p>
              <span className="text-foreground/90">Rules</span> tell ChiefOS how to{" "}
              <em>label or archive future mail</em> from this sender or domain. They do not remove
              you from marketing lists.
            </p>
            {showUnsub && (
              <p>
                <span className="text-foreground/90">Unsubscribe</span> asks the sender (or opens
                their page) to <em>stop sending</em>; it does not replace classification rules.
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground/70 mt-2 truncate" title={s.from}>
            {s.from}
          </div>
          {showUnsubHint && (
            <p className="text-xs text-muted-foreground/70 mt-2">
              This message has no safe List-Unsubscribe link in headers. Use a rule below, or open
              the message in Gmail to unsubscribe manually.
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 min-w-[200px]">
          {(["domain", "sender"] as const)
            .filter((ruleType) => {
              if (ruleType === "domain") return s.needsDomain && valueForRuleType(s, ruleType);
              return s.needsSender && valueForRuleType(s, ruleType);
            })
            .sort((ruleType) => (ruleType === s.recommendedRuleType ? -1 : 1))
            .map((ruleType, index) => (
              <Button
                key={ruleType}
                variant={index === 0 ? "primary" : "secondary"}
                type="button"
                disabled={pending}
                onClick={() => saveRule(ruleType)}
                className="w-full sm:w-auto"
              >
                {ruleType === s.recommendedRuleType
                  ? `Save recommended (${labelForRuleType(ruleType)})`
                  : `Alternative: ${labelForRuleType(ruleType)}`}
              </Button>
            ))}

          {showUnsub && (
            <div className="rounded-xl border border-border/10 bg-surface/40 px-3 py-2 w-full sm:w-auto">
              <div className="text-xs text-muted-foreground mb-1.5">Unsubscribe (when available)</div>
              <UnsubscribeButton
                emailEventId={s.emailEventId}
                className="rounded-lg border border-border/10 bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60 w-full text-center"
              />
            </div>
          )}

          <Button variant="tertiary" type="button" disabled={pending} onClick={dismiss} className="self-end">
            Not now / dismiss suggestion
          </Button>
        </div>
      </div>
    </li>
  );
}

function DeclutterSuggestionBody({
  suggestion: s,
  categories,
  declutterReturn,
  onCleared,
  onFlashMessage,
}: {
  suggestion: RuleSuggestion;
  categories: RuleSuggestionCategoryOption[];
  declutterReturn: string;
  onCleared?: () => void;
  onFlashMessage?: (message: string) => void;
}) {
  const { mutate } = useSWRConfig();
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
  const unsub = useUnsubscribeProbe(id);
  const showUnsub = unsub === "yes";
  const showUnsubHint =
    unsub === "no" &&
    ["newsletters", "promotions", "low-priority"].some((k) =>
      (s.categoryName ?? "").toLowerCase().includes(k)
    );

  const anchorDeclutterSection = () => {
    requestAnimationFrame(() => {
      document.getElementById("suggested-actions")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const afterRuleSaved = useCallback(
    (message: string) => {
      onFlashMessage?.(message);
      void mutate("/api/brief");
      onCleared?.();
      anchorDeclutterSection();
    },
    [mutate, onCleared, onFlashMessage]
  );

  const afterRowRemoved = useCallback(
    (message: string) => {
      onFlashMessage?.(message);
      void mutate("/api/brief");
      onCleared?.();
      anchorDeclutterSection();
    },
    [mutate, onCleared, onFlashMessage]
  );

  const handleCreateRule = (ruleType: "sender" | "domain") => {
    startTransition(async () => {
      const form = document.getElementById(`suggestion-form-${id}`) as HTMLFormElement;
      if (!form) return;
      const fd = new FormData(form);
      fd.set("ruleType", ruleType);
      fd.set("noRedirect", "true");
      fd.set("returnTo", declutterReturn);
      await approveRule(fd);
      if (ruleType === "sender") setSavedSender(true);
      else setSavedDomain(true);
      afterRuleSaved(
        ruleType === "sender"
          ? "Sender rule saved — still on Declutter."
          : "Domain rule saved — still on Declutter."
      );
    });
  };

  const handleAccept = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("emailEventId", id);
      fd.set("returnTo", declutterReturn);
      fd.set("noRedirect", "true");
      await acceptSuggestion(fd);
      afterRowRemoved("Suggestion dismissed — still on Declutter.");
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("emailEventId", id);
      fd.set("ruleType", "both");
      fd.set("returnTo", declutterReturn);
      fd.set("noRedirect", "true");
      await rejectSuggestion(fd);
      afterRowRemoved("We will not suggest rules for this sender/domain again.");
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
          <div className="text-xs text-muted-foreground/75 mt-2 space-y-1">
            <p>
              <span className="text-foreground/85">Rules</span> classify or archive{" "}
              <em>future</em> mail. <span className="text-foreground/85">Unsubscribe</span> tries to{" "}
              <em>stop the list</em> (List-Unsubscribe / one-click when present).
            </p>
            {showUnsubHint && (
              <p>No List-Unsubscribe header on this message — use a rule or open in Gmail.</p>
            )}
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

        {showUnsub && (
          <div className="flex flex-col gap-1 rounded-xl border border-border/10 bg-surface/40 px-2 py-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Unsubscribe</span>
            <UnsubscribeButton
              emailEventId={id}
              className="rounded-lg border border-border/10 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-surface2/60"
            />
          </div>
        )}

        <Button variant="secondary" type="button" disabled={isPending} onClick={handleAccept}>
          {isPending ? "…" : "Dismiss / not now"}
        </Button>

        {s.band === "mid" && (hasSender || hasDomain) && (
          <Button variant="tertiary" type="button" disabled={isPending} onClick={handleReject}>
            Don&apos;t suggest again
          </Button>
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
