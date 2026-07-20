import { NextResponse } from "next/server";
import { createTicket } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const tenantId = req.headers.get("x-tenant-id") ?? undefined;
  const body = await req.json().catch(() => ({}));
  const vehicle = typeof body.vehicle === "string" ? body.vehicle.trim() : "";
  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle number is required." },
      { status: 400 },
    );
  }
  const { state, ticket } = await createTicket({
    vehicle,
    boe: body.boe || body.job,
    agent: body.agent,
    cargo: body.cargo,
    remarks: body.remarks,
    createdSource: body.createdSource,
  }, tenantId);
  return NextResponse.json({ state, ticket });
}
