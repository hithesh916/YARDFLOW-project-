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
  const state = await ackAlert(Number(id), s.tenantId ?? undefined);
  return NextResponse.json({ state });
}
