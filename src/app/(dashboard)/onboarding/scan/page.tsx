import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { OnboardingScanClient } from "./ui";

export default async function OnboardingScanPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const runId = typeof params.runId === "string" ? params.runId : null;

  return <OnboardingScanClient initialRunId={runId} />;
}

