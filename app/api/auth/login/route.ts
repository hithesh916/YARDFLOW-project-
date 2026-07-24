import { NextResponse } from "next/server";
import { authenticate } from "@/lib/db";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-process brute-force throttle. Keyed by client IP + username so one bad actor
// can't lock out a whole login, and vice-versa. After MAX_FAILS failures inside
// WINDOW_MS the key is blocked until the window rolls off; a success clears it.
// Per-instance (fine for the single cPanel Node process); a shared store would be
// needed for a multi-instance deploy.
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const attempts = new Map<string, { count: number; first: number }>();

function throttleKey(req: Request, username: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${ip}:${username.trim().toLowerCase()}`;
}

function isBlocked(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

function recordFail(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
  } else {
    rec.count += 1;
  }
}

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

  const key = throttleKey(req, username);
  if (isBlocked(key)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const identity = await authenticate(username, passcode);
  if (!identity) {
    recordFail(key);
    return NextResponse.json({ error: "Invalid operator ID or passcode." }, { status: 401 });
  }
  attempts.delete(key); // success clears the counter

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
