import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decideEmail } from "@/lib/decision-engine";
import { buildDeclutterDecisionCtx } from "@/lib/declutter-decision-ctx";
import { archiveMessage, moveToSpamMessage } from "@/services/gmail/actions";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import type { RunAutoArchiveResponse } from "@/types/declutter";

const MAX_PER_CALL = 100;
const PAGE_SIZE = 2000;
const MAX_SCAN = 50_000;

type ScanRow = {
  id: string;
  googleAccountId: string;
  date: Date;
  from_: string;
  senderDomain: string | null;
  classificationCategoryId: string | null;
  confidence: number | null;
  explainJson: unknown;
};

function normalizePolicyAction(action: string): string {
  return (action ?? "").toLowerCase().trim();
}

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
    const empty: RunAutoArchiveResponse = { ok: true, processed: 0, remainingEligible: 0 };
    return NextResponse.json(empty);
  }

  const ctx = await buildDeclutterDecisionCtx(userId, now);

  // Avoid re-archiving messages this tool already archived.
  const alreadyArchived = new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          userId,
          actionType: { in: ["ARCHIVE", "SPAM"] },
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
      NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
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

  function uniqueLabels(labels: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const l of labels) {
      if (!seen.has(l)) {
        seen.add(l);
        out.push(l);
      }
    }
    return out;
  }

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
    if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
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
    if (decision.action === "SPAM") {
      const { afterLabels } = await moveToSpamMessage(
        userId,
        e.googleAccountId,
        e.messageId,
        JSON.stringify(decision.reason),
        decisionConfidence(decision),
        runId
      );

      const nextLabels = uniqueLabels(
        afterLabels.filter((l) => l !== "INBOX").concat(["SPAM"])
      );

      await prisma.emailEvent.update({
        where: { id: e.id },
        data: { labels: { set: nextLabels }, unread: false },
      });
    } else {
      const { afterLabels } = await archiveMessage(
        userId,
        e.googleAccountId,
        e.messageId,
        JSON.stringify(decision.reason),
        decisionConfidence(decision),
        runId
      );

      const nextLabels = uniqueLabels(
        afterLabels.filter((l) => l !== "INBOX").concat([CHIEFOS_ARCHIVED_LABEL])
      );

      await prisma.emailEvent.update({
        where: { id: e.id },
        data: { labels: { set: nextLabels }, unread: false },
      });
    }

    processed++;
  }

  // Re-count eligible after this batch so the UI can say what's left.
  let minEligibleDays: number | null = null;
  for (const p of Object.values(ctx.categoryPoliciesById)) {
    if (!p) continue;
    const a = normalizePolicyAction(p.action);
    if (a === "archive_after_48h") {
      minEligibleDays = minEligibleDays == null ? 2 : Math.min(minEligibleDays, 2);
    } else if (a === "archive_after_days" || a === "archive_after_n_days") {
      const n = p.archiveAfterDays;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) {
        minEligibleDays = minEligibleDays == null ? n : Math.min(minEligibleDays, n);
      }
    }
  }
  const recountNow = new Date();
  const cutoff = minEligibleDays != null
    ? new Date(recountNow.getTime() - minEligibleDays * 24 * 60 * 60 * 1000)
    : null;

  let remainingEligible = 0;
  let scanned = 0;
  let cursorId: string | null = null;
  while (scanned < MAX_SCAN) {
    const page: ScanRow[] = await prisma.emailEvent.findMany({
      where: {
        googleAccountId: { in: accountIds },
        labels: { has: "INBOX" },
        NOT: { labels: { has: CHIEFOS_ARCHIVED_LABEL } },
        ...(cutoff ? { date: { lte: cutoff } } : {}),
      },
      select: {
        id: true,
        googleAccountId: true,
        date: true,
        from_: true,
        senderDomain: true,
        classificationCategoryId: true,
        confidence: true,
        explainJson: true,
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    cursorId = page[page.length - 1].id;

    for (const e of page) {
      scanned++;
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
      if (decision.action !== "ARCHIVE_AT" && decision.action !== "SPAM") continue;
      if (!decision.archiveAt) continue;
      if (new Date(decision.archiveAt).getTime() > recountNow.getTime()) continue;
      remainingEligible++;
      if (scanned >= MAX_SCAN) break;
    }
  }

  const res: RunAutoArchiveResponse = { ok: true, processed, remainingEligible };
  return NextResponse.json(res);
}

