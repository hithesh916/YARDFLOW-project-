import { NextResponse } from "next/server";
import {
  completeBilling,
  completeLoading,
  holdVehicle,
  permitExit,
  skipBilling,
  skipLoading,
  updateEntryForBillingTicket,
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
  const tenantId = req.headers.get("x-tenant-id") ?? undefined;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  let state: YardState;
  switch (action) {
    case "update-entry":
      state = await updateEntryForBillingTicket(id, {
        vehicle: typeof body.vehicle === "string" ? body.vehicle : "",
        agent: typeof body.agent === "string" ? body.agent : undefined,
        remarks: typeof body.remarks === "string" ? body.remarks : undefined,
      }, tenantId);
      break;
    case "complete-loading":
      state = await completeLoading(id, {
        boe: typeof body.boe === "string" ? body.boe : undefined,
        workOrder: typeof body.workOrder === "string" ? body.workOrder : undefined,
        agent: typeof body.agent === "string" ? body.agent : undefined,
        remarks: typeof body.remarks === "string" ? body.remarks : undefined,
        gateToken: typeof body.gateToken === "string" ? body.gateToken : undefined,
        billingToken: typeof body.billingToken === "string" ? body.billingToken : undefined,
      }, tenantId);
      break;
    case "skip-loading":
      state = await skipLoading(id, tenantId);
      break;
    case "complete-billing": {
      const invoice = typeof body.invoice === "string" ? body.invoice.trim() : "";
      state = await completeBilling(id, invoice, body.paymentStatus, {
        boe: typeof body.boe === "string" ? body.boe : undefined,
        agent: typeof body.agent === "string" ? body.agent : undefined,
        cargo: typeof body.cargo === "string" ? body.cargo : undefined,
        remarks: typeof body.remarks === "string" ? body.remarks : undefined,
      }, tenantId);
      break;
    }
    case "skip-billing":
      state = await skipBilling(id, tenantId);
      break;
    case "permit-exit":
      state = await permitExit(id, tenantId);
      break;
    case "hold":
      state = await holdVehicle(id, typeof body.reason === "string" ? body.reason : "", tenantId);
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ state });
}
