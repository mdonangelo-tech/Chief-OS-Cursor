import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import { tickOnboardingRun } from "@/services/onboarding/analyze";

async function getImpl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!onboardingV1Enabled()) {
    return NextResponse.json({ ok: false, error: "Onboarding v1 disabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing run id" }, { status: 400 });
  }

  // Poll-driven cooperative runner: each GET advances the run a single step.
  // This is intentionally best-effort for serverless; repeated polls will eventually complete.
  await tickOnboardingRun({ userId, runId: id });

  const run = await prisma.onboardingRun.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      accountIds: true,
      inputsJson: true,
      resultsJson: true,
      questionsJson: true,
      undoSnapshotJson: true,
      error: true,
    },
  });

  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    run: {
      ...run,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guarded = withApiGuard((r) => getImpl(r, ctx));
  return guarded(req);
}

