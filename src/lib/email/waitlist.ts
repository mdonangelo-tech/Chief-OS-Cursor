function isConsoleProvider(): boolean {
  return (process.env.EMAIL_PROVIDER ?? "console") === "console";
}

export async function sendWaitlistConfirmationEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const subject = "You’re on the ChiefOS waitlist";
  const text = `You’re on the ChiefOS waitlist.\n\nWe’ll email you when we’re ready to invite more people.\n\n— ChiefOS`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5">
      <p>You’re on the <strong>ChiefOS</strong> waitlist.</p>
      <p>We’ll email you when we’re ready to invite more people.</p>
      <p style="color:#666">— ChiefOS</p>
    </div>
  `.trim();

  if (isConsoleProvider()) {
    // eslint-disable-next-line no-console
    console.log(`[ChiefOS Waitlist Confirmation]\n  to=${email}\n  subject=${subject}\n  text=${text}`);
    return { success: true };
  }

  // Resend/Sendgrid providers aren't implemented in this codebase yet.
  return {
    success: false,
    error:
      'Email provider is not implemented. Set EMAIL_PROVIDER="console" for dev.',
  };
}

