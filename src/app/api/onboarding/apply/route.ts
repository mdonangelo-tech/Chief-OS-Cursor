import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { onboardingV1Enabled } from "@/lib/env";
import {
  asJsonObject,
  getAppliedActionIds,
  markApplied,
  setRecommendationApplied,
  type OnboardingRecommendation,
} from "@/services/onboarding/recommendations";
import { appendUndo } from "@/services/onboarding/undo-snapshot";
import { getOrCreateChiefOSArchivedLabel } from "@/services/gmail/labels";

type Body = { runId: string; actionId: string };

function jsonSafe(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

function findRecommendation(resultsJson: unknown, actionId: string): OnboardingRecommendation | null {
  const o = asJsonObject(resultsJson) as any;
  const recs = Array.isArray(o.recommendations) ? (o.recommendations as unknown[]) : [];
  for (const r of recs) {
    if (!r || typeof r !== "object") continue;
    const rr = r as any;
    if (rr.actionId === actionId) return rr as OnboardingRecommendation;
  }
  return null;
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

  const runId = (body.runId ?? "").trim();
  const actionId = (body.actionId ?? "").trim();
  if (!runId || !actionId) {
    return NextResponse.json({ ok: false, error: "runId and actionId are required" }, { status: 400 });
  }

  const run = await prisma.onboardingRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, resultsJson: true, undoSnapshotJson: true, accountIds: true },
  });
  if (!run) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });

  const rec = findRecommendation(run.resultsJson, actionId);
  if (!rec) {
    return NextResponse.json({ ok: false, error: "Recommendation not found" }, { status: 404 });
  }

  const alreadyApplied = getAppliedActionIds(run.resultsJson).includes(actionId);
  if (alreadyApplied) {
    return NextResponse.json({ ok: true, noop: true, actionId });
  }

  const accountIds = run.accountIds ?? [];

  const result = await prisma.$transaction(async (tx) => {
    const currentRun = await tx.onboardingRun.findFirst({
      where: { id: runId, userId },
      select: { id: true, resultsJson: true, undoSnapshotJson: true },
    });
    if (!currentRun) throw new Error("Run not found");

    const currentResults = asJsonObject(currentRun.resultsJson);
    const { next: withAppliedIds, alreadyApplied: already } = markApplied(currentResults, actionId);
    if (already) {
      return { ok: true as const, noop: true as const, actionId };
    }

    let undoDelta:
      | { createdIds: Array<{ model: string; id: string }> }
      | { updated: Array<{ model: string; id: string; before: any; after: any }> }
      | { createdIds: Array<{ model: string; id: string }>; updated: Array<{ model: string; id: string; before: any; after: any }> }
      | { deleted: Array<{ model: string; row: any }> }
      | {} = {};

    // Apply implementations
    if (rec.type === "CALENDAR_PREFS") {
      const payload = rec.payload as any;
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
        },
      });

      const updated = await tx.userCalendarPreferences.upsert({
        where: { userId },
        create: {
          userId,
          soloEventDefaultKind: payload.soloEventDefaultKind ?? "UNKNOWN",
          holdDefault: payload.holdDefault ?? "SOFT_HOLD",
          classDefault: payload.classDefault ?? "BLOCK",
          delegateEmails: payload.delegateEmails ?? [],
          familyKeywordRules: payload.familyKeywordRules ?? [],
          workDomainAllowlist: payload.workDomainAllowlist ?? [],
        },
        update: {
          ...(payload.soloEventDefaultKind ? { soloEventDefaultKind: payload.soloEventDefaultKind } : {}),
          ...(payload.holdDefault ? { holdDefault: payload.holdDefault } : {}),
          ...(payload.classDefault ? { classDefault: payload.classDefault } : {}),
          ...(Array.isArray(payload.delegateEmails) ? { delegateEmails: payload.delegateEmails } : {}),
        },
        select: {
          id: true,
          soloEventDefaultKind: true,
          holdDefault: true,
          classDefault: true,
          delegateEmails: true,
          familyKeywordRules: true,
          workDomainAllowlist: true,
        },
      });

      undoDelta =
        before == null
          ? { createdIds: [{ model: "UserCalendarPreferences", id: updated.id }] }
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
    } else if (rec.type === "ORG_RULE") {
      const payload = rec.payload as any;
      const domain = String(payload.domain ?? "").trim().toLowerCase();
      const categoryName = String(payload.categoryName ?? "").trim();
      if (!domain || !categoryName) throw new Error("Invalid ORG_RULE payload");

      const cat = await tx.category.findFirst({
        where: { userId, name: { equals: categoryName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!cat) throw new Error(`Category not found: ${categoryName}`);

      const before = await tx.orgRule.findUnique({
        where: { userId_domain: { userId, domain } },
      });

      const up = await tx.orgRule.upsert({
        where: { userId_domain: { userId, domain } },
        create: { userId, domain, categoryId: cat.id },
        update: { categoryId: cat.id },
      });

      undoDelta =
        before == null
          ? { createdIds: [{ model: "OrgRule", id: up.id }] }
          : { updated: [{ model: "OrgRule", id: up.id, before: { categoryId: before.categoryId }, after: { categoryId: up.categoryId } }] };
    } else if (rec.type === "PERSON_RULE") {
      const payload = rec.payload as any;
      const email = String(payload.email ?? "").trim().toLowerCase();
      const categoryName = String(payload.categoryName ?? "").trim();
      if (!email || !categoryName) throw new Error("Invalid PERSON_RULE payload");

      const cat = await tx.category.findFirst({
        where: { userId, name: { equals: categoryName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!cat) throw new Error(`Category not found: ${categoryName}`);

      const before = await tx.personRule.findUnique({
        where: { userId_email: { userId, email } },
      });

      const up = await tx.personRule.upsert({
        where: { userId_email: { userId, email } },
        create: { userId, email, categoryId: cat.id },
        update: { categoryId: cat.id },
      });

      undoDelta =
        before == null
          ? { createdIds: [{ model: "PersonRule", id: up.id }] }
          : {
              updated: [
                {
                  model: "PersonRule",
                  id: up.id,
                  before: { categoryId: before.categoryId },
                  after: { categoryId: up.categoryId },
                },
              ],
            };
    } else if (rec.type === "DECLUTTER_CATEGORY_RULE") {
      const payload = rec.payload as any;
      const categoryId = String(payload.categoryId ?? "").trim();
      const action = String(payload.action ?? "").trim();
      const archiveAfterDays =
        payload.archiveAfterDays != null ? Number(payload.archiveAfterDays) : null;

      const cat = await tx.category.findFirst({
        where: { id: categoryId, userId },
        select: { id: true, protectedFromAutoArchive: true, name: true },
      });
      if (!cat) throw new Error("Category not found");

      const normalized = action.toLowerCase();
      let nextAction = normalized;
      let nextDays = archiveAfterDays;

      // Respect protected categories: never archive/spam.
      if (cat.protectedFromAutoArchive && (normalized === "archive_after_48h" || normalized === "archive_after_days" || normalized === "move_to_spam")) {
        nextAction = "label_only";
        nextDays = null;
      }

      const before = await tx.categoryDeclutterRule.findUnique({
        where: { userId_categoryId: { userId, categoryId: cat.id } },
      });

      const up = await tx.categoryDeclutterRule.upsert({
        where: { userId_categoryId: { userId, categoryId: cat.id } },
        create: { userId, categoryId: cat.id, action: nextAction, archiveAfterDays: nextDays },
        update: { action: nextAction, archiveAfterDays: nextDays },
      });

      undoDelta =
        before == null
          ? { createdIds: [{ model: "CategoryDeclutterRule", id: up.id }] }
          : {
              updated: [
                {
                  model: "CategoryDeclutterRule",
                  id: up.id,
                  before: { action: before.action, archiveAfterDays: before.archiveAfterDays },
                  after: { action: up.action, archiveAfterDays: up.archiveAfterDays },
                },
              ],
            };
    } else if (rec.type === "NOISE_LABEL") {
      const payload = rec.payload as any;
      const labelName = String(payload.labelName ?? "").trim();
      if (!labelName) throw new Error("Invalid NOISE_LABEL payload");

      // If Gmail integration is available, best-effort create label on each included account.
      // We do not persist this to DB yet (no schema). We still mark the recommendation applied.
      if (accountIds.length > 0) {
        try {
          // NOTE: currently we only have a label creation helper for ChiefOS/Archived.
          // We'll mark as applied but treat as "pending integration" until a generic label helper exists.
          await Promise.all(
            accountIds.map((accId) => getOrCreateChiefOSArchivedLabel(accId, userId))
          );
        } catch {
          // treat as "pending integration"
        }
      }
      undoDelta = {};
    } else {
      throw new Error(`Unsupported recommendation type: ${rec.type}`);
    }

    const nextResults = setRecommendationApplied(withAppliedIds, actionId, true);

    await tx.onboardingRun.update({
      where: { id: currentRun.id },
      data: {
        resultsJson: jsonSafe(nextResults),
        undoSnapshotJson: appendUndo(currentRun.undoSnapshotJson, undoDelta as any),
      },
    });

    return { ok: true as const, actionId, applied: true as const };
  });

  return NextResponse.json(result);
}

export const POST = withApiGuard(postImpl);

