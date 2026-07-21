import { NextResponse } from "next/server";
import { createOperator, deleteOperator, changeOperatorPassword } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isAdmin, isSuperadmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = requireAuth(req);
    if (s instanceof NextResponse) return s;
    const callerTenant = s.tenantId ?? undefined;
    const body = await req.json();
    const { action, name, username, passcode, role, id, tenantId, currentPasscode } = body;

    let state;
    if (action === "create") {
      // Managing operators is an admin/superadmin action.
      if (!isAdmin(s)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      if (!name || !username || !passcode || !role) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      // Non-superadmins can only create within their OWN tenant — a body-supplied
      // tenantId is ignored so an admin can't plant accounts in another company.
      const targetTenant = isSuperadmin(s) ? (tenantId ?? callerTenant) : callerTenant;
      state = await createOperator({ name, username, passcode, role, tenantId: targetTenant });
    } else if (action === "delete") {
      if (!isAdmin(s)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      if (!id) {
        return NextResponse.json({ error: "Missing operator ID" }, { status: 400 });
      }
      state = await deleteOperator(id, { role: s.role, tenantId: s.tenantId });
    } else if (action === "change-password") {
      // Any authenticated caller may attempt this; db.ts enforces that they can
      // only change their own password (or, as admin/superadmin, one in their
      // tenant). The target username comes from the body, the CALLER from the
      // verified session.
      if (!username || !passcode) {
        return NextResponse.json({ error: "Missing username or passcode" }, { status: 400 });
      }
      state = await changeOperatorPassword(
        username,
        passcode,
        { username: s.username, role: s.role, tenantId: s.tenantId },
        typeof currentPasscode === "string" ? currentPasscode : undefined,
      );
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    // Authorization / bad-input failures are the caller's fault, not a server
    // error — return 403 so clients (and logs) don't misread them as 500s.
    const status = /not authorized|incorrect/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
