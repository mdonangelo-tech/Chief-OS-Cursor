/**
 * Result of sending a magic link.
 * - success: true if the email was accepted for delivery
 * - error: present if the provider failed
 */
export interface SendMagicLinkResult {
  success: boolean;
  error?: string;
}

/**
 * Abstraction for magic link delivery.
 * Implementations: console (dev), resend, sendgrid, etc.
 */
export interface EmailProvider {
  sendMagicLink(email: string, url: string): Promise<SendMagicLinkResult>;
}
