import { auth } from "@/auth";
import Link from "next/link";
import { AutoArchiveRunner } from "../AutoArchiveRunner";
import { ArchiveByDaysRunner } from "../ArchiveByDaysRunner";

export default async function DeclutterOperationsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Declutter</h1>
        <p className="text-muted-foreground mt-1">
          Operations: previews, upcoming actions, and safe undo.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/settings/declutter"
            className="rounded-xl px-3 py-1.5 text-sm font-medium bg-surface/50 text-muted-foreground hover:text-foreground hover:bg-surface2/60"
          >
            Policy
          </Link>
          <Link
            href="/settings/declutter/operations"
            aria-current="page"
            className="rounded-xl px-3 py-1.5 text-sm font-medium bg-surface2/70 text-foreground"
          >
            Operations
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-border/10 bg-surface/60 p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-foreground">Preview decisions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              See what would happen before automation runs.
            </p>
          </div>
          <Link
            href="/settings/declutter/preview"
            className="rounded-xl bg-surface2/70 px-4 py-2 text-sm text-foreground hover:opacity-90"
          >
            Open preview
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Upcoming auto-archive</h2>
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft">
          <AutoArchiveRunner />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Archive by age</h2>
        <p className="text-sm text-muted-foreground">
          One-off cleanups across inbox. Review Audit if you need to undo.
        </p>
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft">
          <ArchiveByDaysRunner />
        </div>
      </section>

      <div className="text-sm text-muted-foreground">
        <Link href="/audit" className="text-accent hover:underline">
          Open Audit →
        </Link>
      </div>
    </div>
  );
}

