type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase().trim();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") return env;
  // Default: quiet debug logs in production unless explicitly enabled.
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function scrub(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    const looksSensitive =
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("authorization") ||
      key.includes("password") ||
      key.includes("refresh") ||
      key.includes("access") ||
      key.includes("body") ||
      key.includes("payload") ||
      key.includes("raw");

    out[k] = looksSensitive ? "[redacted]" : scrub(v);
  }
  return out;
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? { ctx: scrub(ctx) } : {}),
  };

  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

