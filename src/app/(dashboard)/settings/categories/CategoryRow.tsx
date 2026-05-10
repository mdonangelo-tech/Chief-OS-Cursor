"use client";

import { Button } from "@/components/ui/Button";
import { DeleteCategoryButton } from "./DeleteCategoryButton";
import { renameCategory, setCategoryParent, toggleCategoryProtected } from "@/lib/setup-actions";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  protectedFromAutoArchive: boolean;
};

export function CategoryRow({ c, roots }: { c: Category; roots: Category[] }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft">
      <form action={renameCategory} className="flex items-center gap-2 min-w-0 flex-1">
        <input type="hidden" name="id" value={c.id} />
        <input
          type="text"
          name="name"
          defaultValue={c.name}
          className="bg-transparent text-foreground outline-none border-b border-transparent hover:border-border/40 min-w-0 flex-1 max-w-[200px]"
        />
        <Button variant="secondary" type="submit" className="shrink-0">
          Save name
        </Button>
      </form>

      <details className="relative group">
        <summary className="cursor-pointer list-none rounded-lg border border-border/10 bg-surface/50 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          More
        </summary>
        <div className="absolute right-0 z-10 mt-1 min-w-[220px] rounded-xl border border-border/10 bg-surface p-3 shadow-soft space-y-3">
          <form action={setCategoryParent} className="space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="text-xs text-muted-foreground">Parent</div>
            <select
              name="parentId"
              defaultValue={c.parentId ?? ""}
              className="w-full rounded-xl border border-border/10 bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">— None (root)</option>
              {roots
                .filter((p) => p.id !== c.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <Button variant="secondary" type="submit" className="w-full">
              Update parent
            </Button>
          </form>
          <form action={toggleCategoryProtected}>
            <input type="hidden" name="id" value={c.id} />
            <p className="text-xs text-muted-foreground mb-2">
              Protected categories are never auto-archived by ChiefOS.
            </p>
            <Button variant={c.protectedFromAutoArchive ? "secondary" : "primary"} type="submit" className="w-full">
              {c.protectedFromAutoArchive ? "Remove protection" : "Mark protected"}
            </Button>
          </form>
          <div className="pt-1 border-t border-border/10">
            <DeleteCategoryButton id={c.id} />
          </div>
        </div>
      </details>
    </li>
  );
}
