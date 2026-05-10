import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addCategory } from "@/lib/setup-actions";
import { CategoryRow } from "./CategoryRow";
import { Button } from "@/components/ui/Button";
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
        <p className="text-muted-foreground mt-1">
          Create, rename, and organize categories. Use <strong>More</strong> on each row for parent,
          protection, or delete. Protected categories are never auto-archived.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Add category</h2>
        <form action={addCategory} className="flex gap-2">
          <input type="hidden" name="returnTo" value="/settings/categories" />
          <input
            type="text"
            name="name"
            placeholder="Category name"
            required
            className="rounded-xl border border-border/10 bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground w-48"
          />
          <Button variant="primary" type="submit" className="px-4 py-2">
            Add
          </Button>
        </form>
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-foreground mb-3">Suggestions</h2>
          <p className="text-muted-foreground text-sm mb-2">
            Top domains by volume — add as category to classify
          </p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li
                key={s.value}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/10 bg-surface/60 px-4 py-2 shadow-soft"
              >
                <span className="text-foreground">{s.value}</span>
                <span className="text-muted-foreground text-sm">{s.count} emails</span>
                <form action={addCategory}>
                  <input type="hidden" name="returnTo" value="/settings/categories" />
                  <input type="hidden" name="name" value={s.value} />
                  <button
                    type="submit"
                    className="text-sm text-accent hover:text-accent/80"
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
        <h2 className="text-lg font-medium text-foreground mb-3">All categories</h2>
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">No categories yet. Add one above.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => (
              <CategoryRow key={c.id} c={c} roots={roots} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-sm">
        <Link href="/brief" className="hover:text-foreground">
          ← Back to Brief
        </Link>
        {" · "}
        <Link href="/settings/declutter" className="hover:text-foreground">
          Declutter rules
        </Link>
      </p>
    </div>
  );
}
