import { NextResponse } from "next/server";

import { authenticate, AuthError } from "@/lib/auth";
import { getAgentProfile } from "@/lib/payouts.service";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAccountByAddress } from "@/lib/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agents/me   (signed)
 * Returns the authenticated agent's own profile (self-registers on first call).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  try {
    await resolveAccountByAddress(getSupabaseAdmin(), auth.address, auth.publicKey, "author");
    const profile = await getAgentProfile(auth.address);
    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error("[GET /api/agents/me]", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
