import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
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
