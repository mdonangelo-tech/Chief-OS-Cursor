"use client";

import { useState, useTransition } from "react";
import { upsertCategoryDeclutterRule, deleteCategory } from "@/lib/setup-actions";

interface CategoryRuleRowProps {
  categoryId: string;
  categoryName: string;
  currentAction: string;
  currentArchiveAfterDays: number | null;
}

export function CategoryRuleRow({
  categoryId,
  categoryName,
  currentAction,
  currentArchiveAfterDays,
}: CategoryRuleRowProps) {
  const [action, setAction] = useState(currentAction);
  const [days, setDays] = useState(currentArchiveAfterDays ?? 7);
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    startTransition(async () => {
      const form = document.getElementById(`category-rule-form-${categoryId}`) as HTMLFormElement;
      if (!form) return;
      const fd = new FormData(form);
      fd.set("noRedirect", "true");
      await upsertCategoryDeclutterRule(fd);
      setDirty(false);
    });
  };

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-opacity ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <span className="text-zinc-200 min-w-[120px]">{categoryName}</span>
      <form
        id={`category-rule-form-${categoryId}`}
        action={upsertCategoryDeclutterRule}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="categoryId" value={categoryId} />
        <select
          name="action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            markDirty();
          }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
        >
          <option value="label_only">Label + digest</option>
          <option value="archive_after_48h">Archive after 48h</option>
          <option value="archive_after_days">Archive after N days</option>
          <option value="move_to_spam">Move to Spam</option>
          <option value="never">Never</option>
        </select>
        {action === "archive_after_days" && (
          <label className="flex items-center gap-1 text-sm text-zinc-400">
            <span>Days:</span>
            <input
              type="number"
              name="archiveAfterDays"
              min={1}
              max={365}
              value={days}
              onChange={(e) => {
                const v = Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 7));
                setDays(v);
                markDirty();
              }}
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 text-sm"
            />
          </label>
        )}
        {dirty ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="text-sm text-amber-500 hover:text-amber-400 disabled:opacity-50"
          >
            Update
          </button>
        ) : (
          <span className="text-sm text-emerald-500">✓ Saved</span>
        )}
      </form>
      <form
        action={deleteCategory}
        onSubmit={(e) => {
          if (!confirm(`Remove "${categoryName}"? This will delete the category.`)) {
            e.preventDefault();
          }
        }}
        className="ml-auto"
      >
        <input type="hidden" name="id" value={categoryId} />
        <button type="submit" className="text-xs text-red-500/80 hover:text-red-400">
          Remove
        </button>
      </form>
    </li>
  );
}
