import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { ArticleNotFoundError, checkout } from "@/lib/payments.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  // Accept both `articleId` and `id` for ergonomics with the CLI `buy --id`.
  articleId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

/**
 * POST /api/payment/checkout   (signed)
 * Body: { articleId | id }   — buyer identity comes from the signature.
 * Simulates Stripe Checkout: confirms, flags purchased for the buyer, and
 * returns the full decrypted body.
 * -> 200 { status, purchaseId, articleId, namespace, pricePaidUsd, content, alreadyOwned }
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = checkoutSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const articleId = parsed.data.articleId ?? parsed.data.id;
  if (!articleId) {
    return NextResponse.json({ error: "articleId (or id) is required." }, { status: 400 });
  }

  try {
    const result = await checkout({
      articleId,
      address: auth.address,
      publicKey: auth.publicKey,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[POST /api/payment/checkout]", error);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
