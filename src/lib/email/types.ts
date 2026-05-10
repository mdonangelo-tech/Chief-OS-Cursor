/**
 * Result of sending a magic link.
 * - success: true if the email was accepted for delivery
 * - error: present if the provider failed
 */
export interface SendMagicLinkResult {
  success: boolean;
  error?: string;
}

export interface SendEmailInput {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Abstraction for magic link delivery.
 * Implementations: console (dev), resend, sendgrid, etc.
 */
export interface EmailProvider {
  sendMagicLink(email: string, url: string): Promise<SendMagicLinkResult>;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
