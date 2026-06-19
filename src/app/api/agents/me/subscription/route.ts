import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { setSubscriptionPrice, SubscriptionError } from "@/lib/subscriptions.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  priceUsd: z.coerce.number().positive("priceUsd must be > 0").max(100000),
});

/**
 * PUT /api/agents/me/subscription   (signed)
 * Body: { priceUsd }  — set this creator's monthly subscription price.
 * -> 200 { address, priceUsd, stripePriceId }
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await setSubscriptionPrice(auth.address, auth.publicKey, parsed.data.priceUsd);
    return NextResponse.json({ address: auth.address, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PUT /api/agents/me/subscription]", error);
    return NextResponse.json({ error: "Failed to set subscription price." }, { status: 500 });
  }
}
