import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "@/lib/google-oauth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/connect-google/callback
 * Handles Google OAuth callback: exchanges code for tokens,
 * saves GoogleAccount with encrypted refresh token.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL("/login?error=SessionExpired", getBaseUrl(req))
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error)}`, getBaseUrl(req))
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/accounts?error=NoCode", getBaseUrl(req))
    );
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/connect-google/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          "/settings/accounts?error=NoRefreshToken",
          getBaseUrl(req)
        )
      );
    }

    const { email } = await fetchGoogleUserInfo(tokens.access_token);
    const refreshTokenEncrypted = encrypt(tokens.refresh_token);
    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await prisma.googleAccount.upsert({
      where: {
        userId_email: {
          userId: session.user.id,
          email,
        },
      },
      create: {
        userId: session.user.id,
        email,
        refreshTokenEncrypted,
        accessToken: tokens.access_token,
        tokenExpiry,
      },
      update: {
        refreshTokenEncrypted,
        accessToken: tokens.access_token,
        tokenExpiry,
        updatedAt: new Date(),
      },
    });

    const returnTo = (() => {
      try {
        const state = req.nextUrl.searchParams.get("state");
        if (!state) return "/settings/accounts";
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString()) as { returnTo?: string };
        return decoded.returnTo && decoded.returnTo.startsWith("/") ? decoded.returnTo : "/settings/accounts";
      } catch {
        return "/settings/accounts";
      }
    })();

    return NextResponse.redirect(new URL(`${returnTo}?success=connected`, baseUrl));
  } catch (err) {
    console.error("Connect Google callback error:", err);
    return NextResponse.redirect(
      new URL(
        `/settings/accounts?error=${encodeURIComponent((err as Error).message)}`,
        getBaseUrl(req)
      )
    );
  }
}

function getBaseUrl(req: NextRequest): string {
  return process.env.AUTH_URL ?? req.nextUrl.origin;
}
