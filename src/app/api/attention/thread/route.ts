import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { withApiGuard } from "@/lib/api/api-guard";
import {
  applyThreadAttention,
  type ThreadAttentionAction,
} from "@/services/attention/thread-attention";
import { prisma } from "@/lib/prisma";

const ACTIONS: ThreadAttentionAction[] = [
  "not_important",
  "important",
  "dismiss",
  "handled",
  "snooze_later_today",
  "snooze_tomorrow",
  "snooze_next_week",
  "waiting_on",
  "clear_waiting",
  "never_similar",
  "clear_snooze",
];

function extractEmail(fromHeader: string): string | null {
  const m = fromHeader.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  if (fromHeader.includes("@")) return fromHeader.trim().toLowerCase();
  return null;
}

function extractDomain(fromHeader: string): string | null {
  const email = extractEmail(fromHeader);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

async function postImpl(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    googleAccountId?: string;
    threadId?: string;
    action?: string;
    lastFrom?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const googleAccountId = (body.googleAccountId ?? "").trim();
  const threadId = (body.threadId ?? "").trim();
  const action = body.action as ThreadAttentionAction;

  if (!googleAccountId || !threadId) {
    return NextResponse.json({ ok: false, error: "Missing googleAccountId or threadId" }, { status: 400 });
  }
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  try {
    await applyThreadAttention({
      userId: session.user.id,
      googleAccountId,
      threadId,
      action,
    });

    if (action === "never_similar" && body.lastFrom) {
      const email = extractEmail(body.lastFrom);
      const domain = extractDomain(body.lastFrom);
      const rows = [
        email ? { userId: session.user.id, type: "person" as const, value: email } : null,
        domain ? { userId: session.user.id, type: "domain" as const, value: domain } : null,
      ].filter((r): r is { userId: string; type: "person" | "domain"; value: string } => r != null);
      if (rows.length > 0) {
        await prisma.rejectedSuggestion.createMany({ data: rows, skipDuplicates: true });
      }
    }

    if (action === "not_important" || action === "never_similar") {
      const { recordNotImportantFeedback } = await import("@/services/attention/ranking-profile");
      const email = body.lastFrom ? extractEmail(body.lastFrom) : null;
      const domain = body.lastFrom ? extractDomain(body.lastFrom) : null;
      await recordNotImportantFeedback({
        userId: session.user.id,
        fromEmail: email,
        senderDomain: domain,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export const POST = withApiGuard(postImpl);
