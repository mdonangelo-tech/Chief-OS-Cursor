import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { inferAccountTypeFromEmail } from "@/lib/onboarding/infer";
import { OnboardingAccountsClient } from "@/app/(dashboard)/onboarding/accounts/ui";

export default async function PersonalSetupAccountsPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true, userDefinedLabel: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  let prefs: Array<{
    googleAccountId: string;
    accountType: "work" | "personal" | "unknown";
    isPrimary: boolean;
    includeInOnboarding: boolean;
    displayName: string | null;
  }> = [];
  let dbWarning: string | null = null;

  try {
    prefs = await prisma.userAccountPreference.findMany({
      where: { userId },
      select: {
        googleAccountId: true,
        accountType: true,
        isPrimary: true,
        includeInOnboarding: true,
        displayName: true,
      },
    });
  } catch {
    dbWarning =
      "Setup tables are not available yet. This usually means production database migrations haven’t been applied.";
  }

  const prefById = new Map(prefs.map((p) => [p.googleAccountId, p]));
  const items = accounts.map((a) => {
    const p = prefById.get(a.id);
    return {
      googleAccountId: a.id,
      email: a.email,
      label: a.userDefinedLabel,
      stored: !!p,
      accountType: p?.accountType ?? inferAccountTypeFromEmail(a.email),
      isPrimary: p?.isPrimary ?? false,
      includeInOnboarding: p?.includeInOnboarding ?? true,
      displayName: p?.displayName ?? null,
    };
  });

  return <OnboardingAccountsClient items={items} dbWarning={dbWarning} readOnly={!!dbWarning} mode="setup" />;
}

