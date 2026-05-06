import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { onboardingV1Enabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="relative z-20 border-b border-zinc-800 px-4 py-3 sm:px-6 sm:py-4">
        <nav role="navigation" className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/brief"
              className="flex items-baseline gap-2 font-semibold text-amber-500 hover:text-amber-400 transition-colors shrink-0"
            >
              <span>Brief</span>
              <span className="hidden sm:inline text-xs font-normal text-zinc-500">
                Chief of Staff
              </span>
            </Link>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline text-sm text-zinc-500">
                {session.user.email ?? session.user.name}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-300">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <div className="mt-3 -mx-4 px-4 pb-1 flex items-center gap-4 overflow-x-auto whitespace-nowrap sm:mt-0 sm:mx-0 sm:px-0 sm:pb-0 sm:gap-6 sm:overflow-visible">
            <Link href="/brief" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Brief
            </Link>
            <Link
              href="/settings/declutter"
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Declutter
            </Link>
            <Link href="/audit" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Audit
            </Link>
            <Link
              href="/settings/accounts"
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Accounts
            </Link>
            <Link href="/settings" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Settings
            </Link>
            {onboardingV1Enabled() && !hasCompletedOnboarding && (
              <Link href="/onboarding" className="text-amber-400 hover:text-amber-300 transition-colors">
                Finish onboarding
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
