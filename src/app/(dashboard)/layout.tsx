import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { onboardingV1Enabled } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="relative z-20 border-b border-zinc-800 px-6 py-4">
        <nav
          role="navigation"
          className="flex items-center justify-between max-w-4xl mx-auto"
        >
          <div className="flex items-center gap-6 shrink-0">
            <Link
              href="/brief"
              className="flex items-baseline gap-2 font-semibold text-amber-500 hover:text-amber-400 transition-colors"
            >
              <span>Brief</span>
              <span className="text-xs font-normal text-zinc-500">Chief of Staff</span>
            </Link>
            <Link href="/setup" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Setup
            </Link>
            <Link href="/settings/declutter" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Declutter
            </Link>
            <Link href="/audit" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Audit
            </Link>
            <Link href="/settings/accounts" className="text-zinc-400 hover:text-zinc-200 transition-colors">
              Accounts
            </Link>
            {onboardingV1Enabled() && (
              <Link href="/onboarding" className="text-zinc-400 hover:text-zinc-200 transition-colors">
                Onboarding
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-zinc-500">
              {session.user.email ?? session.user.name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}
