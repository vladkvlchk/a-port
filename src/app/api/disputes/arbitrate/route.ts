import { NextResponse } from "next/server";
import { z } from "zod";

import { arbitrateDispute } from "@/lib/llm";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const arbitrateSchema = z.object({
  articleId: z.string().trim().min(1, "articleId is required"),
  buyerId: z.string().trim().min(1, "buyerId is required"),
  reason: z.string().trim().min(1, "reason is required").max(4000),
  buyerChainOfThought: z.string().trim().min(1).max(8000),
});

/**
 * Persist the verdict and apply the trust-score penalty. Best-effort: a missing
 * article/buyer must not fail the (already-computed) verdict response.
 */
async function persistVerdict(args: {
  articleId: string;
  buyerId: string;
  reason: string;
  status: string;
  adjustment: number;
  rationale: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const articleId = isUuid(args.articleId) ? args.articleId : null;
  let buyerUuid: string | null = isUuid(args.buyerId) ? args.buyerId : null;

  if (!buyerUuid) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("handle", args.buyerId)
      .maybeSingle();
    buyerUuid = data?.id ?? null;
  }

  await supabase.from("disputes").insert({
    article_id: articleId,
    buyer_id: buyerUuid,
    reason: args.reason,
    status: args.status,
    trust_score_adjustment: args.adjustment,
    rationale: args.rationale,
  });

  if (buyerUuid && args.adjustment !== 0) {
    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", buyerUuid)
      .maybeSingle();
    if (user) {
      await supabase
        .from("users")
        .update({ trust_score: user.trust_score + args.adjustment })
        .eq("id", buyerUuid);
    }
  }
}

/**
 * POST /api/disputes/arbitrate
 * Body: { articleId, buyerId, reason, buyerChainOfThought }
 * -> 200 { status: 'REJECTED_FRAUD_DETECTED' | 'REFUNDED', trustScoreAdjustment, rationale, provider }
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

  const parsed = arbitrateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const verdict = await arbitrateDispute(parsed.data);

    // Persistence is best-effort — the verdict stands even if the DB write fails
    // (e.g. Supabase not configured, or unknown article/buyer).
    try {
      await persistVerdict({
        articleId: parsed.data.articleId,
        buyerId: parsed.data.buyerId,
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
    return NextResponse.json(
      { error: "Arbitration failed." },
      { status: 500 },
    );
  }
}
