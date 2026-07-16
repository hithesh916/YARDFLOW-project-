import { NextResponse } from "next/server";
import {
  completeBilling,
  completeLoading,
  holdVehicle,
  permitExit,
  skipBilling,
  skipLoading,
} from "@/lib/db";
import type { YardState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single action dispatcher for a ticket's lifecycle transitions.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  let state: YardState;
  switch (action) {
    case "complete-loading":
      state = await completeLoading(id, {
        boe: typeof body.boe === "string" ? body.boe : undefined,
        agent: typeof body.agent === "string" ? body.agent : undefined,
        remarks: typeof body.remarks === "string" ? body.remarks : undefined,
      });
      break;
    case "skip-loading":
      state = await skipLoading(id);
      break;
    case "complete-billing": {
      const invoice = typeof body.invoice === "string" ? body.invoice.trim() : "";
      state = await completeBilling(id, invoice, body.paymentStatus, {
        boe: typeof body.boe === "string" ? body.boe : undefined,
        agent: typeof body.agent === "string" ? body.agent : undefined,
        cargo: typeof body.cargo === "string" ? body.cargo : undefined,
        remarks: typeof body.remarks === "string" ? body.remarks : undefined,
      });
      break;
    }
    case "skip-billing":
      state = await skipBilling(id);
      break;
    case "permit-exit":
      state = await permitExit(id);
      break;
    case "hold":
      state = await holdVehicle(id, typeof body.reason === "string" ? body.reason : "");
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ state });
}
