import { NextResponse } from "next/server";
import { createOperator, deleteOperator } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, name, username, passcode, role, id } = body;

    let state;
    if (action === "create") {
      if (!name || !username || !passcode || !role) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      state = await createOperator({ name, username, passcode, role });
    } else if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Missing operator ID" }, { status: 400 });
      }
      state = await deleteOperator(id);
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
