import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";

type Body = {
  emailEventId: string;
  feedback: "dismiss" | "not_important";
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

  const emailEventId = (body.emailEventId ?? "").trim();
  if (!emailEventId) {
    return NextResponse.json({ ok: false, error: "Missing emailEventId" }, { status: 400 });
  }

  const feedback = body.feedback;
  if (feedback !== "dismiss" && feedback !== "not_important") {
    return NextResponse.json({ ok: false, error: "Invalid feedback" }, { status: 400 });
  }

  const ev = await prisma.emailEvent.findFirst({
    where: {
      id: emailEventId,
      googleAccount: { userId: session.user.id },
    },
    select: { id: true },
  });
  if (!ev) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  await prisma.emailEvent.update({
    where: { id: ev.id },
    data:
      feedback === "dismiss"
        ? { briefDismissedAt: now }
        : { briefNotImportantAt: now },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

