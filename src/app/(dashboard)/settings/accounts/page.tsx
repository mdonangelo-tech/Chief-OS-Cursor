import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SyncButtons } from "./SyncButtons";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; sync?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const googleAccounts = await prisma.googleAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  const hasGoogleConfig =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Connected Accounts</h1>
        <p className="text-zinc-400 mt-1">
          Connect Google accounts for Gmail and Calendar
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          {params.error}
        </div>
      )}
      {params.success === "connected" && (
        <div className="rounded-lg bg-emerald-950/50 border border-emerald-800 px-4 py-3 text-emerald-300 text-sm">
          Google account connected successfully
        </div>
      )}
      {params.sync === "ok" && (
        <div className="rounded-lg bg-emerald-950/50 border border-emerald-800 px-4 py-3 text-emerald-300 text-sm">
          Sync completed
        </div>
      )}
      {params.sync === "error" && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          Sync failed
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Google (Gmail + Calendar)</h2>
        {googleAccounts.length > 0 && (
          <ul className="space-y-2">
            {googleAccounts.map((acc) => {
              const syncState = acc.syncStateJson as { lastSyncAt?: string } | null;
              return (
                <li
                  key={acc.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <div>
                    <span className="font-medium">{acc.email}</span>
                    {acc.userDefinedLabel && (
                      <span className="ml-2 text-zinc-500 text-sm">
                        ({acc.userDefinedLabel})
                      </span>
                    )}
                    {syncState?.lastSyncAt && (
                      <span className="ml-2 text-zinc-600 text-xs">
                        last sync {new Date(syncState.lastSyncAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {googleAccounts.length > 0 && (
          <SyncButtons />
        )}
        {hasGoogleConfig ? (
          <a
            href="/api/connect-google"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-4 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {googleAccounts.length === 0
              ? "Connect Google account"
              : "Connect another Google account"}
          </a>
        ) : (
          <p className="text-zinc-500 text-sm">
            Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to
            connect Google accounts.
          </p>
        )}
      </section>

      <p className="text-zinc-500 text-sm">
        <Link href="/brief" className="hover:text-zinc-400">
          ← Back to Brief
        </Link>
      </p>
    </div>
  );
}
