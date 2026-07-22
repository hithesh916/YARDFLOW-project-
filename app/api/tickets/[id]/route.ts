import { NextResponse } from "next/server";
import {
  completeBilling,
  completeLoading,
  holdVehicle,
  isActionError,
  permitExit,
  releaseHold,
  skipBilling,
  skipLoading,
  updateEntryForBillingTicket,
} from "@/lib/db";
import type { YardState } from "@/lib/types";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single action dispatcher for a ticket's lifecycle transitions.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = requireAuth(req);
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const tenantId = s.tenantId ?? undefined;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // Whitelist paymentStatus so a missing/garbage value can't silently become "Paid"
  // on a printed token (only "Paid"/"Not Paid" are valid; default to Not Paid).
  const paymentStatus: "Paid" | "Not Paid" =
    body.paymentStatus === "Paid" ? "Paid" : "Not Paid";

  try {
    let state: YardState;
    switch (action) {
      case "update-entry": {
        const vehicle = typeof body.vehicle === "string" ? body.vehicle.trim() : "";
        if (!vehicle) {
          return NextResponse.json({ error: "Vehicle number is required." }, { status: 400 });
        }
        state = await updateEntryForBillingTicket(id, {
          vehicle: vehicle.slice(0, 40),
          agent: typeof body.agent === "string" ? body.agent.slice(0, 120) : undefined,
          remarks: typeof body.remarks === "string" ? body.remarks.slice(0, 500) : undefined,
          driverContact: typeof body.driverContact === "string" ? body.driverContact.slice(0, 20) : undefined,
          driverDl: typeof body.driverDl === "string" ? body.driverDl.slice(0, 30) : undefined,
        }, tenantId);
        break;
      }
      case "complete-loading":
        state = await completeLoading(id, {
          boe: typeof body.boe === "string" ? body.boe.slice(0, 60) : undefined,
          workOrder: typeof body.workOrder === "string" ? body.workOrder.slice(0, 60) : undefined,
          agent: typeof body.agent === "string" ? body.agent.slice(0, 120) : undefined,
          remarks: typeof body.remarks === "string" ? body.remarks.slice(0, 500) : undefined,
          gateToken: typeof body.gateToken === "string" ? body.gateToken.slice(0, 60) : undefined,
          billingToken: typeof body.billingToken === "string" ? body.billingToken.slice(0, 60) : undefined,
        }, tenantId);
        break;
      case "skip-loading":
        state = await skipLoading(id, tenantId);
        break;
      case "complete-billing": {
        const invoice = typeof body.invoice === "string" ? body.invoice.trim().slice(0, 60) : "";
        state = await completeBilling(id, invoice, paymentStatus, {
          boe: typeof body.boe === "string" ? body.boe.slice(0, 60) : undefined,
          agent: typeof body.agent === "string" ? body.agent.slice(0, 120) : undefined,
          cargo: typeof body.cargo === "string" ? body.cargo.slice(0, 120) : undefined,
          remarks: typeof body.remarks === "string" ? body.remarks.slice(0, 500) : undefined,
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
        state = await holdVehicle(id, typeof body.reason === "string" ? body.reason.slice(0, 500) : "", tenantId);
        break;
      case "release-hold":
        state = await releaseHold(id, tenantId);
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json({ state });
  } catch (err) {
    // A failed precondition (wrong status / missing ticket) is an expected 4xx with a
    // human-readable reason. Anything else is logged server-side and returned generic.
    if (isActionError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(`ticket action "${action}" failed:`, err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
