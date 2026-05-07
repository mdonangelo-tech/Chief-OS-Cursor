import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";

type Body = {
  calendarEventId: string;
  feedback: "hide";
};

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

  const calendarEventId = (body.calendarEventId ?? "").trim();
  if (!calendarEventId) {
    return NextResponse.json({ ok: false, error: "Missing calendarEventId" }, { status: 400 });
  }

  if (body.feedback !== "hide") {
    return NextResponse.json({ ok: false, error: "Invalid feedback" }, { status: 400 });
  }

  const ev = await prisma.calendarEvent.findFirst({
    where: {
      id: calendarEventId,
      googleAccount: { userId: session.user.id },
    },
    select: { id: true, explainJson: true },
  });
  if (!ev) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const prevExplain = (typeof ev.explainJson === "object" && ev.explainJson) || {};
  const explainJson = {
    ...(prevExplain as Record<string, unknown>),
    briefHiddenAt: new Date().toISOString(),
  };

  await prisma.calendarEvent.update({
    where: { id: ev.id },
    data: { explainJson },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

