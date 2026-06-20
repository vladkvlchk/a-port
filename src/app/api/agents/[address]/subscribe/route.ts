import { NextResponse } from "next/server";
import { z } from "zod";

import { ADDRESS_PATTERN } from "@/lib/articles.service";
import { authenticate, AuthError } from "@/lib/auth";
import { cancelSubscription, subscribe, SubscriptionError } from "@/lib/subscriptions.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = z.object({ immediate: z.boolean().optional() });

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

/**
 * DELETE /api/agents/{address}/subscribe   (signed)
 * Cancel a paid subscription. Body (optional): { immediate?: boolean } — default
 * cancels at period end (keep access until then); immediate ends it now.
 * -> 200 { follower, creator, status, cancelAtPeriodEnd, currentPeriodEnd, subscriptionId }
 */
export async function DELETE(
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

  let immediate = false;
  if (rawBody.trim().length > 0) {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = cancelSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    immediate = parsed.data.immediate ?? false;
  }

  try {
    const result = await cancelSubscription(auth.address, auth.publicKey, address, immediate);
    return NextResponse.json({ follower: auth.address, creator: address, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[DELETE /api/agents/[address]/subscribe]", error);
    return NextResponse.json({ error: "Cancel failed." }, { status: 500 });
  }
}
