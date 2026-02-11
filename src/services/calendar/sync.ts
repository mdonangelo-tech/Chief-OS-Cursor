/**
 * Calendar sync: fetch events in last 90 + next 90 days, store in CalendarEvent.
 * Incremental: after first sync, only fetches events updated since lastCalendarSyncAt.
 */

import { prisma } from "@/lib/prisma";
import { listCalendarEvents } from "@/services/calendar/client";

const DAYS_PAST = 90;
const DAYS_FUTURE = 90;

export interface CalendarSyncResult {
  accountId: string;
  email: string;
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

export async function syncCalendarForAccount(
  accountId: string,
  userId: string
): Promise<CalendarSyncResult> {
  const account = await prisma.googleAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new Error("Google account not found");
  }

  const result: CalendarSyncResult = {
    accountId,
    email: account.email,
    fetched: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - DAYS_PAST);
  timeMin.setHours(0, 0, 0, 0);

  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + DAYS_FUTURE);
  timeMax.setHours(23, 59, 59, 999);

  const syncState = (account.syncStateJson as Record<string, unknown> | null) ?? {};
  const lastCalendarSyncAt = syncState.lastCalendarSyncAt
    ? new Date(syncState.lastCalendarSyncAt as string)
    : undefined;

  for await (const events of listCalendarEvents(
    accountId,
    userId,
    timeMin,
    timeMax,
    250,
    lastCalendarSyncAt
  )) {
    for (const ev of events) {
      try {
        result.fetched++;

        const data = {
          googleAccountId: accountId,
          eventId: ev.eventId,
          title: ev.title,
          startAt: ev.startAt,
          endAt: ev.endAt,
          durationMinutes: ev.durationMinutes,
          attendees: ev.attendees,
          organizer: ev.organizer,
          location: ev.location,
          recurrence: ev.recurrence,
          syncAt: new Date(),
        };

        const existing = await prisma.calendarEvent.findUnique({
          where: {
            googleAccountId_eventId: {
              googleAccountId: accountId,
              eventId: ev.eventId,
            },
          },
        });

        if (existing) {
          await prisma.calendarEvent.update({
            where: {
              googleAccountId_eventId: {
                googleAccountId: accountId,
                eventId: ev.eventId,
              },
            },
            data,
          });
          result.updated++;
        } else {
          await prisma.calendarEvent.create({ data });
          result.created++;
        }
      } catch (err) {
        result.errors.push(`${ev.eventId}: ${(err as Error).message}`);
      }
    }
  }

  await prisma.googleAccount.update({
    where: { id: accountId },
    data: {
      syncStateJson: {
        ...syncState,
        lastCalendarSyncAt: new Date().toISOString(),
        lastCalendarSyncResult: result,
      } as object,
      updatedAt: new Date(),
    },
  });

  return result;
}

export async function syncCalendarForUser(
  userId: string
): Promise<CalendarSyncResult[]> {
  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
  });

  const results: CalendarSyncResult[] = [];
  for (const acc of accounts) {
    try {
      const r = await syncCalendarForAccount(acc.id, userId);
      results.push(r);
    } catch (err) {
      results.push({
        accountId: acc.id,
        email: acc.email,
        fetched: 0,
        created: 0,
        updated: 0,
        errors: [(err as Error).message],
      });
    }
  }

  return results;
}
