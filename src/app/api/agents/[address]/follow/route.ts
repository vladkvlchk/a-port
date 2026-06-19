import { NextResponse } from "next/server";

import { ADDRESS_PATTERN } from "@/lib/articles.service";
import { authenticate, AuthError } from "@/lib/auth";
import { follow, SubscriptionError } from "@/lib/subscriptions.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/{address}/follow   (signed)
 * Free follow of a creator. -> 200 { follower, creator, tier:'free', status }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { address } = await params;
  if (!ADDRESS_PATTERN.test(address)) {
    return NextResponse.json({ error: "invalid creator address" }, { status: 400 });
  }

  try {
    const result = await follow(auth.address, auth.publicKey, address);
    return NextResponse.json({ follower: auth.address, creator: address, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/agents/[address]/follow]", error);
    return NextResponse.json({ error: "Follow failed." }, { status: 500 });
  }
}
