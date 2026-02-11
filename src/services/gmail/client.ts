/**
 * Gmail API client using OAuth tokens.
 */

import { getGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

async function getValidAccessToken(accountId: string, userId: string): Promise<string> {
  const account = await getGoogleAccountWithTokens(accountId, userId);
  if (!account) throw new Error("Google account not found");

  const now = Date.now();
  const expiryMs = account.tokenExpiry?.getTime() ?? 0;
  const bufferMs = 5 * 60 * 1000; // 5 min

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

export interface GmailMessageMetadata {
  id: string;
  threadId: string;
  from: string;
  to: string | null;
  cc: string | null;
  subject: string | null;
  snippet: string | null;
  date: Date;
  labels: string[];
  unread: boolean;
  senderDomain: string | null;
}

function parseHeaders(headers: Array<{ name: string; value: string }>): {
  from: string;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: Date;
} {
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  const from = get("From") ?? "";
  const to = get("To");
  const cc = get("Cc");
  const subject = get("Subject");
  const dateStr = get("Date");
  const date = dateStr ? new Date(dateStr) : new Date(0);

  return { from, to, cc, subject, date };
}

function extractDomain(email: string): string | null {
  const match = email.match(/@([^>@\s]+)/);
  return match ? match[1].toLowerCase() : null;
}

export async function fetchMessageMetadata(
  accountId: string,
  userId: string,
  messageId: string
): Promise<GmailMessageMetadata | null> {
  const token = await getValidAccessToken(accountId, userId);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    internalDate?: string;
    payload?: {
      headers?: Array<{ name: string; value: string }>;
    };
  };

  const headers = data.payload?.headers ?? [];
  const { from, to, cc, subject, date } = parseHeaders(headers);

  const labelIds = data.labelIds ?? [];
  const unread = labelIds.includes("UNREAD");
  const internalDate = data.internalDate ? new Date(parseInt(data.internalDate, 10)) : date;
  const senderDomain = extractDomain(from);

  return {
    id: data.id,
    threadId: data.threadId,
    from,
    to,
    cc,
    subject: subject ?? null,
    snippet: data.snippet ?? null,
    date: internalDate,
    labels: labelIds,
    unread,
    senderDomain,
  };
}

export async function* listMessageIds(
  accountId: string,
  userId: string,
  query: string,
  maxResults = 100
): AsyncGenerator<string[]> {
  const token = await getValidAccessToken(accountId, userId);
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      throw new Error(`Gmail list error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };

    const ids = (data.messages ?? []).map((m) => m.id);
    if (ids.length > 0) yield ids;

    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
}
