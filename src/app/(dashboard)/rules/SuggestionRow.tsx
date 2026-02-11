"use client";

import { useState, useTransition } from "react";
import { approveRule, rejectSuggestion, acceptSuggestion } from "@/lib/brief-actions";
import { UnsubscribeButton } from "@/app/(dashboard)/brief/UnsubscribeButton";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { name: string } | null;
}

interface SuggestionRowProps {
  id: string;
  from: string;
  snippet: string | null;
  categoryName: string;
  categoryId: string;
  confidence: number | null;
  band: "high" | "mid";
  hasSender: boolean;
  hasDomain: boolean;
  categories: Category[];
}

function categoryLabel(c: Category): string {
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

export function SuggestionRow({
  id,
  from,
  snippet,
  categoryName,
  categoryId,
  confidence,
  band,
  hasSender,
  hasDomain,
  categories,
}: SuggestionRowProps) {
  const [useNew, setUseNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [savedSender, setSavedSender] = useState(false);
  const [savedDomain, setSavedDomain] = useState(false);

  const roots = categories.filter((c) => !c.parentId);

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
      className={`flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-opacity ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-zinc-300 min-w-0 truncate" title={from}>{from}</span>
        <span className="text-zinc-500 shrink-0">→</span>

        {(hasSender || hasDomain) && (
          <form id={`suggestion-form-${id}`} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="emailEventId" value={id} />
            <span className="text-zinc-500 text-sm shrink-0">to</span>
            {useNew ? (
              <>
                <input
                  type="text"
                  name="newCategoryName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New category name"
                  required
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 w-40"
                />
                <select
                  name="newCategoryParentId"
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-300 w-32"
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
                  className="text-xs text-zinc-500 hover:text-zinc-400"
                >
                  Cancel
                </button>
              </>
            ) : (
              <select
                name="categoryId"
                defaultValue={categoryId}
                className="rounded border border-amber-800 bg-amber-950/30 px-2 py-1.5 text-sm text-amber-200 font-medium min-w-[140px]"
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
                className="text-xs text-zinc-500 hover:text-amber-500"
              >
                + New category
              </button>
            )}

            <span className="text-zinc-600">|</span>

            {hasSender && (
              savedSender ? (
                <span className="rounded-md bg-emerald-800/50 px-2.5 py-1 text-sm text-emerald-200 font-medium">
                  ✓ Saved person rule
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCreateRule("sender")}
                  disabled={isPending}
                  className="rounded-md bg-amber-700/60 px-2.5 py-1 text-sm text-amber-100 hover:bg-amber-600/70 disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Create person rule"}
                </button>
              )
            )}
            {hasDomain && (
              savedDomain ? (
                <span className="rounded-md bg-emerald-800/50 px-2.5 py-1 text-sm text-emerald-200 font-medium">
                  ✓ Saved domain rule
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCreateRule("domain")}
                  disabled={isPending}
                  className="rounded-md bg-amber-700/60 px-2.5 py-1 text-sm text-amber-100 hover:bg-amber-600/70 disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Create domain rule"}
                </button>
              )
            )}
          </form>
        )}

        {["newsletters", "promotions", "low-priority"].includes(categoryName?.toLowerCase() ?? "") && (
          <UnsubscribeButton
            emailEventId={id}
            className="text-xs text-amber-500 hover:text-amber-400"
          />
        )}

        {/* Primary: Accept — looks good, clear from queue */}
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

        {confidence != null && (
          <span className="text-zinc-500 text-xs shrink-0">
            {Math.round(confidence * 100)}%
          </span>
        )}

        {band === "mid" && (hasSender || hasDomain) && (
          <form action={rejectSuggestion} className="inline">
            <input type="hidden" name="emailEventId" value={id} />
            <input type="hidden" name="ruleType" value="both" />
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-zinc-400"
            >
              Don&apos;t suggest again
            </button>
          </form>
        )}
      </div>
      {snippet && (
        <p className="text-zinc-500 text-sm line-clamp-2">{decodeSnippet(snippet)}</p>
      )}
    </li>
  );
}
