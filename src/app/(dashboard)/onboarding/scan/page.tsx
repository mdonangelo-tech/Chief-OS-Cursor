import { notFound, redirect } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export default async function OnboardingScanPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  if (!onboardingV1Enabled()) notFound();
  const params = await searchParams;
  const runId = typeof params.runId === "string" ? params.runId : null;
  redirect(runId ? `/settings/personal/setup/scan?runId=${encodeURIComponent(runId)}` : "/settings/personal/setup/scan");
}

