import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { OnboardingScanClient } from "@/app/(dashboard)/onboarding/scan/ui";

export default async function PersonalSetupScanPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const runId = typeof params.runId === "string" ? params.runId : null;

  return <OnboardingScanClient initialRunId={runId} mode="setup" />;
}

