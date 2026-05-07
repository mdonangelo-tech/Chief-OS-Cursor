import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OnboardingRecommendationsClient } from "@/app/(dashboard)/onboarding/insights/recommendations-client";

export default async function PersonalSetupInsightsPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const run = await prisma.onboardingRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      resultsJson: true,
      questionsJson: true,
      error: true,
    },
  });

  const emailStats = (run?.resultsJson as any)?.emailStats;
  const calendarStats = (run?.resultsJson as any)?.calendarStats;
  const recommendations = Array.isArray((run?.resultsJson as any)?.recommendations)
    ? ((run?.resultsJson as any).recommendations as unknown[])
    : [];
  const topDomains = Array.isArray(emailStats?.topDomains) ? emailStats.topDomains : [];
  const unsub = Array.isArray(emailStats?.llm?.unsubscribeCandidates)
    ? emailStats.llm.unsubscribeCandidates
    : [];

  const topInsights: string[] = [];
  if (emailStats?.totalInbox30d != null) {
    topInsights.push(
      `Inbox: ${emailStats.totalInbox30d} inbox emails in last ${emailStats.windowDays ?? 30} days (${emailStats.unreadInbox30d ?? 0} unread).`
    );
  }
  if (topDomains.length > 0) {
    topInsights.push(`Top domains: ${topDomains.slice(0, 3).map((d: any) => d.domain).join(", ")}.`);
  }
  if (calendarStats?.totalBusyMinutesSampled != null) {
    const hours = Math.round((calendarStats.totalBusyMinutesSampled / 60) * 10) / 10;
    topInsights.push(`Calendar (sample): ${hours} hours busy across last 30d + next 14d window.`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Setup insights</h1>
        <p className="text-muted-foreground mt-1">A first pass. We’ll keep learning as you use Brief.</p>
        {run && (
          <p className="text-xs text-muted-foreground mt-2">
            Run {run.id} · {run.status} · {run.createdAt.toLocaleString()}
          </p>
        )}
      </div>

      {!run ? (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 text-sm text-muted-foreground shadow-soft">
          No scan found yet. Start one first.
          <div className="mt-4">
            <Link
              href="/settings/personal/setup/scan"
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Go to Scan
            </Link>
          </div>
        </div>
      ) : run.status !== "complete" ? (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 text-sm text-muted-foreground shadow-soft">
          Scan is {run.status}. Keep it running on the Scan step.
          {run.error && <div className="mt-2 text-red-300">Error: {run.error}</div>}
          <div className="mt-4 flex gap-3">
            <Link
              href={`/settings/personal/setup/scan?runId=${encodeURIComponent(run.id)}`}
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Back to Scan
            </Link>
            {Array.isArray(run.questionsJson) && run.questionsJson.length > 0 && (
              <Link
                href={`/settings/personal/setup/tune?runId=${encodeURIComponent(run.id)}`}
                className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-foreground hover:bg-surface2/60"
              >
                Answer questions
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-2 shadow-soft">
            <div className="text-xs text-muted-foreground">Top 3</div>
            <ul className="text-sm text-foreground space-y-1 list-disc pl-5">
              {(topInsights.length ? topInsights : ["Scan complete."]).slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          {unsub.length > 0 && (
            <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
              <h2 className="text-lg font-medium">Noise to remove (suggested)</h2>
              <p className="text-sm text-muted-foreground">
                Early signal only. We’ll translate this into lightweight Suggested Actions in Brief.
              </p>
              <ul className="text-sm text-foreground/90 space-y-2">
                {unsub.slice(0, 8).map((u: any, idx: number) => (
                  <li key={`${u.from}-${idx}`} className="rounded-2xl border border-border/10 bg-surface/40 p-3">
                    <div className="font-medium text-foreground">{u.domain ?? u.from}</div>
                    <div className="text-xs text-muted-foreground mt-1">{u.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            {Array.isArray(run.questionsJson) && run.questionsJson.length > 0 && (
              <Link
                href={`/settings/personal/setup/tune?runId=${encodeURIComponent(run.id)}`}
                className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-foreground hover:bg-surface2/60"
              >
                Review questions
              </Link>
            )}
            <form action="/settings/personal/setup/finish" method="post">
              <button
                type="submit"
                className="rounded-xl bg-surface2/70 px-4 py-2 text-sm text-foreground hover:opacity-90"
              >
                Finish
              </button>
            </form>
            <Link
              href="/brief"
              className="rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Go to Brief
            </Link>
          </div>

          <div className="rounded-2xl border border-border/10 bg-surface/60 p-5 space-y-3 shadow-soft">
            <h2 className="text-lg font-medium">Recommended actions</h2>
            <p className="text-sm text-muted-foreground">
              Apply is reversible and recorded to this run’s undo snapshot.
            </p>
            <OnboardingRecommendationsClient runId={run.id} initialRecommendations={recommendations} />
          </div>
        </>
      )}
    </div>
  );
}

