import type { DecisionResult } from "@/lib/decision-engine";

export type DeclutterCategoryBreakdownItem = {
  categoryId: string | null;
  categoryName: string;
  count: number;
};

export type DeclutterPreviewDebug = {
  generatedAt: string;
  scanned?: number;
  accountCount: number;
  accounts?: Array<{
    id: string;
    email?: string;
    lastSyncAt?: string | null;
    lastGmailAttemptAt?: string | null;
    lastCalendarAttemptAt?: string | null;
    authErrorCode?: string | null;
  }>;
  note?: string;
};

export type PreviewAutoArchiveResponse = {
  ok: true;
  total: number;
  byCategory: DeclutterCategoryBreakdownItem[];
  oldestDate: string | null;
  newestDate: string | null;
  protectedBlockedCount: number;
  debug?: DeclutterPreviewDebug;
};

export type RunAutoArchiveResponse = {
  ok: true;
  processed: number;
  remainingEligible: number;
};

export type PreviewAgeArchiveResponse = {
  ok: true;
  total: number;
  byCategory: DeclutterCategoryBreakdownItem[];
  oldestDate: string | null;
  newestDate: string | null;
  excludedProtectedCount: number;
  debug?: DeclutterPreviewDebug & { days?: number; cutoff?: string };
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

