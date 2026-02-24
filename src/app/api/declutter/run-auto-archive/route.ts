import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { archiveMessage } from "@/services/gmail/actions";
import type { RunAutoArchiveResponse } from "@/types/declutter";

const MAX_PER_CALL = 100;

export async function GET() {
  // Browsers show a scary error page for 405s; return a friendly 200 JSON instead.
  return NextResponse.json({
    ok: false,
    error: "Use POST /api/declutter/run-auto-archive to run auto-archive.",
    hint: "If you want a read-only preview, use GET /api/declutter/preview-auto-archive.",
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const runId = randomUUID();

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    const empty: RunAutoArchiveResponse = { ok: true, processed: 0 };
    return NextResponse.json(empty);
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);

  // Avoid re-archiving messages this tool already archived.
  const alreadyArchived = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          userId,
          actionType: "ARCHIVE",
          messageId: { not: null },
        },
        select: { messageId: true },
      })
    )
      .map((a) => a.messageId)
      .filter(Boolean) as string[]
  );

  const candidates = await prisma.emailEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      labels: { has: "INBOX" },
      messageId: { notIn: Array.from(alreadyArchived) },
    },
    select: {
      id: true,
      googleAccountId: true,
      messageId: true,
      from_: true,
      subject: true,
      snippet: true,
      date: true,
      labels: true,
      senderDomain: true,
      classificationCategoryId: true,
      confidence: true,
      explainJson: true,
    },
    orderBy: { date: "asc" },
    take: 2000,
  });

  const eligible = [];
  for (const e of candidates) {
    const decision = decideEmail(
      {
        id: e.id,
        googleAccountId: e.googleAccountId,
        date: e.date,
        from_: e.from_,
        senderDomain: e.senderDomain,
        classificationCategoryId: e.classificationCategoryId,
        confidence: e.confidence,
        explainJson: e.explainJson,
      },
      ctx
    );
    if (decision.action !== "ARCHIVE_AT") continue;
    if (!decision.archiveAt) continue;
    if (new Date(decision.archiveAt).getTime() > now.getTime()) continue;
    eligible.push({ e, decision });
    if (eligible.length >= MAX_PER_CALL) break;
  }

  function decisionConfidence(decision: ReturnType<typeof decideEmail>): number | undefined {
    const winner = decision.reason.winner;
    if (winner === "personRule" || winner === "domainRule") return 1;
    if (winner === "llm") {
      const c = decision.reason.candidates.find((x) => x.source === "llm")?.confidence;
      return typeof c === "number" ? c : undefined;
    }
    return undefined;
  }

  let processed = 0;
  for (const { e, decision } of eligible) {
    await archiveMessage(
      userId,
      e.googleAccountId,
      e.messageId,
      JSON.stringify(decision.reason),
      decisionConfidence(decision),
      runId
    );

    await prisma.emailEvent.update({
      where: { id: e.id },
      data: { unread: false },
    });

    processed++;
  }

  const res: RunAutoArchiveResponse = { ok: true, processed };
  return NextResponse.json(res);
}

