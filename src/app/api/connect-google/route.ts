import { auth } from "@/auth";
import { getConnectGoogleAuthUrl } from "@/lib/google-oauth";
import { getAuthUrl } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/connect-google
 * Redirects to Google OAuth for connecting Gmail + Calendar.
 * Optional ?returnTo=/setup to redirect back after connect.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", getAuthUrl()));
  }

  const baseUrl = getAuthUrl();
  const redirectUri = `${baseUrl}/api/connect-google/callback`;
  const returnTo = req.nextUrl.searchParams.get("returnTo");

  const state = returnTo ? Buffer.from(JSON.stringify({ returnTo })).toString("base64url") : undefined;
  const url = getConnectGoogleAuthUrl(redirectUri, state);
  return NextResponse.redirect(url);
}
