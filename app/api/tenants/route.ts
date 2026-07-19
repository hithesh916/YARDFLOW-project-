import { NextResponse } from "next/server";
import { createTenant, extendTenantLicense, deleteTenant, updateTenantConfig } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, name, domain, plan, seats, id, years, modules, adminUsername, adminPassword } = body;

    let state;
    if (action === "create") {
      if (!name || !domain || !plan || !seats) {
        return NextResponse.json({ error: "Missing onboarding fields" }, { status: 400 });
      }
      state = await createTenant({ name, domain, plan, seats: Number(seats), modules: modules || [], adminUsername, adminPassword });
    } else if (action === "updateConfig") {
      if (!id || !seats) {
        return NextResponse.json({ error: "Missing config fields" }, { status: 400 });
      }
      state = await updateTenantConfig(id, Number(seats), modules || []);
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
