import { NextResponse } from "next/server";
import { authenticate } from "@/lib/db";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side login. Verifies credentials against the DB, sets a signed httpOnly
// session cookie, and returns the safe identity (no passcode). The client no
// longer decides who it is — this cookie is the source of truth.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!username || !passcode) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  const identity = await authenticate(username, passcode);
  if (!identity) {
    return NextResponse.json({ error: "Invalid operator ID or passcode." }, { status: 401 });
  }

  const res = NextResponse.json({ user: identity });
  const token = signSession({
    username: identity.username,
    name: identity.name,
    role: identity.role,
    tenantId: identity.tenantId,
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
