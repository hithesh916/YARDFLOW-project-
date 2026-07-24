import { NextResponse } from "next/server";
import { reset } from "@/lib/db";
import { requireSuperadmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Superadmin only, and scoped to the caller's own workspace — no longer a public
// endpoint that wipes every tenant.
export async function POST(req: Request) {
  const s = requireSuperadmin(req);
  if (s instanceof NextResponse) return s;
  try {
    const state = await reset(s.tenantId ?? undefined);
    return NextResponse.json({ state });
  } catch (e) {
    console.error("reset failed:", e);
    return NextResponse.json({ error: "Could not reset the workspace." }, { status: 500 });
  }
}
