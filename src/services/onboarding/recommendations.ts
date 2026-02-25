import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

export type RecommendationType =
  | "DECLUTTER_CATEGORY_RULE"
  | "ORG_RULE"
  | "PERSON_RULE"
  | "CALENDAR_PREFS"
  | "NOISE_LABEL";

export type OnboardingRecommendation = {
  actionId: string;
  type: RecommendationType;
  title: string;
  reason: string;
  previewKind: "none" | "count_emails" | "describe";
  payload: Record<string, unknown>;
  applied?: boolean;
  appliedAt?: string | null;
};

function stableStringify(v: unknown): string {
  return JSON.stringify(v, Object.keys(v as any).sort());
}

export function stableActionId(type: RecommendationType, payload: Record<string, unknown>): string {
  const h = crypto
    .createHash("sha256")
    .update(`${type}:${stableStringify(payload)}`)
    .digest("hex")
    .slice(0, 18);
  return `${type.toLowerCase()}:${h}`;
}

export function asJsonObject(v: unknown): Prisma.JsonObject {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Prisma.JsonObject;
  return {} as Prisma.JsonObject;
}

export function getAppliedActionIds(resultsJson: unknown): string[] {
  const o = asJsonObject(resultsJson) as any;
  const ids = Array.isArray(o.appliedActionIds) ? o.appliedActionIds : [];
  return ids.filter((x: unknown) => typeof x === "string") as string[];
}

export function markApplied(resultsJson: Prisma.JsonObject, actionId: string): {
  next: Prisma.JsonObject;
  alreadyApplied: boolean;
} {
  const current = getAppliedActionIds(resultsJson);
  if (current.includes(actionId)) return { next: resultsJson, alreadyApplied: true };
  const next = {
    ...resultsJson,
    appliedActionIds: [...current, actionId],
  };
  return { next, alreadyApplied: false };
}

export function setRecommendationApplied(
  resultsJson: Prisma.JsonObject,
  actionId: string,
  applied: boolean
): Prisma.JsonObject {
  const recs = Array.isArray((resultsJson as any).recommendations)
    ? ((resultsJson as any).recommendations as unknown[])
    : [];
  const nowIso = new Date().toISOString();
  const nextRecs = recs.map((r) => {
    if (!r || typeof r !== "object") return r;
    const rr = r as any;
    if (rr.actionId !== actionId) return r;
    return {
      ...rr,
      applied,
      appliedAt: applied ? nowIso : null,
    };
  });
  return { ...resultsJson, recommendations: nextRecs };
}

