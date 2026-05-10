import type { EmailProvider, SendEmailInput } from "./types";
import { createConsoleEmailProvider } from "./console-provider";
import { createResendEmailProvider } from "./resend-provider";

export type { EmailProvider, SendEmailInput, SendEmailResult, SendMagicLinkResult } from "./types";
export { createConsoleEmailProvider, getRecentEmails, getRecentMagicLinks } from "./console-provider";

/** Provider type from env. Default: console (dev). */
export type EmailProviderType = "console" | "resend" | "sendgrid";

function getProvider(): EmailProvider {
  const type = (process.env.EMAIL_PROVIDER ?? "console") as EmailProviderType;
  switch (type) {
    case "console":
      return createConsoleEmailProvider();
    case "resend":
      return createResendEmailProvider();
    case "sendgrid":
      throw new Error(
        `Email provider "${type}" not yet implemented. Use EMAIL_PROVIDER=console for dev.`
      );
    default:
      // Fallback to console for unknown values (safer for dev)
      return createConsoleEmailProvider();
  }
}

let cachedProvider: EmailProvider | null = null;

/** Get the configured email provider (singleton). */
export function getEmailProvider(): EmailProvider {
  if (!cachedProvider) {
    cachedProvider = getProvider();
  }
  return cachedProvider;
}

/**
 * Send a magic link to the given email.
 * Uses the provider from EMAIL_PROVIDER env (default: console).
 */
export async function sendMagicLink(
  email: string,
  url: string
): Promise<{ success: boolean; error?: string }> {
  const provider = getEmailProvider();
  return provider.sendMagicLink(email, url);
}

export async function sendEmail(input: SendEmailInput) {
  const provider = getEmailProvider();
  return provider.sendEmail(input);
}

export function resetEmailProviderForTests(): void {
  cachedProvider = null;
}
