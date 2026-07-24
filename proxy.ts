import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Defense-in-depth ONLY. The real security boundary is server-side in every API route
// (requireAuth / requireAdmin / requireSuperadmin against the signed cookie). This
// proxy just stops an UNAUTHENTICATED direct hit on a privileged page shell from
// rendering — it redirects to "/" (which shows the login screen) when no session cookie
// is present. It deliberately does NOT verify the HMAC signature or the role here: that
// needs Node crypto (unavailable on the Edge runtime) and is already enforced by the
// APIs those pages call, so a forged/incorrect cookie still gets nothing but 401/403.
const SESSION_COOKIE = "yardflow_session";
const PROTECTED = ["/admin", "/superadmin"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/superadmin/:path*"],
};
