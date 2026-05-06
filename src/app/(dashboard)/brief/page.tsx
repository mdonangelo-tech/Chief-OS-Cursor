import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBriefPayload } from "@/services/brief/api-brief";
import { BriefHeader } from "@/app/(dashboard)/brief/BriefHeader";
import { BriefContent } from "@/app/(dashboard)/brief/BriefContent";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
          <h1 className="text-2xl font-semibold">Brief</h1>
          <p className="text-muted-foreground mt-1">Welcome, {firstName(session.user)}.</p>
        </div>
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-6 shadow-soft">
          <p className="text-foreground/90 mb-4">
            Connect a Google account to get your daily brief with Gmail and Calendar.
          </p>
          <Link
            href="/settings/accounts"
            className="inline-flex rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
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
        <h1 className="text-2xl font-semibold">Brief</h1>
        <p className="text-muted-foreground mt-1">Welcome, {firstName(session.user)}. 2–3 min scan.</p>
        <BriefHeader
          syncStatus={payload.syncStatus}
          llmStatus={payload.llmStatus}
        />
      </div>

      <BriefContent payload={payload} />

      {!hasContent && (
        <p className="text-muted-foreground">
          No content yet.{" "}
          <Link href="/settings/accounts" className="text-accent hover:underline">
            Sync Gmail and Calendar
          </Link>{" "}
          to populate your brief.
        </p>
      )}
    </div>
  );
}
