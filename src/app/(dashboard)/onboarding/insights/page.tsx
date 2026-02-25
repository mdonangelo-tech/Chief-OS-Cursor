import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OnboardingRecommendationsClient } from "./recommendations-client";

export default async function OnboardingInsightsPage() {
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
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-zinc-400 mt-1">Your operator report (v1).</p>
        {run && (
          <p className="text-xs text-zinc-500 mt-2">
            Run {run.id} · {run.status} · {run.createdAt.toLocaleString()}
          </p>
        )}
      </div>

      {!run ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-sm text-zinc-400">
          No scan found yet. Start one first.
          <div className="mt-4">
            <Link
              href="/onboarding/scan"
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
            >
              Go to Scan
            </Link>
          </div>
        </div>
      ) : run.status !== "complete" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-sm text-zinc-400">
          Scan is {run.status}. Keep it running on the Scan step.
          {run.error && <div className="mt-2 text-red-300">Error: {run.error}</div>}
          <div className="mt-4 flex gap-3">
            <Link
              href={`/onboarding/scan?runId=${encodeURIComponent(run.id)}`}
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
            >
              Back to Scan
            </Link>
            {Array.isArray(run.questionsJson) && run.questionsJson.length > 0 && (
              <Link
                href={`/onboarding/tune?runId=${encodeURIComponent(run.id)}`}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Answer questions
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-2">
            <div className="text-xs text-zinc-500">Top 3</div>
            <ul className="text-sm text-zinc-200 space-y-1 list-disc pl-5">
              {(topInsights.length ? topInsights : ["Scan complete."]).slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
            <h2 className="text-lg font-medium">Inbox reality</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-zinc-300">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Inbox (30d)</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {emailStats?.totalInbox30d ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Unread (30d)</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {emailStats?.unreadInbox30d ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Sample size</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {emailStats?.sampleSize ?? "—"}
                </div>
              </div>
            </div>

            {topDomains.length > 0 && (
              <div className="text-sm text-zinc-400">
                <div className="text-xs text-zinc-500 mb-1">Top domains (sample)</div>
                <div className="flex flex-wrap gap-2">
                  {topDomains.slice(0, 10).map((d: any) => (
                    <span
                      key={d.domain}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300"
                    >
                      {d.domain} · {d.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
            <h2 className="text-lg font-medium">Calendar reality</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-zinc-300">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Busy hours (sample)</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {calendarStats?.totalBusyMinutesSampled != null
                    ? Math.round((calendarStats.totalBusyMinutesSampled / 60) * 10) / 10
                    : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Meetings (sample)</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {calendarStats?.meetingsSampled ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-xs text-zinc-500">Solo events (sample)</div>
                <div className="text-lg font-semibold text-zinc-200">
                  {calendarStats?.soloEventsSampled ?? "—"}
                </div>
              </div>
            </div>
            {Array.isArray(calendarStats?.uncertainClusters) && calendarStats.uncertainClusters.length > 0 && (
              <div className="text-xs text-zinc-500">
                Uncertainty clusters:{" "}
                {calendarStats.uncertainClusters
                  .slice(0, 5)
                  .map((c: any) => `${c.key} (${c.size})`)
                  .join(", ")}
              </div>
            )}
          </div>

          {unsub.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
              <h2 className="text-lg font-medium">Noise to remove (suggested)</h2>
              <p className="text-sm text-zinc-400">
                v1 shows unsubscribe candidates. Apply automation comes next.
              </p>
              <ul className="text-sm text-zinc-300 space-y-2">
                {unsub.slice(0, 8).map((u: any, idx: number) => (
                  <li key={`${u.from}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="font-medium text-zinc-200">{u.domain ?? u.from}</div>
                    <div className="text-xs text-zinc-500 mt-1">{u.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            {Array.isArray(run.questionsJson) && run.questionsJson.length > 0 && (
              <Link
                href={`/onboarding/tune?runId=${encodeURIComponent(run.id)}`}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Review questions
              </Link>
            )}
            <form action="/onboarding/finish" method="post">
              <button
                type="submit"
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                Finish
              </button>
            </form>
            <Link
              href="/brief"
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
            >
              Go to Morning Brief
            </Link>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
            <h2 className="text-lg font-medium">Recommended actions</h2>
            <p className="text-sm text-zinc-400">
              Apply is reversible and recorded to this run’s undo snapshot.
            </p>
            <OnboardingRecommendationsClient runId={run.id} initialRecommendations={recommendations} />
          </div>
        </>
      )}
    </div>
  );
}

