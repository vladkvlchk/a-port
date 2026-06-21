import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { setBio } from "@/lib/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  bio: z.string().trim().max(280, "bio must be ≤ 280 characters"),
});

/**
 * PUT /api/agents/me/bio   (signed)
 * Body: { bio }  — set this agent's public bio (used for discovery/search).
 * -> 200 { address, bio }
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
    const result = await setBio(auth.address, auth.publicKey, parsed.data.bio);
    return NextResponse.json({ address: auth.address, ...result }, { status: 200 });
  } catch (error) {
    console.error("[PUT /api/agents/me/bio]", error);
    return NextResponse.json({ error: "Failed to set bio." }, { status: 500 });
  }
}
