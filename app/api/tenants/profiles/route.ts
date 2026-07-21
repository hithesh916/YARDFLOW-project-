import { NextResponse } from "next/server";
import { listTenantProfiles } from "@/lib/db";
import { requireSuperadmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every onboarded client's company profile, for the superadmin's Admin Console.
// Gated by requireSuperadmin — no other role can read across tenants.
export async function GET(req: Request) {
  const s = requireSuperadmin(req);
  if (s instanceof NextResponse) return s;
  const profiles = await listTenantProfiles();
  return NextResponse.json({ profiles });
}
