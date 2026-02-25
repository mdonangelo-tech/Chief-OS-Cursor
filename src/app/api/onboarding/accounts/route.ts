import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";

type Body = {
  googleAccountId: string;
  accountType?: "work" | "personal" | "unknown";
  isPrimary?: boolean;
  includeInOnboarding?: boolean;
  displayName?: string | null;
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const googleAccountId = (body.googleAccountId ?? "").trim();
  if (!googleAccountId) {
    return NextResponse.json({ ok: false, error: "googleAccountId is required" }, { status: 400 });
  }

  const account = await prisma.googleAccount.findFirst({
    where: { id: googleAccountId, userId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }

  const accountType = body.accountType ?? "unknown";
  const isPrimary = body.isPrimary ?? false;
  const includeInOnboarding = body.includeInOnboarding ?? true;
  const displayName = typeof body.displayName === "string" ? body.displayName : null;

  const result = await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.userAccountPreference.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.userAccountPreference.upsert({
      where: { userId_googleAccountId: { userId, googleAccountId } },
      create: {
        userId,
        googleAccountId,
        accountType,
        isPrimary,
        includeInOnboarding,
        displayName,
      },
      update: {
        accountType,
        isPrimary,
        includeInOnboarding,
        displayName,
      },
      select: {
        googleAccountId: true,
        accountType: true,
        isPrimary: true,
        includeInOnboarding: true,
        displayName: true,
        updatedAt: true,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    preference: {
      ...result,
      updatedAt: result.updatedAt.toISOString(),
    },
  });
}

export const POST = withApiGuard(postImpl);

