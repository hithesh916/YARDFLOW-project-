import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Return the current identity for the verified session, rebuilt from the DB so
// role/permission/tenant changes take effect without re-login. 401 if no valid
// session cookie is present.
export async function GET(req: Request) {
  const session = readSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const identity = await getIdentity(session.username);
  if (!identity) {
    // Account was removed since the cookie was issued.
    return NextResponse.json({ error: "Account no longer exists." }, { status: 401 });
  }
  return NextResponse.json({ user: identity });
}
