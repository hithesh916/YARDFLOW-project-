import { NextResponse } from "next/server";
import { ackAlert } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const state = await ackAlert(Number(id));
  return NextResponse.json({ state });
}
