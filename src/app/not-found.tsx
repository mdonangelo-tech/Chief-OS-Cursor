import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-3">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-zinc-400">
          The page you’re looking for doesn’t exist (or moved).
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/brief"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white font-medium hover:bg-amber-500"
          >
            Go to Brief
          </Link>
          <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-200">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}

