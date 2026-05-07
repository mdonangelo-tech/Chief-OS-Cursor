import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { redirect } from "next/navigation";

export default async function OnboardingInsightsPage() {
  if (!onboardingV1Enabled()) notFound();
  redirect("/settings/personal/setup/insights");
}

