import { NextResponse } from "next/server";
import { getState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Each company's data is isolated by tenantId; the client sends its workspace
  // in x-tenant-id (absent → shared default workspace for demo/superadmin).
  const tenantId = req.headers.get("x-tenant-id") ?? undefined;
  const state = await getState(tenantId);
  return NextResponse.json(state);
}
