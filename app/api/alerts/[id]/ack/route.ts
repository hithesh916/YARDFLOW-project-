import { NextResponse } from "next/server";
import { ackAlert } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenantId = req.headers.get("x-tenant-id") ?? undefined;
  const state = await ackAlert(Number(id), tenantId);
  return NextResponse.json({ state });
}
