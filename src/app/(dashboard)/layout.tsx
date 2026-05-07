import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { onboardingV1Enabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { DashboardNavLinks } from "@/app/(dashboard)/DashboardNavLinks";

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/10 bg-background/80 backdrop-blur px-4 py-3 sm:px-6 sm:py-4">
        <nav role="navigation" className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/brief"
              className="flex items-baseline gap-2 font-semibold text-accent hover:text-accent/80 transition-colors shrink-0"
            >
              <span>ChiefOS</span>
              <span className="hidden sm:inline text-xs font-normal text-muted-foreground">
                Chief of Staff
              </span>
            </Link>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline text-sm text-muted-foreground">
                {session.user.email ?? session.user.name}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <DashboardNavLinks />
            {onboardingV1Enabled() && !hasCompletedOnboarding && (
              <Link
                href="/onboarding"
                className="text-sm font-medium text-accent hover:text-accent/80 transition-colors shrink-0"
              >
                Finish setup
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
