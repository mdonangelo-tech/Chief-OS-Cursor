import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendMagicLink } from "@/lib/email";

const EMAIL_PROVIDER_ID = "chiefos-email";

const emailProvider: Provider = {
  id: EMAIL_PROVIDER_ID,
  name: "Email",
  type: "email",
  maxAge: 60 * 60 * 24, // 24 hours
  async sendVerificationRequest({ identifier: email, url }) {
    const result = await sendMagicLink(email, url);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to send magic link");
    }
  },
};

const providers: Provider[] = [emailProvider];
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      options: {
        maxAge: 30 * 24 * 60 * 60, // 30 days - persist across browser restarts
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
    async signIn({ user, account }) {
      const email = (user?.email ?? "").trim().toLowerCase();
      const provider = account?.provider ?? null;

      let ip: string | null = null;
      let userAgent: string | null = null;
      try {
        const h = await headers();
        const xff = h.get("x-forwarded-for");
        ip =
          (xff ? xff.split(",")[0]?.trim() : null) ??
          h.get("x-real-ip") ??
          h.get("cf-connecting-ip");
        userAgent = h.get("user-agent");
      } catch {
        // best-effort only
      }

      const allowedList = (process.env.DOGFOOD_ALLOWED_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const allowlistEnabled = allowedList.length > 0;
      const isAllowed = !allowlistEnabled || (!!email && allowedList.includes(email));
      const reason = !isAllowed ? "not_in_allowlist" : null;

      // Always record the attempt (allowed or blocked). Best-effort; never block sign-in on logging failure.
      try {
        const p = prisma as unknown as {
          loginAttempt: { create: (args: unknown) => Promise<unknown> };
        };
        await p.loginAttempt.create({
          data: {
            email: email || null,
            provider,
            ip,
            userAgent,
            allowed: isAllowed,
            reason,
          },
        });
      } catch {
        // ignore
      }

      if (!isAllowed) {
        // Redirect blocked users to waitlist without revealing allowlist details.
        return `/waitlist${email ? `?email=${encodeURIComponent(email)}` : ""}`;
      }

      return true;
    },
  },

  events: {
    async linkAccount({ user, account, profile }) {
      if (account.provider !== "google" || !account.refresh_token) return;
      const email = (profile as { email?: string })?.email ?? user.email;
      if (!email || !user.id) return;
      try {
        const { encrypt } = await import("@/lib/encryption");
        const refreshTokenEncrypted = encrypt(account.refresh_token);
        const tokenExpiry = account.expires_at
          ? new Date(account.expires_at * 1000)
          : null;
        await prisma.googleAccount.upsert({
          where: {
            userId_email: { userId: user.id, email },
          },
          create: {
            userId: user.id,
            email,
            refreshTokenEncrypted,
            accessToken: account.access_token ?? null,
            tokenExpiry,
          },
          update: {
            refreshTokenEncrypted,
            accessToken: account.access_token ?? null,
            tokenExpiry,
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("Failed to create GoogleAccount from sign-in:", err);
      }
    },
  },
});

export { EMAIL_PROVIDER_ID };
