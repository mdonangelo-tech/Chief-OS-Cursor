import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addCategory,
  renameCategory,
  setCategoryParent,
  toggleCategoryProtected,
} from "@/lib/setup-actions";
import { DeleteCategoryButton } from "./DeleteCategoryButton";
import Link from "next/link";

function extractDomain(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  const email = match ? match[1].toLowerCase().trim() : fromHeader.trim();
  if (!email.includes("@")) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

export default async function CategoriesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [categories, accountIds] = await Promise.all([
    prisma.category.findMany({
      where: { userId: session.user.id },
      include: { parent: true, children: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    }),
    prisma.googleAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ]);

  const topSenders: { value: string; type: "domain" | "from"; count: number }[] = [];
  if (accountIds.length > 0) {
    const emails = await prisma.emailEvent.groupBy({
      by: ["from_"],
      where: { googleAccountId: { in: accountIds.map((a) => a.id) } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    });
    const byDomain = new Map<string, number>();
    for (const row of emails) {
      const d = extractDomain(row.from_);
      if (d) {
        byDomain.set(d, (byDomain.get(d) ?? 0) + row._count.id);
      }
    }
    for (const [domain, count] of Array.from(byDomain.entries()).sort(
      (a, b) => b[1] - a[1]
    )) {
      topSenders.push({ value: domain, type: "domain", count });
    }
  }
  const existingDomains = new Set(
    (await prisma.orgRule.findMany({ where: { userId: session.user.id }, select: { domain: true } })).map(
      (r) => r.domain
    )
  );
  const suggestions = topSenders.filter((s) => !existingDomains.has(s.value)).slice(0, 5);

  const roots = categories.filter((c) => !c.parentId);
  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const key = c.parentId ?? "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-zinc-400 mt-1">
          Create, rename, and organize categories. Set parent for subcategories.
          Protected categories are never auto-archived.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium text-zinc-200 mb-3">Add category</h2>
        <form action={addCategory} className="flex gap-2">
          <input type="hidden" name="returnTo" value="/settings/categories" />
          <input
            type="text"
            name="name"
            placeholder="Category name"
            required
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 placeholder-zinc-500 w-48"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            Add
          </button>
        </form>
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-zinc-200 mb-3">Suggestions</h2>
          <p className="text-zinc-500 text-sm mb-2">
            Top domains by volume — add as category to classify
          </p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li
                key={s.value}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2"
              >
                <span className="text-zinc-300">{s.value}</span>
                <span className="text-zinc-500 text-sm">{s.count} emails</span>
                <form action={addCategory}>
                  <input type="hidden" name="returnTo" value="/settings/categories" />
                  <input type="hidden" name="name" value={s.value} />
                  <button
                    type="submit"
                    className="text-sm text-amber-500 hover:text-amber-400"
                  >
                    Add category
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-zinc-200 mb-3">All categories</h2>
        {categories.length === 0 ? (
          <p className="text-zinc-500 text-sm">No categories yet. Add one above or in Setup.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
              >
                <form action={renameCategory} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input
                    type="text"
                    name="name"
                    defaultValue={c.name}
                    className="bg-transparent text-zinc-200 outline-none border-b border-transparent hover:border-zinc-600 w-32"
                  />
                  <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-400">
                    Rename
                  </button>
                </form>
                <form action={setCategoryParent} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <select
                    name="parentId"
                    defaultValue={c.parentId ?? ""}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-300"
                  >
                    <option value="">— None (root)</option>
                    {roots.filter((p) => p.id !== c.id).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-400">
                    Set parent
                  </button>
                </form>
                <form action={toggleCategoryProtected}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className={`text-xs px-2 py-0.5 rounded ${
                      c.protectedFromAutoArchive
                        ? "bg-amber-900/50 text-amber-200"
                        : "bg-zinc-800 text-zinc-500 hover:text-zinc-400"
                    }`}
                  >
                    {c.protectedFromAutoArchive ? "Protected" : "Not protected"}
                  </button>
                </form>
                <DeleteCategoryButton id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-zinc-500 text-sm">
        <Link href="/brief" className="hover:text-zinc-400">
          ← Back to Brief
        </Link>
        {" · "}
        <Link href="/settings/declutter" className="hover:text-zinc-400">
          Declutter rules
        </Link>
      </p>
    </div>
  );
}
