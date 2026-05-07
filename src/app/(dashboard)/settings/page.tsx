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
        <p className="text-muted-foreground mt-1">Make ChiefOS work the way you do.</p>
      </div>

      {onboardingV1Enabled() && !lastOnboardingRun && (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 shadow-soft">
          <div className="font-medium text-foreground">Finish onboarding (recommended)</div>
          <div className="text-sm text-muted-foreground mt-1">
            A quick scan helps ChiefOS personalize your Brief and declutter rules.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/settings/personal/setup"
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Start setup
            </Link>
            {accountsCount === 0 && (
              <Link href="/settings/accounts" className="text-sm text-accent hover:underline">
                Connect accounts first
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/settings/personal"
          className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
        >
          <div className="font-medium text-foreground">Personal context</div>
          <div className="text-sm text-muted-foreground mt-1">Goals and preferences used to shape your Brief.</div>
        </Link>

        <Link
          href="/settings/accounts"
          className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
        >
          <div className="font-medium text-foreground">Accounts</div>
          <div className="text-sm text-muted-foreground mt-1">Connect Gmail + Calendar and manage sync.</div>
        </Link>

        <Link
          href="/settings/declutter"
          className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
        >
          <div className="font-medium text-foreground">Declutter</div>
          <div className="text-sm text-muted-foreground mt-1">Automation policies, rules, and review queue.</div>
        </Link>

        <Link
          href="/settings/categories"
          className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
        >
          <div className="font-medium text-foreground">Categories</div>
          <div className="text-sm text-muted-foreground mt-1">Organize categories and protection rules.</div>
        </Link>

        <Link
          href="/audit"
          className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
        >
          <div className="font-medium text-foreground">Audit</div>
          <div className="text-sm text-muted-foreground mt-1">See what ChiefOS did and undo safely.</div>
        </Link>

        {onboardingV1Enabled() && (
          <Link
            href="/settings/personal/setup/manage"
            className="rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
          >
            <div className="font-medium text-foreground">Setup scan</div>
            <div className="text-sm text-muted-foreground mt-1">Refresh insights and recommendations.</div>
          </Link>
        )}
      </div>
    </div>
  );
}

