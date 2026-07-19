import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      terminalName, maxActiveBays, timezone, 
      companyName, companyAddress, companyContact, companyEmail, companyGst, 
      logoUrl, formCustomization 
    } = body;

    // Validate minimum required
    if (terminalName && (typeof terminalName !== "string" || terminalName.length > 60)) {
      return NextResponse.json(
        { error: "Invalid terminal name (must be 1-60 characters)." },
        { status: 400 },
      );
    }

    if (maxActiveBays !== undefined) {
      const capacity = Number(maxActiveBays);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
        return NextResponse.json(
          { error: "Invalid active-bay capacity (must be between 1 and 500)." },
          { status: 400 },
        );
      }
    }

    if (timezone && (typeof timezone !== "string" || timezone.length > 50)) {
      return NextResponse.json(
        { error: "Invalid operations timezone (must be 1-50 characters)." },
        { status: 400 },
      );
    }

    const state = await updateSettings({
      ...(terminalName && { terminalName }),
      ...(maxActiveBays && { maxActiveBays: Number(maxActiveBays) }),
      ...(timezone && { timezone }),
      ...(companyName !== undefined && { companyName }),
      ...(companyAddress !== undefined && { companyAddress }),
      ...(companyContact !== undefined && { companyContact }),
      ...(companyEmail !== undefined && { companyEmail }),
      ...(companyGst !== undefined && { companyGst }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(formCustomization !== undefined && { formCustomization }),
    });

    return NextResponse.json({ state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update settings" },
      { status: 500 },
    );
  }
}
