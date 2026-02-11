"use client";

import { useState } from "react";
import { updateRuleCategory } from "@/lib/brief-actions";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { name: string } | null;
}

interface RuleRowProps {
  ruleType: "person" | "org";
  ruleId: string;
  label: string;
  categoryId: string;
  categoryName: string;
  categories: Category[];
}

function categoryLabel(c: Category): string {
  if (c.parent) {
    return `${c.parent.name} › ${c.name}`;
  }
  return c.name;
}

export function RuleRow({
  ruleType,
  ruleId,
  label,
  categoryId,
  categories,
}: RuleRowProps) {
  const [editing, setEditing] = useState(false);
  const [useNew, setUseNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");

  const roots = categories.filter((c) => !c.parentId);

  const currentCat = categories.find((c) => c.id === categoryId);
  if (!editing) {
    return (
      <li className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
        <span className="text-zinc-300 truncate">{label}</span>
        <span className="text-zinc-500">→</span>
        <span className="text-zinc-400">
          {currentCat ? categoryLabel(currentCat) : "—"}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-500 hover:text-amber-500 ml-2"
        >
          Change
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <form action={updateRuleCategory} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="ruleType" value={ruleType} />
        <input type="hidden" name="ruleId" value={ruleId} />
        <span className="text-zinc-400 text-sm">{label} →</span>
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
              <option value="">— Root</option>
              {roots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select
            name="categoryId"
            defaultValue={categoryId}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 min-w-[140px]"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            setUseNew(!useNew);
            if (useNew) setNewName("");
          }}
          className="text-xs text-zinc-500 hover:text-amber-500"
        >
          {useNew ? "Pick existing" : "+ New"}
        </button>
        <button
          type="submit"
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-zinc-500 hover:text-zinc-400"
        >
          Cancel
        </button>
      </form>
    </li>
  );
}
