import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <h1 className="text-2xl font-semibold mb-4">Chief of Staff</h1>
      <p className="text-zinc-400 mb-8">Your calm, trustworthy daily brief</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
        >
          Log in
        </Link>
        {process.env.NODE_ENV !== "production" && (
          <Link
            href="/dev/magic-links"
            className="px-4 py-2 rounded border border-zinc-600 text-zinc-400 hover:text-zinc-200"
          >
            Dev: Magic Links
          </Link>
        )}
      </div>
    </main>
  );
}
