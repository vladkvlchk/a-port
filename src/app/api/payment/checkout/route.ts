import { NextResponse } from "next/server";
import { z } from "zod";

import { ArticleNotFoundError, checkout } from "@/lib/payments.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  // Accept both `articleId` and `id` for ergonomics with the CLI `buy --id`.
  articleId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  // Buyer identity: a handle (preferred) or a user UUID. Defaults to a demo agent.
  buyer: z.string().trim().min(1).max(120).optional(),
  buyerId: z.string().trim().min(1).max(120).optional(),
});

/**
 * POST /api/payment/checkout
 * Body: { articleId | id, buyer? | buyerId? }
 * Simulates Stripe Checkout: confirms, flags the article purchased for the
 * buyer, and returns the full decrypted body.
 * -> 200 { status, purchaseId, articleId, namespace, pricePaidUsd, content, alreadyOwned }
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "articleId (or id) is required." },
      { status: 400 },
    );
  }
  const buyer = parsed.data.buyer ?? parsed.data.buyerId ?? "cli_agent";

  try {
    const result = await checkout({ articleId, buyer });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[POST /api/payment/checkout]", error);
    return NextResponse.json(
      { error: "Checkout failed." },
      { status: 500 },
    );
  }
}
