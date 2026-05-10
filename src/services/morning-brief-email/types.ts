export type MorningBriefConfidence = "high" | "medium" | "low";

export interface MorningBriefEmailItem {
  title: string;
  rationale: string;
  source?: string;
  confidence?: MorningBriefConfidence;
  suggestedAction?: string;
}

export interface MorningBriefCalendarHighlight extends MorningBriefEmailItem {
  time: string;
  prepNeeded?: string;
}

export interface MorningBriefCriticalEmail extends MorningBriefEmailItem {
  sender: string;
  group:
    | "needs_response"
    | "blocking_someone"
    | "external_high_importance"
    | "deadline_sensitive"
    | "sensitive"
    | "follow_up_overdue";
}

export interface MorningBriefDataFreshness {
  gmailSyncAt: string | null;
  calendarSyncAt: string | null;
  hasSyncErrors: boolean;
  isLimited: boolean;
  staleSources: string[];
}

export interface MorningBriefEmail {
  date: string;
  timezone: string;
  openingSummary: string;
  todayPriorities: MorningBriefEmailItem[];
  calendarHighlights: MorningBriefCalendarHighlight[];
  criticalEmails: MorningBriefCriticalEmail[];
  risksAndOpenLoops: MorningBriefEmailItem[];
  suggestedFocusPlan: string | null;
  dataFreshness: MorningBriefDataFreshness;
  generatedAt: string;
}
