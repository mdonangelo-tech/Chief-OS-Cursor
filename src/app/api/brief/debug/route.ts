import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true, userDefinedLabel: true, syncStateJson: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const unreadInbox = await prisma.emailEvent.findMany({
    where: {
      googleAccountId: { in: accountIds },
      unread: true,
      labels: { has: "INBOX" },
    },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      googleAccountId: true,
      from_: true,
      subject: true,
      date: true,
      labels: true,
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  const byThread = new Map<string, typeof unreadInbox>();
  for (const e of unreadInbox) {
    if (!byThread.has(e.threadId)) byThread.set(e.threadId, []);
    byThread.get(e.threadId)!.push(e);
  }

  const now = Date.now();
  const OWE_REPLY_DAYS = 3;
  const WAITING_REPLY_DAYS = 2;
  const cutoffOwe = new Date(now - OWE_REPLY_DAYS * 24 * 60 * 60 * 1000);
  const cutoffWait = new Date(now - WAITING_REPLY_DAYS * 24 * 60 * 60 * 1000);

  function extractEmail(from: string): string | null {
    const m = from.match(/<([^>]+)>/);
    if (m) return m[1].toLowerCase().trim();
    if (from.includes("@")) return from.trim().toLowerCase();
    return null;
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const openLoopCandidates: Array<{
    threadId: string;
    latestDate: string;
    latestFrom: string;
    subject: string | null;
    badge: "owe_reply" | "waiting_on" | "none";
    reason: string;
  }> = [];

  for (const [threadId, emails] of byThread) {
    const sorted = [...emails].sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = sorted[0]!;
    const acc = accountById.get(latest.googleAccountId)!;
    const fromEmail = extractEmail(latest.from_);
    const isFromUser = !!(acc && fromEmail && acc.email.toLowerCase() === fromEmail);
    const daysAgo = (now - latest.date.getTime()) / (24 * 60 * 60 * 1000);

    if (isFromUser && latest.date < cutoffOwe && daysAgo >= OWE_REPLY_DAYS) {
      openLoopCandidates.push({
        threadId,
        latestDate: latest.date.toISOString(),
        latestFrom: latest.from_,
        subject: latest.subject,
        badge: "owe_reply",
        reason: "latest from user and older than cutoff",
      });
    } else if (!isFromUser && latest.date < cutoffWait && daysAgo >= WAITING_REPLY_DAYS) {
      openLoopCandidates.push({
        threadId,
        latestDate: latest.date.toISOString(),
        latestFrom: latest.from_,
        subject: latest.subject,
        badge: "waiting_on",
        reason: "latest not from user and older than cutoff",
      });
    } else {
      openLoopCandidates.push({
        threadId,
        latestDate: latest.date.toISOString(),
        latestFrom: latest.from_,
        subject: latest.subject,
        badge: "none",
        reason: `not eligible (isFromUser=${isFromUser}, daysAgo=${daysAgo.toFixed(2)})`,
      });
    }
  }

  openLoopCandidates.sort((a, b) => a.latestDate.localeCompare(b.latestDate));

  return NextResponse.json({
    ok: true,
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      label: a.userDefinedLabel,
      syncStateJson: a.syncStateJson,
    })),
    unreadInboxCount: unreadInbox.length,
    threadsInUnreadInbox: byThread.size,
    openLoopEligibleCount: openLoopCandidates.filter((c) => c.badge !== "none").length,
    sample: {
      newestUnreadInbox: unreadInbox[0]?.date.toISOString() ?? null,
      oldestUnreadInbox: unreadInbox[unreadInbox.length - 1]?.date.toISOString() ?? null,
    },
    openLoopCandidatesSample: openLoopCandidates.slice(0, 15),
  });
}

