import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withApiGuard } from "@/lib/api/api-guard";

type Body = {
  emailEventId: string;
  categoryId: string | null;
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

  const categoryIdRaw = body.categoryId;
  const categoryId = typeof categoryIdRaw === "string" ? categoryIdRaw.trim() : null;

  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, userId: session.user.id },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json({ ok: false, error: "Invalid categoryId" }, { status: 400 });
    }
  }

  const ev = await prisma.emailEvent.findFirst({
    where: {
      id: emailEventId,
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
    manualCategoryOverrideAt: new Date().toISOString(),
    manualCategoryOverrideFromBrief: true,
  };

  await prisma.emailEvent.update({
    where: { id: ev.id },
    data: {
      classificationCategoryId: categoryId,
      explainJson,
    },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withApiGuard(postImpl);

