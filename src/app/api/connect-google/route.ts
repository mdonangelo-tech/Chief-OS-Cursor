import { auth } from "@/auth";
import { getConnectGoogleAuthUrl } from "@/lib/google-oauth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/connect-google
 * Redirects to Google OAuth for connecting Gmail + Calendar.
 * Optional ?returnTo=/setup to redirect back after connect.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000"));
  }

  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/connect-google/callback`;
  const returnTo = req.nextUrl.searchParams.get("returnTo");

  const state = returnTo ? Buffer.from(JSON.stringify({ returnTo })).toString("base64url") : undefined;
  const url = getConnectGoogleAuthUrl(redirectUri, state);
  return NextResponse.redirect(url);
}
