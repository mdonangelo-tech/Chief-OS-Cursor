import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { onboardingV1Enabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { SidebarNavLinks } from "@/app/(dashboard)/SidebarNavLinks";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id!;
  let hasCompletedOnboarding = false;
  if (onboardingV1Enabled()) {
    try {
      const run = await prisma.onboardingRun.findFirst({
        where: { userId, status: "complete" },
        select: { id: true },
        orderBy: { completedAt: "desc" },
      });
      hasCompletedOnboarding = !!run;
    } catch {
      // If onboarding tables aren't migrated yet, don't block navigation.
      hasCompletedOnboarding = false;
    }
  }

  const connectedAccountsCount = await prisma.googleAccount.count({
    where: { userId },
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden sm:flex w-64 shrink-0 border-r border-border/10 bg-background/80 backdrop-blur flex-col sticky top-0 h-screen">
        <div className="px-4 py-4">
          <Link
            href="/brief"
            className="flex items-baseline gap-2 font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            <span>ChiefOS</span>
            <span className="text-xs font-normal text-muted-foreground">
              Chief of Staff
            </span>
          </Link>

          <div className="mt-5">
            <SidebarNavLinks
              showFinishSetup={onboardingV1Enabled() && !hasCompletedOnboarding}
            />
          </div>
        </div>

        <div className="mt-auto border-t border-border/10 px-4 py-4">
          <div className="text-sm font-medium text-foreground truncate">
            {session.user.name ?? "Signed in"}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {session.user.email ?? ""}
          </div>
          <div className="text-xs text-muted-foreground/80 mt-2">
            Connected accounts: {connectedAccountsCount.toLocaleString()}
          </div>
          <form
            className="mt-3"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-xl bg-surface2/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-surface2/80 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-border/10 bg-background/80 backdrop-blur px-4 py-3 sm:px-6 sm:py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <Link
              href="/brief"
              className="sm:hidden flex items-baseline gap-2 font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <span>ChiefOS</span>
            </Link>
            <div className="text-sm text-muted-foreground">
              {onboardingV1Enabled() && !hasCompletedOnboarding ? (
                <Link
                  href="/settings/personal/setup"
                  className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  Finish setup
                </Link>
              ) : (
                <span className="hidden sm:inline">Workspace</span>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
