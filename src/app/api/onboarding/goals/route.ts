import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";

type GoalInput = {
  key: string;
  label: string;
  enabled: boolean;
  notes?: string | null;
};

type Body = {
  goals: GoalInput[];
  freeText?: string | null;
};

function normalizeKey(k: string): string {
  return (k ?? "").trim();
}

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

  const goals = Array.isArray(body.goals) ? body.goals : [];
  const normalizedGoals = goals
    .map((g) => ({
      key: normalizeKey(g.key),
      label: (g.label ?? "").trim(),
      enabled: !!g.enabled,
      notes: typeof g.notes === "string" ? g.notes : null,
    }))
    .filter((g) => g.key.length > 0 && g.label.length > 0);

  const keys = new Set(normalizedGoals.map((g) => g.key));
  const freeText = typeof body.freeText === "string" ? body.freeText.trim() : "";

  await prisma.$transaction(async (tx) => {
    for (const g of normalizedGoals) {
      await tx.userGoal.upsert({
        where: { userId_key: { userId, key: g.key } },
        create: {
          userId,
          key: g.key,
          label: g.label,
          enabled: g.enabled,
          notes: g.notes,
        },
        update: {
          label: g.label,
          enabled: g.enabled,
          notes: g.notes,
        },
      });
    }

    // Store free text as a special row so we can persist it before a run exists.
    if (freeText.length > 0) {
      await tx.userGoal.upsert({
        where: { userId_key: { userId, key: "__free_text" } },
        create: {
          userId,
          key: "__free_text",
          label: "Free text",
          enabled: true,
          notes: freeText,
        },
        update: {
          enabled: true,
          notes: freeText,
        },
      });
      keys.add("__free_text");
    } else {
      await tx.userGoal.deleteMany({ where: { userId, key: "__free_text" } });
    }

    // Delete any keys not present in the latest payload (keeps user goals in sync).
    await tx.userGoal.deleteMany({
      where: { userId, key: { notIn: [...keys] } },
    });
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

