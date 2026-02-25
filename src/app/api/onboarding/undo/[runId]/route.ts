import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import { asUndoSnapshot } from "@/services/onboarding/undo-snapshot";
import { asJsonObject } from "@/services/onboarding/recommendations";

type Ctx = { params: Promise<{ runId: string }> };

async function postImpl(_req: NextRequest, ctx: Ctx) {
  if (!onboardingV1Enabled()) {
    return NextResponse.json({ ok: false, error: "Onboarding v1 disabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { runId: raw } = await ctx.params;
  const runId = (raw ?? "").trim();
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const run = await prisma.onboardingRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, undoSnapshotJson: true, resultsJson: true },
  });
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  const snap = asUndoSnapshot(run.undoSnapshotJson);

  const summary = { createdIds: snap.createdIds.length, updated: snap.updated.length, deleted: snap.deleted.length };

  // Best-effort undo for models we apply in onboarding v1.
  await prisma.$transaction(async (tx) => {
    // 1) Restore updated rows (only fields we stored)
    for (const u of snap.updated) {
      if (u.model === "CategoryDeclutterRule") {
        await tx.categoryDeclutterRule.update({
          where: { id: u.id },
          data: {
            action: (u.before as any).action,
            archiveAfterDays: (u.before as any).archiveAfterDays ?? null,
          },
        });
      } else if (u.model === "OrgRule") {
        await tx.orgRule.update({
          where: { id: u.id },
          data: { categoryId: (u.before as any).categoryId },
        });
      } else if (u.model === "PersonRule") {
        await tx.personRule.update({
          where: { id: u.id },
          data: { categoryId: (u.before as any).categoryId },
        });
      } else if (u.model === "UserCalendarPreferences") {
        await tx.userCalendarPreferences.update({
          where: { id: u.id },
          data: {
            soloEventDefaultKind: (u.before as any).soloEventDefaultKind,
            holdDefault: (u.before as any).holdDefault,
            classDefault: (u.before as any).classDefault,
            delegateEmails: (u.before as any).delegateEmails ?? [],
            familyKeywordRules: (u.before as any).familyKeywordRules ?? [],
            workDomainAllowlist: (u.before as any).workDomainAllowlist ?? [],
          },
        });
      }
    }

    // 2) Delete created rows
    for (const c of snap.createdIds) {
      if (c.model === "CategoryDeclutterRule") {
        await tx.categoryDeclutterRule.delete({ where: { id: c.id } });
      } else if (c.model === "OrgRule") {
        await tx.orgRule.delete({ where: { id: c.id } });
      } else if (c.model === "PersonRule") {
        await tx.personRule.delete({ where: { id: c.id } });
      } else if (c.model === "UserCalendarPreferences") {
        await tx.userCalendarPreferences.delete({ where: { id: c.id } });
      }
    }

    // 3) Clear undo snapshot and applied state markers (so re-apply works)
    const results = asJsonObject(run.resultsJson);
    const cleared = {
      ...results,
      appliedActionIds: [],
      recommendations: Array.isArray((results as any).recommendations)
        ? (results as any).recommendations.map((r: any) =>
            r && typeof r === "object" ? { ...r, applied: false, appliedAt: null } : r
          )
        : [],
    };

    await tx.onboardingRun.update({
      where: { id: run.id },
      data: {
        undoSnapshotJson: Prisma.JsonNull,
        resultsJson: cleared as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return NextResponse.json({ ok: true, runId: run.id, undone: true, undoSummary: summary });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const guarded = withApiGuard((r) => postImpl(r, ctx));
  return guarded(req);
}

