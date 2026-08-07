import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

// Cheap, edge-safe gate: only checks whether a session cookie is present, no DB call.
// The authoritative check (hash the token, look it up, verify it hasn't expired) happens
// in studio/layout.tsx and the admin page, which also load the real user/organisation.
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/studio/:path*", "/admin/:path*"],
};
