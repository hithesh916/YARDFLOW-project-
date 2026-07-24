// Server-side auth primitives (Phase 3 hardening). Two independent pieces:
//
//   1. Password hashing — scrypt (Node built-in, no dependency). Stored format is
//      `scrypt$<saltHex>$<hashHex>`. verifyPassword() also accepts a LEGACY
//      plaintext value (rows created before hashing existed) so the login route
//      can transparently upgrade them on first successful sign-in.
//   2. Session cookie — a stateless, HMAC-SHA256-signed token holding the
//      caller's identity. The SERVER derives tenantId + role from this, never
//      from a client-supplied header or body. Works on Vercel serverless (no
//      session table). Signed with SESSION_SECRET.
//
// Nothing here touches the database — db.ts owns Prisma. This keeps the module
// pure crypto and free of import cycles.

import crypto from "crypto";
import { promisify } from "util";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/* ---------------- password hashing (scrypt) ---------------- */

export function isHashed(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(plain, salt, 32);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

// True if `plain` matches `stored`. Handles both the scrypt format and legacy
// plaintext rows (so a not-yet-migrated password still logs in once, after which
// the login route re-hashes it).
export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashed(stored)) {
    // Legacy plaintext — constant-time compare, then the caller should upgrade.
    return safeEqualStr(stored, plain);
  }
  const [, salt, hashHex] = stored.split("$");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(plain, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ---------------- session cookie (HMAC-signed) ---------------- */

export const SESSION_COOKIE = "yardflow_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

export interface Session {
  username: string;
  name: string;
  role: string;
  // null for the superadmin and the shared demo/default workspace; a tenant id
  // string for onboarded-company operators.
  tenantId: string | null;
  exp: number; // epoch seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Fail closed in ANY production build (Vercel, cPanel, self-hosted, …). Keying this
  // on NODE_ENV — not VERCEL — means a non-Vercel deploy without a real SESSION_SECRET
  // refuses to start rather than silently signing every session with a public constant
  // (which would let anyone forge a superadmin cookie).
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set (or is too short) in the production environment.");
  }
  // Dev-only fallback so `npm run dev` works without setup.
  return "yardflow-dev-insecure-secret-change-me";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

// Serialize + sign a session. Returns the cookie VALUE (payload.signature).
export function signSession(input: Omit<Session, "exp">): string {
  const session: Session = { ...input, exp: Math.floor(nowSeconds()) + SESSION_TTL_SECONDS };
  const payloadB64 = b64url(JSON.stringify(session));
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Verify + parse a cookie value back into a Session, or null if missing, tampered
// with, or expired.
export function parseSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64);
  // timing-safe signature check
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const session = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as Session;
    if (!session || typeof session.exp !== "number" || session.exp < nowSeconds()) return null;
    return session;
  } catch {
    return null;
  }
}

// nowSeconds is a thin wrapper so the intent is clear (and easy to grep). Uses
// Date.now(), which is available at runtime in route handlers.
function nowSeconds(): number {
  return Date.now() / 1000;
}

// Read + verify the session from a request's Cookie header. Route handlers get a
// standard Request; we parse the cookie header manually to stay off NextRequest.
export function readSession(req: Request): Session | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return parseSession(value);
}

// Cookie attributes for NextResponse.cookies.set().
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/* ---------------- role helpers ---------------- */

export function isSuperadmin(s: Session | null): boolean {
  return !!s && s.role === "superadmin";
}

export function isAdmin(s: Session | null): boolean {
  return !!s && (s.role === "superadmin" || s.role === "Administrator" || s.role === "Admin");
}

// Same-tenant check that treats null/undefined/"default" as the shared workspace.
export function sameTenant(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (x: string | null | undefined) => (x && x !== "default" ? x : null);
  return norm(a) === norm(b);
}
