import type { DecisionResult } from "@/lib/decision-engine";

export type DeclutterCategoryBreakdownItem = {
  categoryId: string | null;
  categoryName: string;
  count: number;
};

export type DeclutterPreviewDebug = {
  generatedAt: string;
  /** For "upcoming" previews: how far into the future we simulated eligibility. */
  horizonDays?: number;
  /** For "upcoming" previews: the effective `now` used for decisions. */
  previewNow?: string;
  scanned?: number;
  accountCount: number;
  accounts?: Array<{
    id: string;
    email?: string;
    lastSyncAt?: string | null;
    lastGmailAttemptAt?: string | null;
    lastCalendarAttemptAt?: string | null;
    lastGmailCursorAt?: string | null;
    lastGmailBackfillBeforeAt?: string | null;
    gmailCatchupCursorDay?: string | null;
    // Coverage diagnostics (varies by endpoint)
    inboxCountBeforeCutoffInDb?: number;
    maxInboxDateBeforeCutoffInDb?: string | null;
    // Gmail-side signal (bounded sample)
    gmailInboxSampleCountInCutoffWindow?: number;
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

export type AutoArchiveBatchStatus =
  | "disabled"
  | "no_accounts"
  | "no_archive_policies"
  | "ran";

export type AutoArchiveBatchSkipReasons = {
  notYetDue: number;
  decisionNone: number;
};

export type AutoArchiveBatchPerAccount = {
  googleAccountId: string;
  archived: number;
  spammed: number;
  errors: number;
};

export type RunAutoArchiveResponse = {
  ok: true;
  processed: number;
  remainingEligible: number;
  status?: AutoArchiveBatchStatus;
  scanned?: number;
  skipReasons?: AutoArchiveBatchSkipReasons;
  perAccount?: AutoArchiveBatchPerAccount[];
  hasErrors?: boolean;
  errorCount?: number;
};

export type RunAgeArchiveResponse = {
  ok: true;
  runId: string;
  processed: number;
  excludedProtectedCount: number;
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

