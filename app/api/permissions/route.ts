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
    // Log the real error server-side; return a generic message so Prisma internals
    // (table/column/connection details) never reach the client.
    console.error("updateRolePermissions failed:", err);
    return NextResponse.json({ error: "Could not update permissions." }, { status: 500 });
  }
}
