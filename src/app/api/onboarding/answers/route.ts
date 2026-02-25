import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import { appendUndo } from "@/services/onboarding/undo-snapshot";

type Body = {
  runId: string;
  answers: Record<string, unknown>;
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

  const runId = (body.runId ?? "").trim();
  if (!runId) {
    return NextResponse.json({ ok: false, error: "runId is required" }, { status: 400 });
  }

  const run = await prisma.onboardingRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, inputsJson: true, undoSnapshotJson: true },
  });
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  const existingInputs =
    run.inputsJson && typeof run.inputsJson === "object"
      ? (run.inputsJson as Prisma.JsonObject)
      : ({} as Prisma.JsonObject);

  // Ensure `answers` is JSON-serializable for Prisma Json input types.
  const safeAnswers = JSON.parse(JSON.stringify(body.answers ?? {})) as Prisma.InputJsonValue;

  const nextInputs: Prisma.InputJsonObject = {
    ...existingInputs,
    answers: safeAnswers,
    answersUpdatedAt: new Date().toISOString(),
  };

  // Apply a small, reversible subset in v1: calendar preferences.
  // Mapping: questions.ts ids → preference fields.
  const answerById = (body.answers ?? {}) as Record<string, any>;
  const pick = (suffix: string) =>
    Object.entries(answerById).find(([k]) => k.endsWith(`:${suffix}`))?.[1] ?? null;

  const solo = pick("solo_default_kind")?.value as string | undefined;
  const holds = pick("holds")?.value as string | undefined;
  const classes = pick("classes")?.value as string | undefined;
  const delegateText = pick("delegate_fyi")?.value as string | undefined;

  const delegateEmails =
    typeof delegateText === "string"
      ? delegateText
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes("@"))
      : [];

  const soloEventDefaultKind =
    solo === "TASK" || solo === "FOCUS" || solo === "MEETING" || solo === "UNKNOWN"
      ? solo
      : undefined;
  const holdDefault = holds === "HARD_BUSY" || holds === "SOFT_HOLD" ? holds : undefined;
  const classDefault = classes === "BLOCK" || classes === "FYI" ? classes : undefined;

  await prisma.$transaction(async (tx) => {
    const before = await tx.userCalendarPreferences.findUnique({
      where: { userId },
      select: {
        id: true,
        soloEventDefaultKind: true,
        holdDefault: true,
        classDefault: true,
        delegateEmails: true,
        familyKeywordRules: true,
        workDomainAllowlist: true,
        updatedAt: true,
      },
    });

    const updated = await tx.userCalendarPreferences.upsert({
      where: { userId },
      create: {
        userId,
        soloEventDefaultKind: (soloEventDefaultKind as any) ?? "UNKNOWN",
        holdDefault: (holdDefault as any) ?? "SOFT_HOLD",
        classDefault: (classDefault as any) ?? "BLOCK",
        delegateEmails,
        familyKeywordRules: [],
        workDomainAllowlist: [],
      },
      update: {
        ...(soloEventDefaultKind ? { soloEventDefaultKind: soloEventDefaultKind as any } : {}),
        ...(holdDefault ? { holdDefault: holdDefault as any } : {}),
        ...(classDefault ? { classDefault: classDefault as any } : {}),
        ...(delegateEmails.length ? { delegateEmails } : {}),
      },
      select: {
        id: true,
        soloEventDefaultKind: true,
        holdDefault: true,
        classDefault: true,
        delegateEmails: true,
        familyKeywordRules: true,
        workDomainAllowlist: true,
        updatedAt: true,
      },
    });

    const delta =
      before == null
        ? {
            createdIds: [{ model: "UserCalendarPreferences", id: updated.id }],
          }
        : {
            updated: [
              {
                model: "UserCalendarPreferences",
                id: updated.id,
                before,
                after: updated,
              },
            ],
          };

    await tx.onboardingRun.update({
      where: { id: run.id },
      data: {
        inputsJson: nextInputs,
        undoSnapshotJson: appendUndo(run.undoSnapshotJson, delta),
      },
    });
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

