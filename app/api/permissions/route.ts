import { NextResponse } from "next/server";
import { updateRolePermissions } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const s = requireAdmin(req);
    if (s instanceof NextResponse) return s;
    const callerTenant = s.tenantId ?? undefined;
    const body = await req.json();
    const { role, allowedPaths } = body;

    if (!role || !Array.isArray(allowedPaths)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const state = await updateRolePermissions(role, allowedPaths, callerTenant);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
