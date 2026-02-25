import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLlmClassificationEnabled } from "@/services/llm";
import {
  EmailClassificationSchema,
  CalendarClassificationSchema,
  type EmailClassification,
  type CalendarClassification,
} from "@/lib/llm/schemas";
import { llmJsonArray } from "@/services/onboarding/llm";
import { generateActiveLearningQuestions } from "@/services/onboarding/questions";
import { stableActionId, type OnboardingRecommendation } from "@/services/onboarding/recommendations";

type ProgressStep = "init" | "emails" | "calendar" | "finalize" | "done";

type Progress = {
  step: ProgressStep;
  message: string;
  updatedAt: string;
};

function asJsonObject(v: unknown): Prisma.JsonObject {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Prisma.JsonObject;
  return {} as Prisma.JsonObject;
}

function setProgress(resultsJson: Prisma.JsonObject, progress: Progress): Prisma.JsonObject {
  return {
    ...resultsJson,
    progress,
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

function toMinutes(d: Date): number {
  return Math.floor(d.getTime() / 60000);
}

function normalizeInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function extractEmailLike(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  if (s.includes("@")) return s.trim().toLowerCase();
  return null;
}

function titleLooksLikeTodo(title: string | null): boolean {
  const t = (title ?? "").toLowerCase();
  if (!t) return false;
  return /\b(pay|email|call|prep|write|review|send|follow up|follow-up|invoice|tax|book|renew)\b/.test(
    t
  );
}

function titleLooksLikeHold(title: string | null): boolean {
  const t = (title ?? "").toLowerCase();
  return /\b(hold|placeholder|pencil|tentative)\b/.test(t);
}

function titleLooksLikeKids(title: string | null): boolean {
  const t = (title ?? "").toLowerCase();
  return /\b(kid|kids|school|pickup|pick up|dropoff|drop off|soccer|practice|camp|birthday)\b/.test(
    t
  );
}

export async function tickOnboardingRun(args: {
  userId: string;
  runId: string;
  maxEmailSample?: number;
  maxCalendarSample?: number;
}): Promise<{
  status: "queued" | "running" | "complete" | "failed";
  resultsJson: Prisma.JsonObject | null;
  error: string | null;
  completedAt: Date | null;
}> {
  const maxEmailSample = args.maxEmailSample ?? 5000;
  const maxCalendarSample = args.maxCalendarSample ?? 3000;

  const run = await prisma.onboardingRun.findFirst({
    where: { id: args.runId, userId: args.userId },
    select: {
      id: true,
      status: true,
      completedAt: true,
      accountIds: true,
      inputsJson: true,
      resultsJson: true,
      questionsJson: true,
      error: true,
      createdAt: true,
    },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  if (run.status === "complete" || run.status === "failed") {
    return {
      status: run.status,
      resultsJson: run.resultsJson ? asJsonObject(run.resultsJson) : null,
      error: run.error ?? null,
      completedAt: run.completedAt ?? null,
    };
  }

  const accountIds = run.accountIds ?? [];
  if (accountIds.length === 0) {
    await prisma.onboardingRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: "No accounts selected for this run",
        completedAt: new Date(),
        resultsJson: setProgress(asJsonObject(run.resultsJson), {
          step: "done",
          message: "Failed: no accounts selected",
          updatedAt: isoNow(),
        }),
      },
    });
    return { status: "failed", resultsJson: null, error: "No accounts selected", completedAt: new Date() };
  }

  const resultsJson = asJsonObject(run.resultsJson);
  const progressRaw = (resultsJson.progress ?? null) as unknown;
  const progress = (progressRaw &&
  typeof progressRaw === "object" &&
  !Array.isArray(progressRaw)
    ? (progressRaw as Progress)
    : null) ?? { step: "init", message: "Starting…", updatedAt: isoNow() };

  const inputsJson = asJsonObject(run.inputsJson);
  const goalsCtx = asJsonObject(inputsJson.goals);
  const goalItems = Array.isArray(goalsCtx.items) ? (goalsCtx.items as unknown[]) : [];
  const freeText = typeof goalsCtx.freeText === "string" ? (goalsCtx.freeText as string) : "";
  const enabledGoalLabels = goalItems
    .map((g) => (g && typeof g === "object" ? (g as any) : null))
    .filter((g) => g && g.enabled === true && typeof g.label === "string")
    .map((g) => String(g.label))
    .slice(0, 12);

  const calendarPrefsCtx = asJsonObject(inputsJson.calendarPreferences);
  const delegateEmails = Array.isArray(calendarPrefsCtx.delegateEmails)
    ? (calendarPrefsCtx.delegateEmails as unknown[])
        .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];
  const familyKeywordRules = Array.isArray(calendarPrefsCtx.familyKeywordRules)
    ? (calendarPrefsCtx.familyKeywordRules as unknown[])
        .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];
  const workDomainAllowlist = Array.isArray(calendarPrefsCtx.workDomainAllowlist)
    ? (calendarPrefsCtx.workDomainAllowlist as unknown[])
        .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];

  try {
    // Ensure running state before doing work.
    if (run.status === "queued") {
      await prisma.onboardingRun.update({
        where: { id: run.id },
        data: {
          status: "running",
          resultsJson: setProgress(resultsJson, { ...progress, step: "init", message: "Starting…", updatedAt: isoNow() }),
        },
      });
      return { status: "running", resultsJson: setProgress(resultsJson, progress), error: null, completedAt: null };
    }

    // Step machine: do at most one step per tick.
    if (progress.step === "init") {
      const next = setProgress(resultsJson, {
        step: "emails",
        message: "Scanning email headers…",
        updatedAt: isoNow(),
      });
      await prisma.onboardingRun.update({ where: { id: run.id }, data: { resultsJson: next } });
      return { status: "running", resultsJson: next, error: null, completedAt: null };
    }

    if (progress.step === "emails") {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [totalInbox30d, unreadInbox30d, sample] = await Promise.all([
        prisma.emailEvent.count({
          where: {
            googleAccountId: { in: accountIds },
            date: { gte: cutoff },
            labels: { has: "INBOX" },
          },
        }),
        prisma.emailEvent.count({
          where: {
            googleAccountId: { in: accountIds },
            date: { gte: cutoff },
            labels: { has: "INBOX" },
            unread: true,
          },
        }),
        prisma.emailEvent.findMany({
          where: {
            googleAccountId: { in: accountIds },
            date: { gte: cutoff },
            labels: { has: "INBOX" },
          },
          select: {
            senderDomain: true,
            from_: true,
            subject: true,
            snippet: true,
            date: true,
            unread: true,
          },
          orderBy: { date: "desc" },
          take: maxEmailSample,
        }),
      ]);

      const byDomain = new Map<string, number>();
      for (const e of sample) {
        const d = (e.senderDomain ?? "").trim().toLowerCase();
        if (!d) continue;
        byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
      }
      const topDomains = [...byDomain.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([domain, count]) => ({ domain, count }));

      const llmBatchSize = normalizeInt(process.env.LLM_BATCH_SIZE, 6);
      const llmMaxBatches = normalizeInt(process.env.LLM_MAX_BATCHES, 2);
      const llmMax = Math.max(0, Math.min(sample.length, llmBatchSize * llmMaxBatches));

      let llmEmail: {
        attempted: number;
        classified: number;
        byType: Record<string, number>;
        unsubscribeCandidates: Array<{ from: string; domain: string | null; reason: string; confidence: number }>;
      } | null = null;

      if (isLlmClassificationEnabled() && llmMax > 0) {
        const batch = sample.slice(0, llmMax);
        const system = `You are an elite Chief of Staff. Be concise and consistent.\nUser goals: ${enabledGoalLabels.join(
          ", "
        )}${freeText ? `\nUser note: ${freeText}` : ""}`;
        const lines = batch
          .map((e, i) => {
            const from = (e.from_ ?? "").slice(0, 160);
            const subject = (e.subject ?? "").slice(0, 180);
            const snip = (e.snippet ?? "").slice(0, 160);
            const domain = (e.senderDomain ?? "").slice(0, 120);
            return `[${i}] from="${from}" domain="${domain}" subject="${subject}" snippet="${snip}"`;
          })
          .join("\n");
        const user = `Classify each email. Output a JSON array of length ${batch.length} in the same order.\n\n${lines}`;

        const r = await llmJsonArray({
          schema: EmailClassificationSchema,
          system,
          user,
          maxTokens: 800,
          temperature: 0.2,
        });

        const byTypeLlm: Record<string, number> = {};
        const unsub: Array<{ from: string; domain: string | null; reason: string; confidence: number }> = [];

        const values: (EmailClassification | null)[] =
          r.ok && Array.isArray(r.value) ? (r.value as EmailClassification[]) : [];

        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          if (!v) continue;
          byTypeLlm[v.type] = (byTypeLlm[v.type] ?? 0) + 1;
          if (v.unsubscribeCandidate && v.confidence >= 0.6) {
            const e = batch[i]!;
            unsub.push({
              from: e.from_,
              domain: e.senderDomain ?? null,
              reason: v.reason,
              confidence: v.confidence,
            });
          }
        }

        llmEmail = {
          attempted: batch.length,
          classified: values.length,
          byType: byTypeLlm,
          unsubscribeCandidates: unsub.slice(0, 10),
        };
      }

      const emailStats = {
        windowDays: 30,
        totalInbox30d,
        unreadInbox30d,
        sampleSize: sample.length,
        topDomains,
        llm: llmEmail,
        newestEmailAt: sample[0]?.date ? sample[0].date.toISOString() : null,
        oldestEmailAt: sample[sample.length - 1]?.date
          ? sample[sample.length - 1].date.toISOString()
          : null,
      };

      const next = setProgress(
        {
          ...resultsJson,
          emailStats,
        },
        {
          step: "calendar",
          message: "Analyzing calendar patterns…",
          updatedAt: isoNow(),
        }
      );

      await prisma.onboardingRun.update({ where: { id: run.id }, data: { resultsJson: next } });
      return { status: "running", resultsJson: next, error: null, completedAt: null };
    }

    if (progress.step === "calendar") {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const events = await prisma.calendarEvent.findMany({
        where: {
          googleAccountId: { in: accountIds },
          startAt: { gte: start, lte: end },
        },
        select: {
          startAt: true,
          endAt: true,
          durationMinutes: true,
          title: true,
          attendees: true,
          organizer: true,
        },
        orderBy: { startAt: "desc" },
        take: maxCalendarSample,
      });

      let totalMinutes = 0;
      let soloCount = 0;
      let meetingCount = 0;
      let unknownCount = 0;

      for (const e of events) {
        const dur =
          e.durationMinutes ??
          Math.max(0, toMinutes(e.endAt) - toMinutes(e.startAt));
        totalMinutes += dur;

        const attendeesCount = Array.isArray(e.attendees) ? e.attendees.length : 0;
        if (attendeesCount <= 1) soloCount++;
        else meetingCount++;
      }

      // If we somehow get zero attendees arrays, treat as unknown-ish.
      if (events.length > 0 && soloCount === 0 && meetingCount === 0) unknownCount = events.length;

      // Deterministic bias rules for uncertainty clusters + LLM context.
      const uncertain: Array<{ key: "solo_default_kind" | "delegate_fyi" | "holds" | "generic_titles" | "classes"; n: number }> = [
        { key: "solo_default_kind", n: 0 },
        { key: "delegate_fyi", n: 0 },
        { key: "holds", n: 0 },
        { key: "generic_titles", n: 0 },
        { key: "classes", n: 0 },
      ];
      const inc = (key: typeof uncertain[number]["key"]) => {
        const row = uncertain.find((u) => u.key === key)!;
        row.n++;
      };

      const llmCalendarPerSync = normalizeInt(process.env.LLM_CALENDAR_PER_SYNC, 5);
      const llmEvents = events.slice(0, Math.min(events.length, llmCalendarPerSync));

      let llmCalendar: {
        attempted: number;
        classified: number;
        byEventType: Record<string, number>;
        byBlockClass: Record<string, number>;
        byOwnerRole: Record<string, number>;
      } | null = null;

      if (isLlmClassificationEnabled() && llmEvents.length > 0) {
        const system = `You are an elite Chief of Staff. Classify events.\nDelegate emails: ${delegateEmails.join(
          ", "
        )}\nFamily keywords: ${familyKeywordRules.join(", ")}\nWork domains: ${workDomainAllowlist.join(", ")}`;
        const lines = llmEvents
          .map((e, i) => {
            const title = (e.title ?? "").slice(0, 180);
            const organizer = (e.organizer ?? "").slice(0, 180);
            const attendeeCount = Array.isArray(e.attendees) ? e.attendees.length : 0;
            return `[${i}] title="${title}" organizer="${organizer}" start="${e.startAt.toISOString()}" end="${e.endAt.toISOString()}" attendees=${attendeeCount}`;
          })
          .join("\n");

        const user = `Classify each event. Output a JSON array of length ${llmEvents.length} in order.\nInclude nuances:\n- If solo and title looks like a to-do, eventType should be SOLO_TASK.\n- If kids/family invite includes a delegate email and you are not organizer, prefer blockClass=FYI and ownerRole=DELEGATE.\n- Holds/placeholders should usually be HOLD with ownerRole=OWNER.\n\n${lines}`;

        const r = await llmJsonArray({
          schema: CalendarClassificationSchema,
          system,
          user,
          maxTokens: 900,
          temperature: 0.2,
        });

        const byEventType: Record<string, number> = {};
        const byBlockClass: Record<string, number> = {};
        const byOwnerRole: Record<string, number> = {};

        const values: CalendarClassification[] = r.ok ? (r.value as CalendarClassification[]) : [];
        for (const v of values) {
          byEventType[v.eventType] = (byEventType[v.eventType] ?? 0) + 1;
          byBlockClass[v.blockClass] = (byBlockClass[v.blockClass] ?? 0) + 1;
          byOwnerRole[v.ownerRole] = (byOwnerRole[v.ownerRole] ?? 0) + 1;
          if (v.confidence < 0.65) {
            // Map to active learning clusters.
            if (v.eventType === "SOLO_TASK" || v.eventType === "FOCUS_BLOCK") inc("solo_default_kind");
            if (v.eventType === "HOLD") inc("holds");
          }
        }

        llmCalendar = {
          attempted: llmEvents.length,
          classified: values.length,
          byEventType,
          byBlockClass,
          byOwnerRole,
        };
      }

      // Lightweight uncertainty signals (deterministic) to drive questions even when LLM is off.
      for (const e of events.slice(0, 400)) {
        const attendeeEmails = Array.isArray(e.attendees)
          ? e.attendees.map((a) => extractEmailLike(a)).filter(Boolean)
          : [];
        const organizerEmail = extractEmailLike(e.organizer);

        const isSolo = attendeeEmails.length <= 1;
        if (isSolo && titleLooksLikeTodo(e.title)) inc("solo_default_kind");
        if (titleLooksLikeHold(e.title)) inc("holds");
        if (titleLooksLikeKids(e.title) && delegateEmails.some((d) => attendeeEmails.includes(d))) {
          inc("delegate_fyi");
        }
        if ((e.title ?? "").trim().length > 0 && (e.title ?? "").trim().split(/\s+/).length <= 2) {
          inc("generic_titles");
        }
        if (/(dentist|therapy|doctor|appointment|class|lesson|workout)/i.test(e.title ?? "")) {
          inc("classes");
        }

        // if organizer isn't you and delegates present, more uncertain
        if (organizerEmail && delegateEmails.length > 0 && delegateEmails.includes(organizerEmail)) {
          inc("delegate_fyi");
        }
      }

      const uncertainClusters = uncertain
        .filter((u) => u.n > 0)
        .map((u) => ({
          key: u.key,
          size: u.n,
          // crude uncertainty: normalize by a cap
          uncertaintyScore: Math.min(1, u.n / 25),
        }));

      const questions = generateActiveLearningQuestions({
        runId: run.id,
        uncertainClusters,
        maxQuestions: 5,
      });

      const calendarStats = {
        window: {
          pastDays: 30,
          nextDays: 14,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        },
        sampleSize: events.length,
        totalBusyMinutesSampled: totalMinutes,
        soloEventsSampled: soloCount,
        meetingsSampled: meetingCount,
        unknownEventsSampled: unknownCount,
        llm: llmCalendar,
        uncertainClusters,
      };

      const recommendations: Prisma.InputJsonValue = JSON.parse(
        JSON.stringify([] as OnboardingRecommendation[])
      ) as Prisma.InputJsonValue;

      // Calendar prefs recommendation (decisive default; user can override in Tune).
      (recommendations as any[]).push({
        actionId: stableActionId("CALENDAR_PREFS", {
          soloEventDefaultKind: "TASK",
          holdDefault: "SOFT_HOLD",
          classDefault: "BLOCK",
        }),
        type: "CALENDAR_PREFS",
        title: "Make solo events behave like tasks (by default)",
        reason:
          "Solo events often represent to-dos and focus blocks. Defaulting them to TASK keeps your meeting load honest while still protecting focus time when needed.",
        previewKind: "describe",
        payload: {
          soloEventDefaultKind: "TASK",
          holdDefault: "SOFT_HOLD",
          classDefault: "BLOCK",
        },
      });

      // Noise cleanup (Gmail label integration exists; we'll mark it as integrated in Apply).
      (recommendations as any[]).push({
        actionId: stableActionId("NOISE_LABEL", { labelName: "ChiefOS/Noise" }),
        type: "NOISE_LABEL",
        title: "Create a ChiefOS/Noise label for low-signal senders",
        reason:
          "A dedicated label lets you triage noise safely (no deletion) and makes automation reversible.",
        previewKind: "none",
        payload: { labelName: "ChiefOS/Noise" },
      });

      // Declutter: conservative suggestion based on top domains (if any) -> label_only (digest) by default.
      // We'll only suggest if user has categories and a matching category name exists at apply time.
      if (Array.isArray((resultsJson as any).emailStats?.topDomains)) {
        const top = ((resultsJson as any).emailStats.topDomains as any[]).slice(0, 2);
        for (const t of top) {
          if (!t?.domain) continue;
          (recommendations as any[]).push({
            actionId: stableActionId("ORG_RULE", { domain: String(t.domain), categoryName: "Newsletters" }),
            type: "ORG_RULE",
            title: `Route ${String(t.domain)} to “Newsletters”`,
            reason:
              "High-volume domains are usually newsletters/notifications. Routing by domain keeps your inbox cleaner with minimal risk.",
            previewKind: "count_emails",
            payload: { domain: String(t.domain), categoryName: "Newsletters" },
          });
        }
      }

      const next = setProgress(
        {
          ...resultsJson,
          calendarStats,
          recommendations: recommendations as any,
          appliedActionIds: (resultsJson as any).appliedActionIds ?? [],
        },
        {
          step: "finalize",
          message: "Finalizing…",
          updatedAt: isoNow(),
        }
      );

      await prisma.onboardingRun.update({
        where: { id: run.id },
        data: {
          resultsJson: next,
          questionsJson:
            questions.length > 0
              ? (JSON.parse(JSON.stringify(questions)) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });
      return { status: "running", resultsJson: next, error: null, completedAt: null };
    }

    // finalize
    const doneAt = new Date();
    const next = setProgress(resultsJson, { step: "done", message: "Complete", updatedAt: isoNow() });
    const updated = await prisma.onboardingRun.update({
      where: { id: run.id },
      data: { status: "complete", completedAt: doneAt, resultsJson: next, error: null },
      select: { completedAt: true, resultsJson: true },
    });

    return {
      status: "complete",
      resultsJson: updated.resultsJson ? asJsonObject(updated.resultsJson) : null,
      error: null,
      completedAt: updated.completedAt ?? doneAt,
    };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    const failedAt = new Date();
    const next = setProgress(resultsJson, { step: "done", message: `Failed: ${message}`, updatedAt: isoNow() });
    await prisma.onboardingRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, completedAt: failedAt, resultsJson: next },
    });
    return { status: "failed", resultsJson: next, error: message, completedAt: failedAt };
  }
}

