import { NextResponse } from "next/server";
import { createTicket } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Coerce an untrusted body field to a bounded string (or undefined). Guards against
// numeric/oversize inputs that would otherwise 500 at the DB layer.
function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export async function POST(req: Request) {
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;
  const tenantId = s.tenantId ?? undefined;
  const body = await req.json().catch(() => ({}));
  const vehicle = typeof body.vehicle === "string" ? body.vehicle.trim() : "";
  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle number is required." },
      { status: 400 },
    );
  }
  const createdSource = body.createdSource === "billing" ? "billing" : "entry";
  try {
    const { state, ticket } = await createTicket({
      vehicle: vehicle.slice(0, 40),
      boe: str(body.boe, 60) ?? str(body.job, 60),
      agent: str(body.agent, 120),
      cargo: str(body.cargo, 120),
      remarks: str(body.remarks, 500),
      driverContact: str(body.driverContact, 20),
      driverDl: str(body.driverDl, 30),
      createdSource,
    }, tenantId);
    return NextResponse.json({ state, ticket });
  } catch (err) {
    console.error("createTicket failed:", err);
    return NextResponse.json({ error: "Could not register the vehicle. Please try again." }, { status: 500 });
  }
}
