import { notFound, redirect } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export default async function OnboardingTunePage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  if (!onboardingV1Enabled()) notFound();
  const params = await searchParams;
  const runId = typeof params.runId === "string" ? params.runId.trim() : "";
  redirect(runId ? `/settings/personal/setup/tune?runId=${encodeURIComponent(runId)}` : "/settings/personal/setup/tune");
}

