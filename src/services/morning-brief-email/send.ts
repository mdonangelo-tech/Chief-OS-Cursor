import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { localDayKey, safeTimeZone } from "@/lib/calendar-time";
import { getBriefPayload } from "@/services/brief/api-brief";
import { buildMorningBriefEmail } from "./build";
import { renderMorningBriefEmail } from "./render";
import type { BriefPayload } from "@/services/brief/api-brief";
import type { SendEmailInput, SendEmailResult } from "@/lib/email";

export interface SendMorningBriefEmailResult {
  status: "disabled" | "duplicate" | "sent" | "failed" | "skipped";
  reason?: string;
  messageId?: string;
}

export interface MorningBriefEmailUserPrefs {
  email: string | null;
  calendarPreferences: {
    timezone: string | null;
    morningBriefEmailEnabled: boolean;
    morningBriefEmailRecipient: string | null;
  } | null;
}

export interface MorningBriefEmailDeps {
  findUserPrefs(userId: string): Promise<MorningBriefEmailUserPrefs | null>;
  findExistingLog(userId: string, localBriefDay: string): Promise<{
    status: string;
    providerMessageId: string | null;
  } | null>;
  createLog(input: {
    userId: string;
    localBriefDay: string;
    timezone: string;
    recipientEmail: string;
    provider: string;
  }): Promise<{ id: string }>;
  updateLog(id: string, data: {
    status: string;
    error?: string | null;
    providerMessageId?: string | null;
    generatedAt?: Date | null;
    sentAt?: Date | null;
  }): Promise<void>;
  getBriefPayload(userId: string): Promise<BriefPayload>;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

const defaultDeps: MorningBriefEmailDeps = {
  findUserPrefs(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        calendarPreferences: {
          select: {
            timezone: true,
            morningBriefEmailEnabled: true,
            morningBriefEmailRecipient: true,
          },
        },
      },
    });
  },
  findExistingLog(userId, localBriefDay) {
    return prisma.morningBriefEmailDeliveryLog.findUnique({
      where: { userId_localBriefDay: { userId, localBriefDay } },
      select: { status: true, providerMessageId: true },
    });
  },
  createLog(input) {
    return prisma.morningBriefEmailDeliveryLog.create({
      data: {
        userId: input.userId,
        localBriefDay: input.localBriefDay,
        timezone: input.timezone,
        recipientEmail: input.recipientEmail,
        status: "pending",
        provider: input.provider,
      },
      select: { id: true },
    });
  },
  async updateLog(id, data) {
    await prisma.morningBriefEmailDeliveryLog.update({
      where: { id },
      data,
    });
  },
  getBriefPayload,
  sendEmail,
};

function appBaseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function providerName(): string {
  return process.env.EMAIL_PROVIDER ?? "console";
}

function duplicateError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export async function sendMorningBriefEmailForUser(
  userId: string,
  now = new Date()
): Promise<SendMorningBriefEmailResult> {
  return sendMorningBriefEmailForUserWithDeps(userId, now, defaultDeps);
}

export async function sendMorningBriefEmailForUserWithDeps(
  userId: string,
  now: Date,
  deps: MorningBriefEmailDeps
): Promise<SendMorningBriefEmailResult> {
  const user = await deps.findUserPrefs(userId);

  if (!user?.email) return { status: "skipped", reason: "missing_user_email" };
  const prefs = user.calendarPreferences;
  if (!prefs?.morningBriefEmailEnabled) return { status: "disabled" };

  const recipient = normalizeEmail(prefs.morningBriefEmailRecipient);
  const userEmail = normalizeEmail(user.email);
  if (!userEmail) return { status: "skipped", reason: "invalid_user_email" };
  const safeRecipient = recipient === userEmail ? recipient : userEmail;
  const timeZone = safeTimeZone(prefs.timezone);
  const localBriefDay = localDayKey(now, timeZone);

  const existing = await deps.findExistingLog(userId, localBriefDay);
  if (existing) {
    return {
      status: "duplicate",
      reason: existing.status,
      messageId: existing.providerMessageId ?? undefined,
    };
  }

  let logId: string;
  try {
    const log = await deps.createLog({
      userId,
      localBriefDay,
      timezone: timeZone,
      recipientEmail: safeRecipient,
      provider: providerName(),
    });
    logId = log.id;
  } catch (error) {
    if (duplicateError(error)) return { status: "duplicate", reason: "race" };
    throw error;
  }

  try {
    const payload = await deps.getBriefPayload(userId);
    const brief = buildMorningBriefEmail(payload, now);
    const staleSources = brief.dataFreshness.staleSources;
    if (staleSources.length >= 2) {
      await deps.updateLog(logId, {
        status: "skipped",
        error: `stale_sources:${staleSources.join(",")}`,
        generatedAt: new Date(brief.generatedAt),
      });
      return { status: "skipped", reason: "stale_sources" };
    }

    const base = appBaseUrl();
    const rendered = renderMorningBriefEmail(brief, {
      briefUrl: `${base}/brief`,
      settingsUrl: `${base}/settings/workspace-sync`,
    });
    const idempotencyKey = `morning-brief/${userId}/${brief.date}`;
    const result = await deps.sendEmail({
      to: safeRecipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      tags: [
        { name: "category", value: "morning_brief" },
        { name: "local_day", value: brief.date },
      ],
    });

    if (!result.success) {
      await deps.updateLog(logId, {
        status: "failed",
        error: result.error?.slice(0, 500) ?? "send_failed",
        generatedAt: new Date(brief.generatedAt),
      });
      logger.warn("morning_brief_email_failed", {
        userId,
        localBriefDay: brief.date,
        provider: providerName(),
        error: result.error,
      });
      return { status: "failed", reason: result.error };
    }

    await deps.updateLog(logId, {
      status: "sent",
      providerMessageId: result.messageId ?? null,
      generatedAt: new Date(brief.generatedAt),
      sentAt: new Date(),
    });
    logger.info("morning_brief_email_sent", {
      userId,
      localBriefDay: brief.date,
      provider: providerName(),
      providerMessageId: result.messageId,
    });
    return { status: "sent", messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "brief_email_failed";
    await deps.updateLog(logId, {
      status: "failed",
      error: message.slice(0, 500),
    });
    logger.warn("morning_brief_email_exception", {
      userId,
      localBriefDay,
      error: message,
    });
    return { status: "failed", reason: message };
  }
}
