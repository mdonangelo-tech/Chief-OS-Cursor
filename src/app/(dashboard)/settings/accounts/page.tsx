import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { asDbErrorInfo } from "@/lib/db-errors";
import Link from "next/link";
import { SyncButtons } from "./SyncButtons";
import { LocalTime } from "@/components/LocalTime";

type AccountSyncState = {
  lastSyncAt?: string;
  authError?: { code?: string; message?: string } | null;
  lastSyncResult?: { errors?: string[] } | null;
  lastCalendarSyncResult?: { errors?: string[] } | null;
} | null;

function topErrors(errors: unknown, max = 2): string[] {
  if (!Array.isArray(errors)) return [];
  const out: string[] = [];
  for (const e of errors) {
    const s = typeof e === "string" ? e : "";
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; sync?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  let googleAccounts: Awaited<ReturnType<typeof prisma.googleAccount.findMany>> = [];
  let dbError: string | null = null;
  try {
    googleAccounts = await prisma.googleAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    dbError = asDbErrorInfo(e)?.message ?? (e as Error)?.message ?? "Database error";
  }

  const hasGoogleConfig =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Connected Accounts</h1>
        <p className="text-muted-foreground mt-1">
          Connect Google accounts for Gmail and Calendar
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          {params.error}
        </div>
      )}
      {dbError && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          {dbError}
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
      {params.sync === "warn" && (
        <div className="rounded-lg bg-amber-950/40 border border-amber-800 px-4 py-3 text-amber-200 text-sm">
          Sync completed with some errors
        </div>
      )}
      {params.sync === "reconnect" && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          Sync failed: Google authorization expired or was revoked. Reconnect your Google account below.
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
              const syncState = acc.syncStateJson as AccountSyncState;
              const needsReconnect = syncState?.authError?.code === "RECONNECT_REQUIRED";
              const gmailErrs = topErrors(syncState?.lastSyncResult?.errors, 2);
              const calErrs = topErrors(syncState?.lastCalendarSyncResult?.errors, 2);
              const hasSomeErrors = gmailErrs.length > 0 || calErrs.length > 0;
              return (
                <li
                  key={acc.id}
                  className="rounded-2xl border border-border/10 bg-surface/60 px-4 py-3 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-medium">{acc.email}</span>
                      {acc.userDefinedLabel && (
                        <span className="ml-2 text-muted-foreground text-sm">
                          ({acc.userDefinedLabel})
                        </span>
                      )}
                      {syncState?.lastSyncAt && (
                        <span className="ml-2 text-muted-foreground/80 text-xs">
                          last sync <LocalTime value={syncState.lastSyncAt} />
                        </span>
                      )}
                      {needsReconnect && (
                        <span className="ml-2 text-danger text-xs">
                          reconnect required
                        </span>
                      )}
                      {hasSomeErrors && (
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {gmailErrs.length > 0 && (
                            <div>
                              <span className="text-accent">Gmail:</span>{" "}
                              {gmailErrs.join(" · ")}
                            </div>
                          )}
                          {calErrs.length > 0 && (
                            <div>
                              <span className="text-accent">Calendar:</span>{" "}
                              {calErrs.join(" · ")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <a
                      href="/api/connect-google?returnTo=/settings/accounts"
                      className={
                        needsReconnect
                          ? "text-sm text-accent hover:text-accent/80"
                          : "text-sm text-muted-foreground hover:text-foreground"
                      }
                    >
                      Reconnect
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {googleAccounts.length > 0 && (
          <SyncButtons />
        )}
        {googleAccounts.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <Link href="/settings/accounts/preferences" className="text-accent hover:underline">
              Account preferences →
            </Link>
          </div>
        )}
        {hasGoogleConfig ? (
          <a
            href="/api/connect-google"
            className="inline-flex items-center gap-2 rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-foreground hover:bg-surface2/60"
          >
            {googleAccounts.length === 0
              ? "Connect Google account"
              : "Connect another Google account"}
          </a>
        ) : (
          <p className="text-muted-foreground text-sm">
            Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to
            connect Google accounts.
          </p>
        )}
      </section>

      <p className="text-muted-foreground text-sm">
        <Link href="/brief" className="hover:text-foreground">
          ← Back to Brief
        </Link>
      </p>
    </div>
  );
}
