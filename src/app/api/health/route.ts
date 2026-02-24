import { NextResponse, type NextRequest } from "next/server";
import { withApiGuard } from "@/lib/api/api-guard";

export const GET = withApiGuard(async (_req: NextRequest) => {
  return NextResponse.json({
    ok: true,
    env: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

