import { auth } from "@/auth";
import { getMostRecentGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 min before expiry

/**
 * GET /api/google/health
 * Validates the most recent connected Google account:
 * - Loads account with decrypted tokens
 * - Refreshes access token if needed
 * - Calls Gmail profile to verify scopes
 * Returns { ok: true, email, scopes } or error payload.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const account = await getMostRecentGoogleAccountWithTokens(session.user.id);
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No Google account connected", code: "NO_ACCOUNT" },
        { status: 404 }
      );
    }

    let accessToken = account.accessToken;
    const now = Date.now();
    const expiryMs = account.tokenExpiry?.getTime() ?? 0;
    const needsRefresh =
      !accessToken || expiryMs - now < TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh) {
      const tokens = await refreshAccessToken(account.refreshToken);
      accessToken = tokens.access_token;
      const tokenExpiry = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await prisma.googleAccount.update({
        where: { id: account.id },
        data: {
          accessToken: tokens.access_token,
          tokenExpiry,
          updatedAt: new Date(),
        },
      });
    }

    const profileRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail API call failed",
          code: "GMAIL_API_ERROR",
          details: profileRes.status === 401 ? "Token invalid or expired" : errText,
        },
        { status: 502 }
      );
    }

    const profile = (await profileRes.json()) as { emailAddress?: string };

    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
    );
    const tokenInfo = tokenInfoRes.ok
      ? ((await tokenInfoRes.json()) as { scope?: string })
      : null;
    const scopes = tokenInfo?.scope?.split(" ").filter(Boolean) ?? [];

    return NextResponse.json({
      ok: true,
      email: profile.emailAddress ?? account.email,
      scopes,
    });
  } catch (err) {
    console.error("Google health check error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message,
        code: "HEALTH_CHECK_ERROR",
      },
      { status: 500 }
    );
  }
}
