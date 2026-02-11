/**
 * Gmail labels: ensure ChiefOS/Archived exists, get label IDs.
 */

import { getGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

export const CHIEFOS_ARCHIVED_LABEL = "ChiefOS/Archived";

/** Gmail URL to view all ChiefOS-archived emails */
export const GMAIL_CHIEFOS_ARCHIVED_URL = `https://mail.google.com/mail/#search/${encodeURIComponent(`label:${CHIEFOS_ARCHIVED_LABEL}`)}`;

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

export async function getOrCreateChiefOSArchivedLabel(
  accountId: string,
  userId: string
): Promise<string> {
  const token = await getValidAccessToken(accountId, userId);

  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail labels list error: ${listRes.status}`);

  const data = (await listRes.json()) as { labels?: Array<{ id: string; name: string }> };
  const existing = data.labels?.find((l) => l.name === CHIEFOS_ARCHIVED_LABEL);
  if (existing) {
    const patchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/labels/${existing.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      }
    );
    if (!patchRes.ok) {
      console.warn("ChiefOS label visibility update failed:", await patchRes.text());
    }
    return existing.id;
  }

  const createRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: CHIEFOS_ARCHIVED_LABEL,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    }
  );
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Gmail label create error: ${createRes.status} ${err}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export interface GmailLabelInfo {
  id: string;
  name: string;
  type: string;
}

/** True if string looks like a domain (e.g. promo.childrensplace.com) — not a typical label name. */
function looksLikeDomain(name: string): boolean {
  const tlds = new Set(["com", "net", "org", "io", "co", "edu", "gov", "uk", "us"]);
  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  return tlds.has(last);
}

/** Inbox stats from Gmail Labels API (messagesTotal, messagesUnread). Not limited by sync. */
export async function getInboxStats(
  accountId: string,
  userId: string
): Promise<{ messagesTotal: number; messagesUnread: number }> {
  const token = await getValidAccessToken(accountId, userId);
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Gmail INBOX stats error: ${res.status}`);
  const data = (await res.json()) as { messagesTotal?: number; messagesUnread?: number };
  return {
    messagesTotal: data.messagesTotal ?? 0,
    messagesUnread: data.messagesUnread ?? 0,
  };
}

/** List user-created Gmail labels. Excludes system labels and domain-like names (e.g. promo.site.com). */
export async function listUserLabels(
  accountId: string,
  userId: string
): Promise<GmailLabelInfo[]> {
  const token = await getValidAccessToken(accountId, userId);

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Gmail labels list error: ${res.status}`);

  const data = (await res.json()) as { labels?: Array<{ id: string; name: string; type: string }> };
  const labels = data.labels ?? [];
  return labels
    .filter((l) => l.type === "user" && !looksLikeDomain(l.name))
    .map((l) => ({ id: l.id, name: l.name, type: l.type }));
}
