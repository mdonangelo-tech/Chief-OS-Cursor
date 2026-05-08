import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { SettingsOnboardingUndoClient } from "@/app/(dashboard)/settings/onboarding/undo-client";
import { LocalTime } from "@/components/LocalTime";

export default async function PersonalSetupManagePage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const lastRun = await prisma.onboardingRun.findFirst({
    where: { userId },
    select: { id: true, status: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/settings/personal" className="hover:text-foreground">
          ← Back to Personal context
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Personalization refresh</h1>
        <p className="text-muted-foreground mt-1">
          Rerun setup when goals, accounts, or preferences change.
        </p>
      </div>

      <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-2 text-sm text-muted-foreground shadow-soft">
        <div>
          <span className="text-muted-foreground">Last run:</span>{" "}
          {lastRun ? (
            <span className="text-foreground">
              <LocalTime value={lastRun.createdAt} /> · {lastRun.status}
            </span>
          ) : (
            <span className="text-muted-foreground">None yet</span>
          )}
        </div>
        {lastRun?.completedAt && (
          <div>
            <span className="text-muted-foreground">Completed:</span>{" "}
            <span className="text-foreground">
              <LocalTime value={lastRun.completedAt} />
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/settings/personal/setup"
          className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
        >
          Start setup flow
        </Link>
        {lastRun && <SettingsOnboardingUndoClient runId={lastRun.id} />}
        <Link href="/settings/accounts" className="text-sm text-muted-foreground hover:text-foreground">
          Add another account
        </Link>
      </div>
    </div>
  );
}

