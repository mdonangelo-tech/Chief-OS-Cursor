/**
 * Helpers for GoogleAccount with encrypted token handling.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export interface GoogleAccountWithTokens {
  id: string;
  userId: string;
  email: string;
  refreshToken: string;
  accessToken: string | null;
  tokenExpiry: Date | null;
  userDefinedLabel: string | null;
}

/**
 * Get a Google account with decrypted refresh token.
 * Use when making Gmail/Calendar API calls.
 */
export async function getGoogleAccountWithTokens(
  accountId: string,
  userId: string
): Promise<GoogleAccountWithTokens | null> {
  const acc = await prisma.googleAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!acc) return null;

  return {
    id: acc.id,
    userId: acc.userId,
    email: acc.email,
    refreshToken: decrypt(acc.refreshTokenEncrypted),
    accessToken: acc.accessToken,
    tokenExpiry: acc.tokenExpiry,
    userDefinedLabel: acc.userDefinedLabel,
  };
}

/**
 * Get the most recent connected Google account for a user, with decrypted tokens.
 */
export async function getMostRecentGoogleAccountWithTokens(
  userId: string
): Promise<GoogleAccountWithTokens | null> {
  const acc = await prisma.googleAccount.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!acc) return null;

  return getGoogleAccountWithTokens(acc.id, userId);
}
