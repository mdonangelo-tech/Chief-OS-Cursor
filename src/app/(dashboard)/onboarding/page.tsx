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
          <p className="text-zinc-400 mt-1">Here’s what ChiefOS learned about you.</p>
          <p className="text-zinc-500 text-sm mt-2">
            Last completed <LocalTime value={lastComplete.completedAt} /> · Run {lastComplete.id}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-2">
          <div className="text-xs text-zinc-500">Goals</div>
          {enabledGoals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {enabledGoals.slice(0, 8).map((g) => (
                <span key={g} className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  {g}
                </span>
              ))}
              {enabledGoals.length > 8 && (
                <span className="text-xs text-zinc-500">+{enabledGoals.length - 8} more</span>
              )}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">No goals selected yet.</div>
          )}
          <Link href="/settings/personal" className="text-sm text-amber-500 hover:underline">
            Edit goals →
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-2">
          <div className="text-xs text-zinc-500">Connected accounts</div>
          <ul className="text-sm text-zinc-300 space-y-1">
            {accounts.map((a) => {
              const p = prefById.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-200">{a.email}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">
                    {p?.displayName ? p.displayName : p?.accountType ?? "unknown"}
                    {p?.isPrimary ? " (primary)" : ""}
                  </span>
                  {p?.includeInOnboarding === false && (
                    <span className="text-xs text-zinc-500">(excluded from onboarding)</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 pt-2">
            <Link href="/settings/accounts" className="text-sm text-amber-500 hover:underline">
              Manage accounts →
            </Link>
            <Link href="/settings/onboarding" className="text-sm text-zinc-500 hover:text-zinc-300">
              Re-run onboarding scan
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-2">
          <div className="text-xs text-zinc-500">Automation defaults</div>
          <div className="text-sm text-zinc-300">
            Auto-archive is{" "}
            <span className="font-medium text-zinc-200">
              {declutterPref?.autoArchiveEnabled ? "On" : "Off"}
            </span>
            .
          </div>
          <Link href="/settings/declutter" className="text-sm text-amber-500 hover:underline">
            Edit declutter settings →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/brief"
            className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
          >
            Go to Brief
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
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
        <p className="text-zinc-400 mt-1">
          A quick setup to learn your goals, scan email + calendar, and generate a day-1 brief.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
        <h2 className="text-lg font-medium">What happens next</h2>
        <ul className="text-sm text-zinc-400 space-y-1 list-disc pl-5">
          <li>Confirm which accounts to include (default: all)</li>
          <li>Pick what you’re optimizing for in the next 30 days</li>
          <li>Run a scan and get actionable insights</li>
        </ul>
      </div>

      {accountsCount === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
          <p className="text-sm text-zinc-400">
            First, connect at least one Google account (Gmail + Calendar).
          </p>
          <Link
            href="/api/connect-google?returnTo=/onboarding"
            className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
          >
            Connect Google account
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            href="/onboarding/accounts"
            className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
          >
            Continue
          </Link>
          <Link
            href="/settings/accounts"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Manage accounts
          </Link>
        </div>
      )}
    </div>
  );
}

