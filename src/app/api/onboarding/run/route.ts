import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import { inferAccountTypeFromEmail } from "@/lib/onboarding/infer";

type Body = {
  includeGoogleAccountIds?: string[];
};

async function postImpl(req: NextRequest) {
  if (!onboardingV1Enabled()) {
    return NextResponse.json({ ok: false, error: "Onboarding v1 disabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // allow empty body
  }

  const [accounts, prefs, goals, calendarPrefs] = await Promise.all([
    prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true, email: true },
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
        updatedAt: true,
      },
    }),
    prisma.userGoal.findMany({
      where: { userId },
      select: { key: true, label: true, enabled: true, notes: true, updatedAt: true },
      orderBy: { key: "asc" },
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

  if (accounts.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No connected Google accounts" },
      { status: 400 }
    );
  }

  const prefByGoogleAccountId = new Map(prefs.map((p) => [p.googleAccountId, p]));

  const requested = Array.isArray(body.includeGoogleAccountIds)
    ? body.includeGoogleAccountIds.map((s) => (s ?? "").trim()).filter(Boolean)
    : null;

  const includedAccountIds = (requested ?? accounts.map((a) => a.id)).filter((id) => {
    const p = prefByGoogleAccountId.get(id);
    // Default include ALL accounts unless explicitly unchecked.
    return p?.includeInOnboarding !== false;
  });

  if (includedAccountIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No accounts selected for onboarding" },
      { status: 400 }
    );
  }

  const freeTextGoal = goals.find((g) => g.key === "__free_text")?.notes ?? null;
  const filteredGoals = goals
    .filter((g) => g.key !== "__free_text")
    .map((g) => ({ key: g.key, label: g.label, enabled: g.enabled, notes: g.notes ?? null }));

  const accountPrefSnapshot = accounts
    .filter((a) => includedAccountIds.includes(a.id))
    .map((a) => {
      const p = prefByGoogleAccountId.get(a.id);
      return {
        googleAccountId: a.id,
        email: a.email,
        accountType: p?.accountType ?? inferAccountTypeFromEmail(a.email),
        isPrimary: p?.isPrimary ?? false,
        includeInOnboarding: p?.includeInOnboarding ?? true,
        displayName: p?.displayName ?? null,
        updatedAt: p?.updatedAt ? p.updatedAt.toISOString() : null,
      };
    });

  const run = await prisma.onboardingRun.create({
    data: {
      userId,
      status: "queued",
      accountIds: includedAccountIds,
      inputsJson: {
        goals: { items: filteredGoals, freeText: freeTextGoal },
        accountPreferences: accountPrefSnapshot,
        calendarPreferences: calendarPrefs
          ? { ...calendarPrefs, updatedAt: calendarPrefs.updatedAt.toISOString() }
          : null,
      },
    },
    select: { id: true },
  });

  // M3 will pick up queued runs and process them.
  return NextResponse.json({ ok: true, runId: run.id });
}

export const POST = withApiGuard(postImpl);

