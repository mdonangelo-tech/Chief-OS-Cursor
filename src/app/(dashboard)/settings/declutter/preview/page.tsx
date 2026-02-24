import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PreviewTable } from "./PreviewTable";

export default async function DeclutterPreviewPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const categoriesById = Object.fromEntries(
    categories.map((c) => [c.id, { id: c.id, name: c.name }])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Declutter preview</h1>
          <p className="text-zinc-400 mt-1">
            Read-only preview of categorization + declutter decisions for emails currently in your inbox.
          </p>
        </div>
        <Link
          href="/settings/declutter"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back
        </Link>
      </div>

      <PreviewTable categoriesById={categoriesById} />
    </div>
  );
}

