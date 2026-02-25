import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export default async function OnboardingIntroPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const accountsCount = await prisma.googleAccount.count({ where: { userId } });

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

