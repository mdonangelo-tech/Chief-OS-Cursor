import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceSyncClient } from "./WorkspaceSyncClient";

export default async function WorkspaceSyncSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const prefs = await prisma.userCalendarPreferences.findUnique({
    where: { userId: session.user.id },
    select: {
      timezone: true,
      morningPrepLocalTime: true,
      refreshMode: true,
      periodicRefreshHours: true,
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground">
          ← Back to Settings overview
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Brief freshness</h1>
        <p className="text-muted-foreground mt-1">
          Control when ChiefOS updates the context behind your Brief.
        </p>
      </div>

      <WorkspaceSyncClient
        initialTimezone={prefs?.timezone ?? null}
        initialMorningPrepLocalTime={prefs?.morningPrepLocalTime ?? null}
        initialRefreshMode={
          prefs?.refreshMode === "morning_prep" ||
          prefs?.refreshMode === "smart_periodic" ||
          prefs?.refreshMode === "manual"
            ? prefs.refreshMode
            : null
        }
        initialPeriodicRefreshHours={prefs?.periodicRefreshHours ?? null}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/settings/accounts"
          className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-foreground hover:bg-surface2/60"
        >
          Accounts &amp; connection health →
        </Link>
        <Link
          href="/settings/personal/setup/manage"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Personalization refresh
        </Link>
      </div>
    </div>
  );
}

