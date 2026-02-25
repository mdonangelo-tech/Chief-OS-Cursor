import { z } from "zod";

export const EmailTypeSchema = z.enum([
  "work",
  "family_kids",
  "health",
  "finance_admin",
  "newsletter",
  "promotion",
  "notification",
  "other",
]);

export const EmailClassificationSchema = z.object({
  type: EmailTypeSchema,
  importance: z.number().min(0).max(1),
  needsAction: z.boolean(),
  actionType: z.enum(["reply", "schedule", "read", "ignore"]),
  unsubscribeCandidate: z.boolean(),
  reason: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
});

export type EmailClassification = z.infer<typeof EmailClassificationSchema>;

export const CalendarEventTypeSchema = z.enum([
  "MEETING",
  "SOLO_TASK",
  "FOCUS_BLOCK",
  "FAMILY_LOGISTICS",
  "KIDS_ACTIVITY",
  "APPOINTMENT",
  "TRAVEL",
  "HOLD",
  "OTHER",
]);

export const CalendarClassificationSchema = z.object({
  eventType: CalendarEventTypeSchema,
  blockClass: z.enum(["BLOCK", "FYI"]),
  ownerRole: z.enum(["OWNER", "DELEGATE", "OBSERVER"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
});

export type CalendarClassification = z.infer<typeof CalendarClassificationSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["single_select", "multi_select", "free_text"]),
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).max(140) })).default([]),
  applyToAllDefault: z.boolean().default(true),
  clusterKey: z.string().min(1).max(80),
  rationale: z.string().min(1).max(400),
});

export type OnboardingQuestion = z.infer<typeof QuestionSchema>;

export const OnboardingSummarySchema = z.object({
  persona: z.enum(["WORK_OPERATOR", "PERSONAL_CHIEF", "BOTH"]).default("BOTH"),
  narrative: z.string().min(1).max(1200),
  topInsights: z.array(z.string().min(1).max(160)).max(3),
  stats: z
    .object({
      inbox: z
        .object({
          windowDays: z.number().int().positive(),
          totalInbox: z.number().int().nonnegative(),
          unreadInbox: z.number().int().nonnegative(),
        })
        .optional(),
      calendar: z
        .object({
          pastDays: z.number().int().positive(),
          nextDays: z.number().int().positive(),
          totalBusyMinutesSampled: z.number().int().nonnegative(),
          meetingsSampled: z.number().int().nonnegative(),
          soloEventsSampled: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .default({}),
  recommendations: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(140),
        category: z.enum(["declutter", "vip", "calendar", "unsubscribe", "other"]),
        impactScore: z.number().min(0).max(1),
        reason: z.string().min(1).max(500),
        previewPath: z.string().min(1).max(200).optional(),
        applyPath: z.string().min(1).max(200).optional(),
      })
    )
    .default([]),
});

export type OnboardingSummary = z.infer<typeof OnboardingSummarySchema>;

