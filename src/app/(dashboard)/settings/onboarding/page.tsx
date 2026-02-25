import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export default async function SettingsOnboardingPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const lastRun = await prisma.onboardingRun.findFirst({
    where: { userId },
    select: { id: true, status: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="text-zinc-400 mt-1">
          Re-run the onboarding scan to refresh insights or include newly connected accounts.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-2 text-sm text-zinc-400">
        <div>
          <span className="text-zinc-500">Last run:</span>{" "}
          {lastRun ? (
            <span className="text-zinc-200">
              {lastRun.createdAt.toLocaleString()} · {lastRun.status}
            </span>
          ) : (
            <span className="text-zinc-500">None yet</span>
          )}
        </div>
        {lastRun?.completedAt && (
          <div>
            <span className="text-zinc-500">Completed:</span>{" "}
            <span className="text-zinc-200">{lastRun.completedAt.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/onboarding"
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
        >
          Re-run analysis
        </Link>
        <Link href="/settings/accounts" className="text-sm text-zinc-400 hover:text-zinc-200">
          Add another account
        </Link>
      </div>
    </div>
  );
}

