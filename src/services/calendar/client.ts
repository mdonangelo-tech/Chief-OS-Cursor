/**
 * Google Calendar API client using OAuth tokens.
 */

import { getGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

async function getValidAccessToken(accountId: string, userId: string): Promise<string> {
  const account = await getGoogleAccountWithTokens(accountId, userId);
  if (!account) throw new Error("Google account not found");

  const now = Date.now();
  const expiryMs = account.tokenExpiry?.getTime() ?? 0;
  const bufferMs = 5 * 60 * 1000;

  if (!account.accessToken || expiryMs - now < bufferMs) {
    const tokens = await refreshAccessToken(account.refreshToken);
    await prisma.googleAccount.update({
      where: { id: accountId },
      data: {
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      },
    });
    return tokens.access_token;
  }

  return account.accessToken;
}

export interface CalendarEventData {
  eventId: string;
  title: string | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number | null;
  attendees: string[];
  organizer: string | null;
  location: string | null;
  recurrence: string | null;
}

function toRfc3339(d: Date): string {
  return d.toISOString();
}

export async function* listCalendarEvents(
  accountId: string,
  userId: string,
  timeMin: Date,
  timeMax: Date,
  pageSize = 250,
  updatedMin?: Date
): AsyncGenerator<CalendarEventData[]> {
  const token = await getValidAccessToken(accountId, userId);
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      timeMin: toRfc3339(timeMin),
      timeMax: toRfc3339(timeMax),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(pageSize),
    });
    if (updatedMin) params.set("updatedMin", toRfc3339(updatedMin));
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      throw new Error(`Calendar API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string }>;
        organizer?: { email?: string };
        location?: string;
        recurrence?: string[];
      }>;
      nextPageToken?: string;
    };

    const events: CalendarEventData[] = [];

    for (const item of data.items ?? []) {
      const startStr = item.start?.dateTime ?? item.start?.date;
      const endStr = item.end?.dateTime ?? item.end?.date;
      const startAt = startStr ? new Date(startStr) : new Date(0);
      const endAt = endStr ? new Date(endStr) : startAt;
      const durationMinutes =
        startStr && endStr
          ? Math.round((endAt.getTime() - startAt.getTime()) / 60000)
          : null;

      events.push({
        eventId: item.id,
        title: item.summary ?? null,
        startAt,
        endAt,
        durationMinutes,
        attendees: (item.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
        organizer: item.organizer?.email ?? null,
        location: item.location ?? null,
        recurrence: item.recurrence?.length ? item.recurrence.join("\n") : null,
      });
    }

    if (events.length > 0) yield events;
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
}
