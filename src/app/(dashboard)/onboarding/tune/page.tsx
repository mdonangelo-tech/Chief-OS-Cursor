import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { OnboardingTuneClient } from "./ui";

export default async function OnboardingTunePage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const runId = typeof params.runId === "string" ? params.runId.trim() : "";
  if (!runId) redirect("/onboarding/scan");

  const run = await prisma.onboardingRun.findFirst({
    where: { id: runId, userId: session.user.id },
    select: { id: true, status: true, questionsJson: true },
  });
  if (!run) notFound();

  const questions =
    Array.isArray(run.questionsJson) ? (run.questionsJson as unknown[]) : [];

  return <OnboardingTuneClient runId={run.id} status={run.status} questions={questions} />;
}

