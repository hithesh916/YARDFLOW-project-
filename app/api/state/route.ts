import { NextResponse } from "next/server";
import { getState } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isSuperadmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Tenant scope comes from the verified session — NOT a client header. An
  // unauthenticated request gets nothing.
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;

  // A superadmin may read ANY tenant's snapshot by passing ?tenantId= (used by
  // the "view client dashboard" feature). This override is honored ONLY for a
  // superadmin — for every other caller the param is ignored and scope stays
  // locked to their own session, preserving tenant isolation. Read-only: no
  // mutation route accepts this override.
  const url = new URL(req.url);
  const requested = url.searchParams.get("tenantId");
  const target =
    requested && isSuperadmin(s) ? requested : (s.tenantId ?? undefined);

  const state = await getState(target, { superadmin: isSuperadmin(s) });
  return NextResponse.json(state);
}
