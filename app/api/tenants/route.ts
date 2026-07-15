import { NextResponse } from "next/server";
import { createTenant, extendTenantLicense, deleteTenant } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, name, domain, plan, seats, id, years } = body;

    let state;
    if (action === "create") {
      if (!name || !domain || !plan || !seats) {
        return NextResponse.json({ error: "Missing onboarding fields" }, { status: 400 });
      }
      state = await createTenant({ name, domain, plan, seats: Number(seats) });
    } else if (action === "extend") {
      if (!id || !years) {
        return NextResponse.json({ error: "Missing license extension fields" }, { status: 400 });
      }
      state = await extendTenantLicense(id, Number(years));
    } else if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Missing client ID" }, { status: 400 });
      }
      state = await deleteTenant(id);
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
