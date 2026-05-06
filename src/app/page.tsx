import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-2xl font-semibold mb-4">Chief of Staff</h1>
      <p className="text-muted-foreground mb-8">Your calm, trustworthy daily brief</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-accent-foreground font-medium"
        >
          Log in
        </Link>
        {process.env.NODE_ENV !== "production" && (
          <Link
            href="/dev/magic-links"
            className="px-4 py-2 rounded-xl border border-border/10 bg-surface/50 text-muted-foreground hover:text-foreground hover:bg-surface2/60"
          >
            Dev: Magic Links
          </Link>
        )}
      </div>
    </main>
  );
}
