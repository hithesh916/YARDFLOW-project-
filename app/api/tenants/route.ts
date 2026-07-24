import { NextResponse } from "next/server";
import { createTenant, extendTenantLicense, deleteTenant, updateTenantConfig, setTenantLicense, isActionError } from "@/lib/db";
import { requireSuperadmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = requireSuperadmin(req);
    if (s instanceof NextResponse) return s;
    const body = await req.json();
    const { action, name, domain, plan, seats, id, years, modules, adminUsername, adminPassword, expiryDate, status } = body;

    // Coerce + bound an integer field; returns null when invalid.
    const intInRange = (v: unknown, min: number, max: number): number | null => {
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };

    let state;
    if (action === "create") {
      if (!name || !plan || !seats) {
        return NextResponse.json({ error: "Missing onboarding fields" }, { status: 400 });
      }
      const seatCount = intInRange(seats, 1, 100000);
      if (seatCount === null) {
        return NextResponse.json({ error: "Seats must be a whole number between 1 and 100000." }, { status: 400 });
      }
      state = await createTenant({ name, domain: domain || "", plan, seats: seatCount, modules: modules || [], adminUsername, adminPassword });
    } else if (action === "updateConfig") {
      if (!id || !seats) {
        return NextResponse.json({ error: "Missing config fields" }, { status: 400 });
      }
      const seatCount = intInRange(seats, 1, 100000);
      if (seatCount === null) {
        return NextResponse.json({ error: "Seats must be a whole number between 1 and 100000." }, { status: 400 });
      }
      state = await updateTenantConfig(id, seatCount, modules || []);
    } else if (action === "setLicense") {
      if (!id || !expiryDate || !status) {
        return NextResponse.json({ error: "Missing license fields" }, { status: 400 });
      }
      state = await setTenantLicense(id, expiryDate, status);
    } else if (action === "extend") {
      if (!id || !years) {
        return NextResponse.json({ error: "Missing license extension fields" }, { status: 400 });
      }
      const yearCount = intInRange(years, 1, 100);
      if (yearCount === null) {
        return NextResponse.json({ error: "Years must be a whole number between 1 and 100." }, { status: 400 });
      }
      state = await extendTenantLicense(id, yearCount);
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
    if (isActionError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("tenant action failed:", err);
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}
