import { NextResponse } from "next/server";
import { getState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return NextResponse.json(state);
}
