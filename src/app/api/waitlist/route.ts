import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { sendWaitlistConfirmationEmail } from "@/lib/email/waitlist";

function isValidEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 3 || e.length > 320) return false;
  // Simple sanity check; avoids being overly strict.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export const POST = withApiGuard(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const emailRaw = typeof body.email === "string" ? body.email : "";
  const email = emailRaw.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const entry = await prisma.waitlistEntry.upsert({
    where: { email },
    create: {
      email,
      status: "pending",
      source: "blocked_login",
      attemptsCount: 1,
    },
    update: {
      attemptsCount: { increment: 1 },
      source: "blocked_login",
    },
    select: { id: true },
  });

  const sendResult = await sendWaitlistConfirmationEmail(email);
  if (sendResult.success) {
    await prisma.waitlistEntry.update({
      where: { email },
      data: { lastNotifiedAt: new Date() },
    });
  } else {
    // Log server-side without secrets (and avoid logging the user's email).
    console.warn(
      JSON.stringify({
        type: "waitlist_email_failed",
        message: sendResult.error ?? "unknown",
        waitlistEntryId: entry.id,
      })
    );
  }

  return NextResponse.json({
    ok: true,
    ...(sendResult.success ? {} : { warning: "Confirmation email failed to send" }),
  });
});

