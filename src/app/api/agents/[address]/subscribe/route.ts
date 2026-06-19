import { NextResponse } from "next/server";

import { ADDRESS_PATTERN } from "@/lib/articles.service";
import { authenticate, AuthError } from "@/lib/auth";
import { subscribe, SubscriptionError } from "@/lib/subscriptions.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/{address}/subscribe   (signed)
 * Paid recurring subscription to a creator (Stripe). The creator must have a
 * subscription price set.
 * -> 200 { follower, creator, tier:'paid', status, currentPeriodEnd, subscriptionId, priceUsd }
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
    const result = await subscribe(auth.address, auth.publicKey, address);
    return NextResponse.json({ follower: auth.address, creator: address, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/agents/[address]/subscribe]", error);
    return NextResponse.json({ error: "Subscribe failed." }, { status: 500 });
  }
}
