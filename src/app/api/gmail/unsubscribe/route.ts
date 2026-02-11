import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchListUnsubscribeLinks,
  executeOneClickUnsubscribe,
} from "@/services/gmail/unsubscribe";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/gmail/unsubscribe?emailEventId=...
 * Returns List-Unsubscribe links for an email (same as Gmail uses).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailEventId = req.nextUrl.searchParams.get("emailEventId");
  if (!emailEventId) {
    return NextResponse.json(
      { error: "emailEventId required" },
      { status: 400 }
    );
  }

  const email = await prisma.emailEvent.findFirst({
    where: {
      id: emailEventId,
      googleAccount: { userId: session.user.id },
    },
    include: { googleAccount: true },
  });
  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  try {
    const links = await fetchListUnsubscribeLinks(
      email.googleAccountId,
      session.user.id,
      email.messageId
    );
    return NextResponse.json(links);
  } catch (err) {
    console.error("Unsubscribe fetch error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gmail/unsubscribe
 * Execute unsubscribe. Body: { emailEventId } or { messageId, googleAccountId }.
 * If one-click: POSTs to URL server-side, returns { action: "done" }.
 * Else: returns { action: "open", url } for client to open in new tab.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  let messageId: string;
  let googleAccountId: string;

  if (body.emailEventId) {
    const email = await prisma.emailEvent.findFirst({
      where: {
        id: body.emailEventId,
        googleAccount: { userId: session.user.id },
      },
    });
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    messageId = email.messageId;
    googleAccountId = email.googleAccountId;
  } else if (body.messageId && body.googleAccountId) {
    const account = await prisma.googleAccount.findFirst({
      where: { id: body.googleAccountId, userId: session.user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    messageId = body.messageId;
    googleAccountId = body.googleAccountId;
  } else {
    return NextResponse.json(
      { error: "emailEventId or (messageId, googleAccountId) required" },
      { status: 400 }
    );
  }

  try {
    const links = await fetchListUnsubscribeLinks(
      googleAccountId,
      session.user.id,
      messageId
    );

    if (!links.hasUnsubscribe) {
      return NextResponse.json(
        { error: "No unsubscribe link in this email" },
        { status: 400 }
      );
    }

    if (links.oneClickPostUrl) {
      const result = await executeOneClickUnsubscribe(links.oneClickPostUrl);
      if (result.success) {
        return NextResponse.json({ action: "done", message: "Unsubscribe request sent" });
      }
      return NextResponse.json(
        { action: "open", url: links.oneClickPostUrl, error: result.error },
        { status: 200 }
      );
    }

    const httpsLink = links.links.find((l) => l.type === "https");
    const mailtoLink = links.links.find((l) => l.type === "mailto");
    const fallback = httpsLink ?? mailtoLink;
    if (fallback) {
      return NextResponse.json({ action: "open", url: fallback.url });
    }

    return NextResponse.json(
      { error: "No openable unsubscribe link" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
