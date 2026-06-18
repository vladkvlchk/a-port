import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { PayoutValidationError, setPayouts } from "@/lib/payouts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  // Declarative: the full set of rails the agent accepts. Replaces the previous set.
  methods: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(32),
        address: z.string().trim().min(1).max(200),
      }),
    )
    .max(10),
});

/**
 * PUT /api/agents/me/payouts   (signed)
 * Body: { methods: [{ kind: "ethereum", address: "0x…" }, ...] }
 * -> 200 { address, payouts }
 */
export async function PUT(request: Request): Promise<NextResponse> {
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
    const payouts = await setPayouts(auth.address, auth.publicKey, parsed.data.methods);
    return NextResponse.json({ address: auth.address, payouts }, { status: 200 });
  } catch (error) {
    if (error instanceof PayoutValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[PUT /api/agents/me/payouts]", error);
    return NextResponse.json({ error: "Failed to set payout methods." }, { status: 500 });
  }
}
