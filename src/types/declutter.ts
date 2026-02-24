import type { DecisionResult } from "@/lib/decision-engine";

export type DeclutterCategoryBreakdownItem = {
  categoryId: string | null;
  categoryName: string;
  count: number;
};

export type PreviewAutoArchiveResponse = {
  ok: true;
  total: number;
  byCategory: DeclutterCategoryBreakdownItem[];
  oldestDate: string | null;
  newestDate: string | null;
  protectedBlockedCount: number;
};

export type RunAutoArchiveResponse = {
  ok: true;
  processed: number;
};

export type PreviewAgeArchiveResponse = {
  ok: true;
  total: number;
  byCategory: DeclutterCategoryBreakdownItem[];
  oldestDate: string | null;
  newestDate: string | null;
  excludedProtectedCount: number;
};

export type DecisionCtxEmail = {
  id: string;
  googleAccountId: string;
  messageId: string;
  from_: string;
  subject: string | null;
  snippet: string | null;
  date: Date;
  labels: string[];
  senderDomain: string | null;
  classificationCategoryId: string | null;
  confidence: number | null;
  explainJson: unknown;
};

export type DecisionWithEmail = {
  email: DecisionCtxEmail;
  decision: DecisionResult;
};

