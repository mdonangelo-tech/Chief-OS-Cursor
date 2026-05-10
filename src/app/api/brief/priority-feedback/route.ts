import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";
import { applyThreadAttention } from "@/services/attention/thread-attention";
import { recordNotImportantFeedback } from "@/services/attention/ranking-profile";

type Body = {
  emailEventId: string;
  feedback: "dismiss" | "acknowledge" | "not_important";
};

function extractEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  if (from.includes("@")) return from.trim().toLowerCase();
  return null;
}

async function postImpl(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const emailEventId = (body.emailEventId ?? "").trim();
  if (!emailEventId) {
    return NextResponse.json({ ok: false, error: "Missing emailEventId" }, { status: 400 });
  }

  const feedback = body.feedback;
  if (feedback !== "dismiss" && feedback !== "acknowledge" && feedback !== "not_important") {
    return NextResponse.json({ ok: false, error: "Invalid feedback" }, { status: 400 });
  }

  const ev = await prisma.emailEvent.findFirst({
    where: {
      id: emailEventId,
      googleAccount: { userId: session.user.id },
    },
    select: {
      id: true,
      threadId: true,
      googleAccountId: true,
      from_: true,
      senderDomain: true,
      subject: true,
      snippet: true,
      labels: true,
      category: { select: { name: true } },
    },
  });
  if (!ev) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  await prisma.emailEvent.update({
    where: { id: ev.id },
    data:
      feedback === "dismiss" || feedback === "acknowledge"
        ? { briefDismissedAt: now }
        : { briefNotImportantAt: now },
  });

  await applyThreadAttention({
    userId: session.user.id,
    googleAccountId: ev.googleAccountId,
    threadId: ev.threadId,
    action: feedback === "not_important" ? "not_important" : "handled",
    now,
  });

  if (feedback === "not_important") {
    const fromEmail = extractEmail(ev.from_);
    const domainRaw = (ev.senderDomain ?? "").trim().toLowerCase();
    const domain =
      domainRaw ||
      (() => {
        const em = extractEmail(ev.from_);
        if (!em) return null;
        const at = em.lastIndexOf("@");
        return at > 0 ? em.slice(at + 1) : null;
      })();
    await recordNotImportantFeedback({
      userId: session.user.id,
      fromEmail,
      senderDomain: domain,
      categoryName: ev.category?.name ?? null,
      labels: ev.labels,
      subject: ev.subject,
      snippet: ev.snippet,
    });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

