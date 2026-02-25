import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import { inferAccountTypeFromEmail } from "@/lib/onboarding/infer";

async function getImpl(_req: NextRequest) {
  if (!onboardingV1Enabled()) {
    return NextResponse.json({ ok: false, error: "Onboarding v1 disabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [accounts, prefs, goals, lastRun, calendarPrefs] = await Promise.all([
    prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true, email: true, userDefinedLabel: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userAccountPreference.findMany({
      where: { userId },
      select: {
        googleAccountId: true,
        accountType: true,
        isPrimary: true,
        includeInOnboarding: true,
        displayName: true,
      },
    }),
    prisma.userGoal.findMany({
      where: { userId },
      select: { key: true, label: true, enabled: true, notes: true, updatedAt: true },
      orderBy: { key: "asc" },
    }),
    prisma.onboardingRun.findFirst({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
        accountIds: true,
        error: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userCalendarPreferences.findUnique({
      where: { userId },
      select: {
        soloEventDefaultKind: true,
        holdDefault: true,
        classDefault: true,
        delegateEmails: true,
        familyKeywordRules: true,
        workDomainAllowlist: true,
        updatedAt: true,
      },
    }),
  ]);

  const prefByGoogleAccountId = new Map(prefs.map((p) => [p.googleAccountId, p]));

  const freeTextGoal = goals.find((g) => g.key === "__free_text")?.notes ?? null;
  const filteredGoals = goals
    .filter((g) => g.key !== "__free_text")
    .map((g) => ({ key: g.key, label: g.label, enabled: g.enabled, notes: g.notes ?? null }));

  return NextResponse.json({
    ok: true,
    accounts: accounts.map((a) => {
      const p = prefByGoogleAccountId.get(a.id);
      return {
        id: a.id,
        email: a.email,
        label: a.userDefinedLabel,
        preference: {
          stored: !!p,
          googleAccountId: a.id,
          accountType: p?.accountType ?? inferAccountTypeFromEmail(a.email),
          isPrimary: p?.isPrimary ?? false,
          includeInOnboarding: p?.includeInOnboarding ?? true,
          displayName: p?.displayName ?? null,
        },
      };
    }),
    goals: {
      items: filteredGoals,
      freeText: freeTextGoal,
    },
    calendarPreferences: calendarPrefs
      ? {
          ...calendarPrefs,
          updatedAt: calendarPrefs.updatedAt.toISOString(),
        }
      : null,
    lastRun: lastRun
      ? {
          ...lastRun,
          createdAt: lastRun.createdAt.toISOString(),
          completedAt: lastRun.completedAt ? lastRun.completedAt.toISOString() : null,
        }
      : null,
  });
}

export const GET = withApiGuard(getImpl);

