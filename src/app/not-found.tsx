import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-border/10 bg-surface/60 p-6 space-y-3 shadow-soft">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you’re looking for doesn’t exist (or moved).
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/brief"
            className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground font-medium hover:opacity-90"
          >
            Go to Brief
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}

