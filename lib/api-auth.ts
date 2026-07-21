// Route-handler guards. Each returns either the verified Session or a ready-to-
// return NextResponse (401/403). Usage:
//
//   const s = requireAuth(req);
//   if (s instanceof NextResponse) return s;
//   // ...s.tenantId / s.role are now trusted (server-derived, not client input)
//
// Kept separate from lib/auth.ts so that module stays free of Next imports.

import { NextResponse } from "next/server";
import { readSession, isSuperadmin, isAdmin, type Session } from "./auth";

export function requireAuth(req: Request): Session | NextResponse {
  const session = readSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return session;
}

export function requireAdmin(req: Request): Session | NextResponse {
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;
  if (!isAdmin(s)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return s;
}

export function requireSuperadmin(req: Request): Session | NextResponse {
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;
  if (!isSuperadmin(s)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return s;
}
