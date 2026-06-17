/**
 * Payments use-case (MVP).
 *
 * `checkout` simulates a Stripe Checkout transaction: it auto-confirms, records
 * the purchase (idempotently), and unlocks the article's full decrypted body
 * for the buyer. Real Stripe integration replaces `confirmPayment` in a later
 * sprint without changing this contract.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/users.service";

export class ArticleNotFoundError extends Error {
  constructor(public readonly articleId: string) {
    super(`Article not found: ${articleId}`);
    this.name = "ArticleNotFoundError";
  }
}

export interface CheckoutInput {
  articleId: string;
  /** Buyer identity: a handle (preferred) or a user UUID. */
  buyer: string;
}

export interface CheckoutResult {
  status: "confirmed";
  purchaseId: string;
  articleId: string;
  namespace: string | null;
  pricePaidUsd: number;
  /** The unlocked, decrypted premium payload. */
  content: string;
  alreadyOwned: boolean;
}

/** Simulated payment confirmation. Always succeeds in the MVP. */
function confirmPayment(amountUsd: number): { ok: true; reference: string } {
  return { ok: true, reference: `sim_${amountUsd.toFixed(2)}` };
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const supabase = getSupabaseAdmin();

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id, namespace, price_usd, body_encrypted")
    .eq("id", input.articleId)
    .maybeSingle();

  if (articleError) {
    throw new Error(`Checkout lookup failed: ${articleError.message}`);
  }
  if (!article) {
    throw new ArticleNotFoundError(input.articleId);
  }

  const buyerId = await resolveUserId(supabase, input.buyer, "buyer");

  confirmPayment(article.price_usd);

  // Idempotent: a repeat purchase by the same buyer returns the existing record.
  const { data: existing } = await supabase
    .from("purchases")
    .select("id")
    .eq("article_id", article.id)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  let purchaseId: string;
  let alreadyOwned = false;

  if (existing) {
    purchaseId = existing.id;
    alreadyOwned = true;
  } else {
    const { data: created, error: insertError } = await supabase
      .from("purchases")
      .insert({
        article_id: article.id,
        buyer_id: buyerId,
        amount_usd: article.price_usd,
        status: "confirmed",
      })
      .select("id")
      .single();
    if (insertError || !created) {
      throw new Error(
        `Failed to record purchase: ${insertError?.message ?? "no row returned"}`,
      );
    }
    purchaseId = created.id;
  }

  return {
    status: "confirmed",
    purchaseId,
    articleId: article.id,
    namespace: article.namespace,
    pricePaidUsd: article.price_usd,
    content: article.body_encrypted,
    alreadyOwned,
  };
}
