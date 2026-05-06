import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { LocalTime } from "@/components/LocalTime";

export default async function OnboardingIntroPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [accountsCount, lastComplete] = await Promise.all([
    prisma.googleAccount.count({ where: { userId } }),
    prisma.onboardingRun.findFirst({
      where: { userId, status: "complete" },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    }),
  ]);

  if (lastComplete) {
    const [accounts, goals, declutterPref, accountPrefs] = await Promise.all([
      prisma.googleAccount.findMany({
        where: { userId },
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.userGoal.findMany({
        where: { userId, key: { not: "__free_text" } },
        select: { key: true, label: true, enabled: true },
        orderBy: { key: "asc" },
      }),
      prisma.userDeclutterPref.findUnique({
        where: { userId },
        select: { autoArchiveEnabled: true },
      }),
      prisma.userAccountPreference.findMany({
        where: { userId },
        select: { googleAccountId: true, accountType: true, isPrimary: true, includeInOnboarding: true, displayName: true },
      }),
    ]);

    const prefById = new Map(accountPrefs.map((p) => [p.googleAccountId, p]));
    const enabledGoals = goals.filter((g) => g.enabled).map((g) => g.label);

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Onboarding complete</h1>
          <p className="text-muted-foreground mt-1">Here’s what ChiefOS learned about you.</p>
          <p className="text-muted-foreground text-sm mt-2">
            Last completed <LocalTime value={lastComplete.completedAt} /> · Run {lastComplete.id}
          </p>
        </div>

        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-2 shadow-soft">
          <div className="text-xs text-muted-foreground">Goals</div>
          {enabledGoals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {enabledGoals.slice(0, 8).map((g) => (
                <span key={g} className="rounded-full border border-border/10 bg-surface/50 px-3 py-1 text-xs text-foreground/90">
                  {g}
                </span>
              ))}
              {enabledGoals.length > 8 && (
                <span className="text-xs text-muted-foreground">+{enabledGoals.length - 8} more</span>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No goals selected yet.</div>
          )}
          <Link href="/settings/personal" className="text-sm text-accent hover:underline">
            Edit goals →
          </Link>
        </div>

        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-2 shadow-soft">
          <div className="text-xs text-muted-foreground">Connected accounts</div>
          <ul className="text-sm text-foreground/90 space-y-1">
            {accounts.map((a) => {
              const p = prefById.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground">{a.email}</span>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="text-muted-foreground">
                    {p?.displayName ? p.displayName : p?.accountType ?? "unknown"}
                    {p?.isPrimary ? " (primary)" : ""}
                  </span>
                  {p?.includeInOnboarding === false && (
                    <span className="text-xs text-muted-foreground">(excluded from onboarding)</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 pt-2">
            <Link href="/settings/accounts" className="text-sm text-accent hover:underline">
              Manage accounts →
            </Link>
            <Link href="/settings/onboarding" className="text-sm text-muted-foreground hover:text-foreground">
              Re-run onboarding scan
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-2 shadow-soft">
          <div className="text-xs text-muted-foreground">Automation defaults</div>
          <div className="text-sm text-foreground/90">
            Auto-archive is{" "}
            <span className="font-medium text-foreground">
              {declutterPref?.autoArchiveEnabled ? "On" : "Off"}
            </span>
            .
          </div>
          <Link href="/settings/declutter" className="text-sm text-accent hover:underline">
            Edit declutter settings →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/brief"
            className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
          >
            Go to Brief
          </Link>
          <Link
            href="/settings"
            className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-foreground hover:bg-surface2/60"
          >
            Edit in Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Elite Chief of Staff</h1>
        <p className="text-muted-foreground mt-1">
          A quick setup to learn your goals, scan email + calendar, and generate a day-1 brief.
        </p>
      </div>

      <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
        <h2 className="text-lg font-medium">What happens next</h2>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Confirm which accounts to include (default: all)</li>
          <li>Pick what you’re optimizing for in the next 30 days</li>
          <li>Run a scan and get actionable insights</li>
        </ul>
      </div>

      {accountsCount === 0 ? (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
          <p className="text-sm text-muted-foreground">
            First, connect at least one Google account (Gmail + Calendar).
          </p>
          <Link
            href="/api/connect-google?returnTo=/onboarding"
            className="inline-block rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
          >
            Connect Google account
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            href="/onboarding/accounts"
            className="inline-block rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
          >
            Continue
          </Link>
          <Link
            href="/settings/accounts"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Manage accounts
          </Link>
        </div>
      )}
    </div>
  );
}

