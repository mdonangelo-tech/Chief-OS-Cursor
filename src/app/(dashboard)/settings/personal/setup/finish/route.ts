import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";

export async function POST() {
  if (!onboardingV1Enabled()) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  redirect("/brief");
}

