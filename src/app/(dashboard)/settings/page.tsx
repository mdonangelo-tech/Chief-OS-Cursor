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
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings overview</h1>
        <p className="text-muted-foreground mt-1">Tune the assistant, connect context, and keep ChiefOS trustworthy.</p>
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

      <div className="space-y-10">
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Personal
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/settings/personal"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Personal context</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Goals and preferences used to shape your Brief.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Workspace
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/settings/accounts"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Accounts</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Connect Gmail + Calendar and manage sync.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>

            <Link
              href="/settings/workspace-sync"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Brief freshness</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Control when ChiefOS updates the context behind your Brief.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Intelligence
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/settings/declutter"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Declutter</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Automation policies, rules, and review queue.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>

            <Link
              href="/settings/categories"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Categories</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Organize categories and protection rules.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>

            {onboardingV1Enabled() && (
              <Link
                href="/settings/personal/setup/manage"
                className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">Personalization refresh</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Rerun setup when goals, accounts, or preferences change.
                    </div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    →
                  </span>
                </div>
              </Link>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Operations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/audit"
              className="group rounded-2xl border border-border/10 bg-surface/50 p-5 hover:bg-surface2/60 transition-colors shadow-soft"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">Audit</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    See what ChiefOS did and undo safely.
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  →
                </span>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

