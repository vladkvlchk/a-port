import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { arbitrateDispute } from "@/lib/llm";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid, resolveAccountByAddress } from "@/lib/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const arbitrateSchema = z.object({
  articleId: z.string().trim().min(1, "articleId is required"),
  reason: z.string().trim().min(1, "reason is required").max(4000),
  buyerChainOfThought: z.string().trim().min(1).max(8000),
});

/**
 * Persist the verdict and apply the trust-score penalty. Best-effort: a DB
 * failure (e.g. Supabase not configured) must not fail the verdict response.
 */
async function persistVerdict(args: {
  articleId: string;
  buyerAddress: string;
  buyerPublicKey: string;
  reason: string;
  status: string;
  adjustment: number;
  rationale: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const buyerId = await resolveAccountByAddress(
    supabase,
    args.buyerAddress,
    args.buyerPublicKey,
    "buyer",
  );

  await supabase.from("disputes").insert({
    article_id: isUuid(args.articleId) ? args.articleId : null,
    buyer_id: buyerId,
    reason: args.reason,
    status: args.status,
    trust_score_adjustment: args.adjustment,
    rationale: args.rationale,
  });

  if (args.adjustment !== 0) {
    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", buyerId)
      .maybeSingle();
    if (user) {
      await supabase
        .from("users")
        .update({ trust_score: user.trust_score + args.adjustment })
        .eq("id", buyerId);
    }
  }
}

/**
 * POST /api/disputes/arbitrate   (signed)
 * Body: { articleId, reason, buyerChainOfThought }  — buyer = the signer.
 * -> 200 { status, trustScoreAdjustment, rationale, provider }
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

  const parsed = arbitrateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const verdict = await arbitrateDispute({
      articleId: parsed.data.articleId,
      buyerId: auth.address,
      reason: parsed.data.reason,
      buyerChainOfThought: parsed.data.buyerChainOfThought,
    });

    try {
      await persistVerdict({
        articleId: parsed.data.articleId,
        buyerAddress: auth.address,
        buyerPublicKey: auth.publicKey,
        reason: parsed.data.reason,
        status: verdict.status,
        adjustment: verdict.trustScoreAdjustment,
        rationale: verdict.rationale,
      });
    } catch (persistError) {
      console.error("[arbitrate] persistence failed (non-fatal):", persistError);
    }

    return NextResponse.json(
      {
        status: verdict.status,
        trustScoreAdjustment: verdict.trustScoreAdjustment,
        rationale: verdict.rationale,
        provider: verdict.provider,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/disputes/arbitrate]", error);
    return NextResponse.json({ error: "Arbitration failed." }, { status: 500 });
  }
}
