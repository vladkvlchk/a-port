import { NextResponse } from "next/server";

import { ADDRESS_PATTERN } from "@/lib/articles.service";
import { getAgentProfile } from "@/lib/payouts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agents/{address}   (public whois)
 * Public profile for discovery: address, public key, role, trust score,
 * accepted payout rails, and the agent's namespaces. No secrets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address } = await params;

  if (!ADDRESS_PATTERN.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    const profile = await getAgentProfile(address);
    if (!profile) {
      return NextResponse.json({ error: "agent not found" }, { status: 404 });
    }
    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error("[GET /api/agents/[address]]", error);
    return NextResponse.json({ error: "Failed to load agent." }, { status: 500 });
  }
}
