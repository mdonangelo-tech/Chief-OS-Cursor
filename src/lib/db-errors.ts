export type DbErrorInfo = {
  code: "DB_UNREACHABLE";
  message: string;
};

export function isDbUnreachableError(err: unknown): boolean {
  const msg =
    typeof (err as { message?: unknown })?.message === "string"
      ? ((err as { message: string }).message as string)
      : String(err);
  const m = msg.toLowerCase();
  return (
    m.includes("can't reach database server") ||
    m.includes("cant reach database server") ||
    m.includes("p1001") ||
    m.includes("prisma schema validation") // occasional Neon/DIRECT_URL misconfig manifests like this
  );
}

export function asDbErrorInfo(err: unknown): DbErrorInfo | null {
  if (!isDbUnreachableError(err)) return null;
  return {
    code: "DB_UNREACHABLE",
    message: "Database temporarily unavailable. Please try again in a minute.",
  };
}

