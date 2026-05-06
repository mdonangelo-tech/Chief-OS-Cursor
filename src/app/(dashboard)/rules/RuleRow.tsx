"use client";

import { useState } from "react";
import { convertDomainRuleToSender, convertPersonRuleToDomain, updateRuleCategory } from "@/lib/brief-actions";

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
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSenderEmail, setConvertSenderEmail] = useState("");
  const [useNew, setUseNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");

  const roots = categories.filter((c) => !c.parentId);

  const currentCat = categories.find((c) => c.id === categoryId);
  if (!editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/10 bg-surface/60 px-3 py-2 text-sm shadow-soft">
        <span className="text-foreground truncate min-w-0">{label}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-muted-foreground">
          {currentCat ? categoryLabel(currentCat) : "—"}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-accent ml-2"
        >
          Change
        </button>

        <div className="ml-auto flex items-center gap-2">
          {ruleType === "person" ? (
            <form action={convertPersonRuleToDomain}>
              <input type="hidden" name="ruleId" value={ruleId} />
              <input type="hidden" name="returnTo" value="/settings/declutter#rules" />
              <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                Convert → domain
              </button>
            </form>
          ) : (
            <>
              {!convertOpen ? (
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Convert → sender
                </button>
              ) : (
                <form action={convertDomainRuleToSender} className="flex items-center gap-2">
                  <input type="hidden" name="ruleId" value={ruleId} />
                  <input type="hidden" name="returnTo" value="/settings/declutter#rules" />
                  <input
                    name="senderEmail"
                    value={convertSenderEmail}
                    onChange={(e) => setConvertSenderEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-44 rounded-xl border border-border/10 bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                    required
                  />
                  <button type="submit" className="text-xs text-accent hover:text-accent/80">
                    Convert
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConvertOpen(false);
                      setConvertSenderEmail("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-border/10 bg-surface/60 px-3 py-2 shadow-soft">
      <form action={updateRuleCategory} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="ruleType" value={ruleType} />
        <input type="hidden" name="ruleId" value={ruleId} />
        <span className="text-muted-foreground text-sm">{label} →</span>
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
            className="rounded-xl border border-border/10 bg-background px-2 py-1 text-sm text-foreground min-w-[140px]"
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
          className="text-xs text-muted-foreground hover:text-accent"
        >
          {useNew ? "Pick existing" : "+ New"}
        </button>
        <button
          type="submit"
          className="text-sm text-accent hover:text-accent/80"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </form>
    </li>
  );
}
