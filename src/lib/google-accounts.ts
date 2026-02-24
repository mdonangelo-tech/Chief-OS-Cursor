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

  const encryptedLen = acc.refreshTokenEncrypted?.length ?? 0;
  const encryptedParts = typeof acc.refreshTokenEncrypted === "string"
    ? acc.refreshTokenEncrypted.split(":").length
    : null;

  let refreshToken: string;
  try {
    refreshToken = decrypt(acc.refreshTokenEncrypted);
  } catch (e) {
    try {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        "/Users/mdonangelo/Chief-OS-Cursor/.cursor/debug.log",
        JSON.stringify({
          runId: "auto-archive",
          hypothesisId: "H2",
          location: "src/lib/google-accounts.ts:getGoogleAccountWithTokens:fallbackFileLog",
          message: "Failed to decrypt stored refresh token (file fallback)",
          data: {
            accountId,
            encryptedLen,
            encryptedParts,
            err: (e as Error)?.message ?? String(e),
          },
          timestamp: Date.now(),
        }) + "\n"
      );
    } catch {
      // ignore
    }
    // #region agent log
    // #endregion
    throw e;
  }

  // #region agent log
  // #endregion

  return {
    id: acc.id,
    userId: acc.userId,
    email: acc.email,
    refreshToken,
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
