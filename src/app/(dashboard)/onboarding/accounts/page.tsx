import { notFound, redirect } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export default async function OnboardingAccountsPage() {
  if (!onboardingV1Enabled()) notFound();
  redirect("/settings/personal/setup/accounts");
}

