import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { onboardingV1Enabled } from "@/lib/env";

export default async function SettingsHomePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const [accountsCount, lastOnboardingRun] = await Promise.all([
    prisma.googleAccount.count({ where: { userId } }),
    onboardingV1Enabled()
      ? prisma.onboardingRun.findFirst({
          where: { userId, status: "complete" },
          orderBy: { completedAt: "desc" },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-zinc-400 mt-1">Make ChiefOS work the way you do.</p>
      </div>

      {onboardingV1Enabled() && !lastOnboardingRun && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-5">
          <div className="font-medium text-amber-200">Finish onboarding (recommended)</div>
          <div className="text-sm text-amber-200/80 mt-1">
            A quick scan helps ChiefOS personalize your Brief and declutter rules.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/onboarding"
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
            >
              Start onboarding
            </Link>
            {accountsCount === 0 && (
              <Link href="/settings/accounts" className="text-sm text-amber-200 hover:underline">
                Connect accounts first
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/settings/accounts"
          className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/50 transition-colors"
        >
          <div className="font-medium text-zinc-200">Accounts</div>
          <div className="text-sm text-zinc-500 mt-1">Connect Gmail + Calendar and manage sync.</div>
        </Link>

        <Link
          href="/settings/declutter"
          className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/50 transition-colors"
        >
          <div className="font-medium text-zinc-200">Declutter</div>
          <div className="text-sm text-zinc-500 mt-1">Automation policies, rules, and review queue.</div>
        </Link>

        <Link
          href="/settings/categories"
          className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/50 transition-colors"
        >
          <div className="font-medium text-zinc-200">Categories</div>
          <div className="text-sm text-zinc-500 mt-1">Organize categories and protection rules.</div>
        </Link>

        {onboardingV1Enabled() && (
          <Link
            href="/settings/onboarding"
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/50 transition-colors"
          >
            <div className="font-medium text-zinc-200">Onboarding</div>
            <div className="text-sm text-zinc-500 mt-1">Re-run scan and manage onboarding state.</div>
          </Link>
        )}
      </div>
    </div>
  );
}

