import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = requireAdmin(req);
    if (s instanceof NextResponse) return s;
    const tenantId = s.tenantId ?? undefined;
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

    // Bound the free-text company/profile fields so a huge or non-string value can't
    // land in the DB (or the printed token). logoUrl is separately scheme-allowlisted
    // at print time; here we just cap its length.
    const textFields: Array<[string, unknown, number]> = [
      ["companyName", companyName, 120],
      ["companyContact", companyContact, 60],
      ["companyEmail", companyEmail, 120],
      ["companyGst", companyGst, 30],
      ["companyAddress", companyAddress, 500],
      ["logoUrl", logoUrl, 300000], // data: URIs can be large
    ];
    for (const [label, val, max] of textFields) {
      if (val !== undefined && val !== null && (typeof val !== "string" || val.length > max)) {
        return NextResponse.json(
          { error: `Invalid ${label} (must be text up to ${max} characters).` },
          { status: 400 },
        );
      }
    }
    if (formCustomization !== undefined && formCustomization !== null && typeof formCustomization !== "object") {
      return NextResponse.json({ error: "Invalid form customization." }, { status: 400 });
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
    }, tenantId);

    return NextResponse.json({ state });
  } catch (e) {
    // Log the real error server-side; return a generic message so Prisma/internal
    // details never reach the client (matches the other routes).
    console.error("updateSettings failed:", e);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}
