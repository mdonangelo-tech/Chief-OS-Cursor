import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://chief-os.ai",
  "https://www.chief-os.ai",
  "https://api.chief-os.ai",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
]);

type RateLimitState = { resetAtMs: number; count: number };
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const rateLimitByIp = new Map<string, RateLimitState>();

function nowMs(): number {
  return Date.now();
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function getRequestId(req: NextRequest): string {
  return (
    req.headers.get("x-vercel-id") ??
    req.headers.get("x-request-id") ??
    globalThis.crypto?.randomUUID?.() ??
    `${nowMs()}-${Math.random().toString(16).slice(2)}`
  );
}

function setSecurityHeaders(res: Response, req: NextRequest): void {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set("Cache-Control", "no-store");

  const url = new URL(req.url);
  if (process.env.NODE_ENV === "production" && url.protocol === "https:") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
}

function corsHeadersFor(origin: string | null): HeadersInit {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    Vary: "Origin",
  };
}

function enforceCors(req: NextRequest): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // non-browser / same-origin / curl
  if (!ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { ok: false, error: "CORS origin not allowed" },
      { status: 403 }
    );
  }
  return null;
}

function rateLimit(req: NextRequest): Response | null {
  const ip = getClientIp(req);
  const key = ip || "unknown";
  const t = nowMs();
  const state = rateLimitByIp.get(key);
  if (!state || state.resetAtMs <= t) {
    rateLimitByIp.set(key, { resetAtMs: t + RATE_LIMIT.windowMs, count: 1 });
    return null;
  }
  if (state.count >= RATE_LIMIT.max) {
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAtMs - t) / 1000));
    const res = NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfterSec));
    return res;
  }
  state.count++;
  return null;
}

export function withApiGuard(
  handler: (req: NextRequest) => Promise<Response> | Response
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const start = nowMs();
    const requestId = getRequestId(req);
    const ip = getClientIp(req);
    const url = new URL(req.url);

    try {
      // CORS preflight
      if (req.method === "OPTIONS") {
        const origin = req.headers.get("origin");
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
          const res = NextResponse.json(
            { ok: false, error: "CORS origin not allowed" },
            { status: 403 }
          );
          setSecurityHeaders(res, req);
          res.headers.set("X-Request-Id", requestId);
          return res;
        }
        const res = new Response(null, { status: 204 });
        setSecurityHeaders(res, req);
        res.headers.set("X-Request-Id", requestId);
        const cors = corsHeadersFor(origin);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }

      const corsFail = enforceCors(req);
      if (corsFail) {
        setSecurityHeaders(corsFail, req);
        corsFail.headers.set("X-Request-Id", requestId);
        const origin = req.headers.get("origin");
        const cors = corsHeadersFor(origin);
        for (const [k, v] of Object.entries(cors)) corsFail.headers.set(k, v);
        return corsFail;
      }

      const limited = rateLimit(req);
      if (limited) {
        setSecurityHeaders(limited, req);
        limited.headers.set("X-Request-Id", requestId);
        const origin = req.headers.get("origin");
        const cors = corsHeadersFor(origin);
        for (const [k, v] of Object.entries(cors)) limited.headers.set(k, v);
        return limited;
      }

      const res = await handler(req);
      const out = new Response(res.body, res);
      setSecurityHeaders(out, req);
      out.headers.set("X-Request-Id", requestId);
      const origin = req.headers.get("origin");
      const cors = corsHeadersFor(origin);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);

      const latencyMs = nowMs() - start;
      console.info(
        JSON.stringify({
          type: "api",
          requestId,
          method: req.method,
          path: url.pathname,
          status: out.status,
          latencyMs,
          ip: ip === "unknown" ? "unknown" : ip,
        })
      );

      return out;
    } catch (err) {
      const latencyMs = nowMs() - start;
      console.error(
        JSON.stringify({
          type: "api_error",
          requestId,
          method: req.method,
          path: url.pathname,
          latencyMs,
          message: (err as Error)?.message ?? String(err),
        })
      );
      const res = NextResponse.json(
        { ok: false, error: "Internal server error", requestId },
        { status: 500 }
      );
      setSecurityHeaders(res, req);
      res.headers.set("X-Request-Id", requestId);
      const origin = req.headers.get("origin");
      const cors = corsHeadersFor(origin);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
  };
}

