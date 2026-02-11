/**
 * Calendar event LLM enrichment. Stores focus_type, needs_prep, watchouts in explainJson.
 * Runs after sync; enriches upcoming events without explainJson.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  analyzeCalendarEventWithLlm,
  isLlmClassificationEnabled,
} from "@/services/llm";

export async function enrichUpcomingCalendarEvents(
  userId: string
): Promise<{ enriched: number; total: number }> {
  if (!isLlmClassificationEnabled()) return { enriched: 0, total: 0 };

  const accountIds = (
    await prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true },
    })
  ).map((a) => a.id);

  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const maxEnrich = parseInt(process.env.LLM_CALENDAR_PER_SYNC ?? "5", 10) || 5;
  const events = await prisma.calendarEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      startAt: { gte: now, lte: weekLater },
      explainJson: { equals: Prisma.DbNull },
    },
    orderBy: { startAt: "asc" },
    take: maxEnrich,
  });

  let enriched = 0;
  for (const e of events) {
    try {
      const analysis = await analyzeCalendarEventWithLlm(
        e.title,
        e.organizer,
        e.location,
        e.startAt,
        e.durationMinutes,
        e.attendees?.length ?? 0
      );
      if (analysis && analysis.confidence >= 0.5) {
        const watchouts = analysis.watchouts ?? [];
        if (analysis.needs_prep && analysis.prep_time_minutes) {
          watchouts.push(`prep ~${analysis.prep_time_minutes}min`);
        }
        await prisma.calendarEvent.update({
          where: { id: e.id },
          data: {
            explainJson: {
              source: "llm",
              focus_type: analysis.focus_type,
              needs_prep: analysis.needs_prep,
              watchouts,
              reason: analysis.reason,
              confidence: analysis.confidence,
            } as object,
          },
        });
        enriched++;
      }
    } catch {
      // Skip on error
    }
  }

  return { enriched, total: events.length };
}
