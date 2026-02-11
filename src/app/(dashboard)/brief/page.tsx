import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBriefPayload } from "@/services/brief/api-brief";
import { BriefHeader } from "@/app/(dashboard)/brief/BriefHeader";
import { BriefContent } from "@/app/(dashboard)/brief/BriefContent";
import Link from "next/link";

function firstName(user: { name?: string | null; email?: string | null }): string {
  if (user?.name?.trim()) {
    const first = user.name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  if (user?.email) {
    const local = user.email.split("@")[0];
    if (local) return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  }
  return "there";
}

export default async function BriefPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const googleAccountCount = await prisma.googleAccount.count({
    where: { userId: session.user.id },
  });

  if (googleAccountCount === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Morning Brief</h1>
          <p className="text-zinc-400 mt-1">Welcome, {firstName(session.user)}.</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-6">
          <p className="text-zinc-300 mb-4">
            Connect a Google account to get your daily brief with Gmail and Calendar.
          </p>
          <Link
            href="/settings/accounts"
            className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
          >
            Connect Google account
          </Link>
        </div>
      </div>
    );
  }

  const payload = await getBriefPayload(session.user.id);

  const hasContent =
    payload.topPriorities.length > 0 ||
    payload.openLoops.length > 0 ||
    Object.keys(payload.calendarWatchouts.byDay).length > 0 ||
    Object.keys(payload.digest.summary).length > 0 ||
    payload.digest.groups.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Morning Brief</h1>
        <p className="text-zinc-400 mt-1">Welcome, {firstName(session.user)}. 2–3 min scan.</p>
        <BriefHeader
          syncStatus={payload.syncStatus}
          llmStatus={payload.llmStatus}
        />
      </div>

      <BriefContent payload={payload} />

      {!hasContent && (
        <p className="text-zinc-500">
          No content yet.{" "}
          <Link href="/settings/accounts" className="text-amber-500 hover:underline">
            Sync Gmail and Calendar
          </Link>{" "}
          to populate your brief.
        </p>
      )}
    </div>
  );
}
