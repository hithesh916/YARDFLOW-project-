import { NextResponse } from "next/server";
import { createOperator, deleteOperator, changeOperatorPassword } from "@/lib/db";

export async function POST(req: Request) {
  try {
    // Caller's workspace, used to scope the returned snapshot + audit trail for
    // delete/change-password. For "create", the target tenant comes from the body.
    const callerTenant = req.headers.get("x-tenant-id") ?? undefined;
    const body = await req.json();
    const { action, name, username, passcode, role, id, tenantId } = body;

    let state;
    if (action === "create") {
      if (!name || !username || !passcode || !role) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      state = await createOperator({ name, username, passcode, role, tenantId: tenantId ?? callerTenant });
    } else if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Missing operator ID" }, { status: 400 });
      }
      state = await deleteOperator(id, callerTenant);
    } else if (action === "change-password") {
      if (!username || !passcode) {
        return NextResponse.json({ error: "Missing username or passcode" }, { status: 400 });
      }
      state = await changeOperatorPassword(username, passcode, callerTenant);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
