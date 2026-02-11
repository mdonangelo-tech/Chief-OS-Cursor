import { auth } from "@/auth";
import { seedUserSetup } from "@/lib/setup-defaults";
import { NextResponse } from "next/server";

/**
 * POST /api/setup/complete
 * Seeds default goals, categories, and declutter prefs for the user.
 * Idempotent: only creates if empty.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await seedUserSetup(session.user.id);
  return NextResponse.json({ ok: true });
}
