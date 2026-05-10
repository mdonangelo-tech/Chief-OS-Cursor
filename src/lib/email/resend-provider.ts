import { Resend } from "resend";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "./types";

function defaultFrom(): string {
  const from = process.env.EMAIL_FROM ?? process.env.AUTH_EMAIL_FROM;
  if (from) return from;
  if (process.env.NODE_ENV === "production") {
    throw new Error("EMAIL_FROM or AUTH_EMAIL_FROM is required for production email sends");
  }
  return "ChiefOS <onboarding@resend.dev>";
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createResendEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const resend = new Resend(apiKey);

  async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const { data, error } = await resend.emails.send({
        from: input.from ?? defaultFrom(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Resend send failed",
      };
    }
  }

  return {
    async sendMagicLink(email: string, url: string) {
      const safeUrl = htmlEscape(url);
      const result = await sendEmail({
        to: email,
        subject: "Sign in to ChiefOS",
        html: `<p>Use this link to sign in to ChiefOS:</p><p><a href="${safeUrl}">Sign in to ChiefOS</a></p><p>If you did not request this, you can ignore this email.</p>`,
        text: `Use this link to sign in to ChiefOS:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        idempotencyKey: `magic-link/${email}/${Date.now()}`,
        tags: [{ name: "category", value: "magic_link" }],
      });
      return result.success
        ? { success: true }
        : { success: false, error: result.error };
    },
    sendEmail,
  };
}
