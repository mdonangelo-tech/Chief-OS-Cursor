"use client";

import { deleteCategory } from "@/lib/setup-actions";
import { Button } from "@/components/ui/Button";

export function DeleteCategoryButton({ id }: { id: string }) {
  return (
    <form
      action={deleteCategory}
      onSubmit={(e) => {
        if (!confirm("Delete this category? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button variant="destructive" type="submit" className="w-full">
        Delete category
      </Button>
    </form>
  );
}
