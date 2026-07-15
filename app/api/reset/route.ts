import { NextResponse } from "next/server";
import { reset } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const state = await reset();
  return NextResponse.json({ state });
}
