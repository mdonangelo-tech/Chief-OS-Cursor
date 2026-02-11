/**
 * List-Unsubscribe: fetch and parse from Gmail, execute one-click (RFC 8058).
 * Same headers Gmail uses for its Unsubscribe button.
 */

import { getGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

async function getValidAccessToken(accountId: string, userId: string): Promise<string> {
  const account = await getGoogleAccountWithTokens(accountId, userId);
  if (!account) throw new Error("Google account not found");
  const now = Date.now();
  const expiryMs = account.tokenExpiry?.getTime() ?? 0;
  if (!account.accessToken || expiryMs - now < 5 * 60 * 1000) {
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

/** Parse List-Unsubscribe header: <mailto:...>, <https://...> */
function parseListUnsubscribe(value: string): Array<{ type: "mailto" | "https"; url: string }> {
  const links: Array<{ type: "mailto" | "https"; url: string }> = [];
  const regex = /\s*<((mailto|https?):[^>]+)>\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(value)) !== null) {
    const url = m[1];
    const scheme = m[2].toLowerCase();
    if (scheme === "mailto") {
      links.push({ type: "mailto", url });
    } else if (scheme === "https" || scheme === "http") {
      links.push({ type: "https", url });
    }
  }
  return links;
}

export interface UnsubscribeLinks {
  hasUnsubscribe: boolean;
  links: Array<{ type: "mailto" | "https"; url: string }>;
  /** When List-Unsubscribe-Post is present, use POST to this HTTPS URL with body List-Unsubscribe=One-Click */
  oneClickPostUrl: string | null;
}

export async function fetchListUnsubscribeLinks(
  accountId: string,
  userId: string,
  messageId: string
): Promise<UnsubscribeLinks> {
  const token = await getValidAccessToken(accountId, userId);

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 404) return { hasUnsubscribe: false, links: [], oneClickPostUrl: null };
    throw new Error(`Gmail API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    payload?: { headers?: Array<{ name: string; value: string }> };
  };
  const headers = data.payload?.headers ?? [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  const listUnsub = getHeader("List-Unsubscribe");
  const listUnsubPost = getHeader("List-Unsubscribe-Post");

  if (!listUnsub) {
    return { hasUnsubscribe: false, links: [], oneClickPostUrl: null };
  }

  const links = parseListUnsubscribe(listUnsub);
  let oneClickPostUrl: string | null = null;

  if (listUnsubPost?.toLowerCase().includes("one-click")) {
    const httpsLink = links.find((l) => l.type === "https");
    if (httpsLink) oneClickPostUrl = httpsLink.url;
  }

  return {
    hasUnsubscribe: links.length > 0,
    links,
    oneClickPostUrl,
  };
}

/** Execute one-click unsubscribe (POST to URL with List-Unsubscribe=One-Click). Returns true if done, false if need to open URL. */
export async function executeOneClickUnsubscribe(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
