import { NextResponse } from "next/server";
import { ackAlert } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) {
    return NextResponse.json({ error: "Invalid alert id." }, { status: 400 });
  }
  try {
    const state = await ackAlert(alertId, s.tenantId ?? undefined);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("ackAlert failed:", err);
    return NextResponse.json({ error: "Could not acknowledge the alert." }, { status: 500 });
  }
}
