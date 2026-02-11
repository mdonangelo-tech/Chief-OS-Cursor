import type { EmailProvider } from "./types";

/** In-memory store for recent magic links (dev only). */
const recentLinks: Array<{ email: string; url: string; createdAt: Date }> = [];
const MAX_RECENT = 50;

export interface ConsoleEmailProviderOptions {
  /** Max links to retain for dev page. Default 50. */
  maxRecent?: number;
}

/**
 * Dev-only provider: logs magic link to console and stores it for the dev page.
 * Safe to use in development; should not be used in production.
 */
export function createConsoleEmailProvider(
  options: ConsoleEmailProviderOptions = {}
): EmailProvider {
  const maxRecent = options.maxRecent ?? MAX_RECENT;

  return {
    async sendMagicLink(email: string, url: string) {
      const entry = { email, url, createdAt: new Date() };
      recentLinks.unshift(entry);
      if (recentLinks.length > maxRecent) {
        recentLinks.pop();
      }
      // eslint-disable-next-line no-console
      console.log(
        `[ChiefOS Magic Link] email=${email}\n  url=${url}\n  at=${entry.createdAt.toISOString()}`
      );
      return { success: true };
    },
  };
}

/** Get recent magic links for dev page. Call only in non-production. */
export function getRecentMagicLinks(): Array<{
  email: string;
  url: string;
  createdAt: string;
}> {
  return recentLinks.map((e) => ({
    email: e.email,
    url: e.url,
    createdAt: e.createdAt.toISOString(),
  }));
}
