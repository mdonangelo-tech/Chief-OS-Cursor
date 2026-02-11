"use client";

import { deleteCategory } from "@/lib/setup-actions";

export function DeleteCategoryButton({ id }: { id: string }) {
  return (
    <form
      action={deleteCategory}
      onSubmit={(e) => {
        if (!confirm("Delete this category?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-xs text-red-500/80 hover:text-red-400"
      >
        Delete
      </button>
    </form>
  );
}
