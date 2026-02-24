import { NextResponse, type NextRequest } from "next/server";

function privateModeEnabled(): boolean {
  return (process.env.PRIVATE_MODE ?? "").toLowerCase().trim() === "true";
}

function timingSafeEqual(a: string, b: string): boolean {
  // Reasonable constant-time compare for edge runtime.
  const len = Math.max(a.length, b.length);
  let out = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i) || 0;
    const cb = b.charCodeAt(i) || 0;
    out |= ca ^ cb;
  }
  return out === 0;
}

function basicAuthUnauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ChiefOS"',
    },
  });
}

function requireBasicAuth(req: NextRequest): Response | null {
  if (!privateModeEnabled()) return null;

  const expectedUser = process.env.BASIC_AUTH_USER ?? "";
  const expectedPass = process.env.BASIC_AUTH_PASSWORD ?? "";
  if (!expectedUser || !expectedPass) {
    return new Response("Server misconfigured: BASIC_AUTH_* missing", { status: 500 });
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return basicAuthUnauthorized();

  let decoded = "";
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return basicAuthUnauthorized();
  }
  const idx = decoded.indexOf(":");
  const user = idx >= 0 ? decoded.slice(0, idx) : "";
  const pass = idx >= 0 ? decoded.slice(idx + 1) : "";

  const ok =
    timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass);
  return ok ? null : basicAuthUnauthorized();
}

export default auth((req) => {
  const basicFail = requireBasicAuth(req);
  if (basicFail) return basicFail;

  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login");
  const isDevPage = req.nextUrl.pathname.startsWith("/dev/");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (isApiAuth) return NextResponse.next();
  // Never redirect API routes to HTML login pages; API routes should return JSON 401.
  if (isApi) return NextResponse.next();
  if (isDevPage) return NextResponse.next();
  if (isAuthPage && isLoggedIn) return Response.redirect(new URL("/brief", req.url));
  if (isLoggedIn && req.nextUrl.pathname === "/") {
    return Response.redirect(new URL("/brief", req.url));
  }
  if (!isAuthPage && !isLoggedIn && req.nextUrl.pathname !== "/") {
    return Response.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

