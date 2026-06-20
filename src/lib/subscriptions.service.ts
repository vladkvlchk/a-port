/**
 * Subscriptions (OnlyFans-style): free follow + paid recurring (Stripe).
 *
 * - A creator sets a monthly subscription price → we create a Stripe
 *   Product + recurring Price and store them on the creator.
 * - A fan can `follow` (free) or `subscribe` (paid) a creator. A paid
 *   subscription creates a real Stripe Customer + Subscription (test card in
 *   test mode) and records its status.
 * - `hasAccess` gates a creator's premium posts.
 *
 * Money currently settles on the platform Stripe account; creator payout via
 * Stripe Connect / on-chain is a later layer (see docs/PAYMENTS.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAccountByAddress } from "@/lib/users.service";
import type { Database } from "@/types/database.types";

export class SubscriptionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SubscriptionError";
  }
}

/** A Stripe Subscription, structurally — only the fields we mirror locally. */
type StripeSubscriptionLike = {
  id: string;
  status: string;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] };
};

/**
 * current_period_end moved from the subscription to its item in recent Stripe
 * API versions; read whichever is present and return an ISO timestamp.
 */
function periodEndIso(sub: StripeSubscriptionLike): string | null {
  const cpe = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return cpe ? new Date(cpe * 1000).toISOString() : null;
}

async function creatorByAddress(
  supabase: SupabaseClient<Database>,
  address: string,
): Promise<{ id: string; stripe_product_id: string | null; stripe_price_id: string | null; subscription_price_usd: number | null }> {
  const { data } = await supabase
    .from("users")
    .select("id, stripe_product_id, stripe_price_id, subscription_price_usd")
    .eq("address", address)
    .maybeSingle();
  if (!data) throw new SubscriptionError(`creator ${address} not found`, 404);
  return data;
}

/** Creator sets/updates their monthly subscription price. */
export async function setSubscriptionPrice(
  address: string,
  publicKey: string,
  priceUsd: number,
): Promise<{ priceUsd: number; stripePriceId: string }> {
  if (!stripeConfigured()) throw new SubscriptionError("Stripe is not configured", 503);
  const supabase = getSupabaseAdmin();
  const creatorId = await resolveAccountByAddress(supabase, address, publicKey, "author");

  const { data: creator } = await supabase
    .from("users")
    .select("stripe_product_id")
    .eq("id", creatorId)
    .single();

  const stripe = getStripe();
  let productId = creator?.stripe_product_id ?? null;
  if (!productId) {
    const product = await stripe.products.create({
      name: `A-port creator ${address}`,
      metadata: { address },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: Math.round(priceUsd * 100),
    currency: "usd",
    recurring: { interval: "month" },
  });

  await supabase
    .from("users")
    .update({
      subscription_price_usd: priceUsd,
      stripe_product_id: productId,
      stripe_price_id: price.id,
    })
    .eq("id", creatorId);

  return { priceUsd, stripePriceId: price.id };
}

/** Free follow. */
export async function follow(
  followerAddress: string,
  followerPublicKey: string,
  creatorAddress: string,
): Promise<{ tier: "free"; status: "active" }> {
  const supabase = getSupabaseAdmin();
  const followerId = await resolveAccountByAddress(supabase, followerAddress, followerPublicKey, "buyer");
  const creator = await creatorByAddress(supabase, creatorAddress);
  if (followerId === creator.id) throw new SubscriptionError("cannot follow yourself");

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      { follower_id: followerId, creator_id: creator.id, tier: "free", status: "active" },
      { onConflict: "follower_id,creator_id" },
    );
  if (error) throw new SubscriptionError(`follow failed: ${error.message}`, 500);
  return { tier: "free", status: "active" };
}

export interface PaidSubscriptionResult {
  tier: "paid";
  status: string;
  currentPeriodEnd: string | null;
  subscriptionId: string;
  priceUsd: number | null;
}

/** Paid subscription via Stripe recurring. */
export async function subscribe(
  followerAddress: string,
  followerPublicKey: string,
  creatorAddress: string,
): Promise<PaidSubscriptionResult> {
  if (!stripeConfigured()) throw new SubscriptionError("Stripe is not configured", 503);
  const supabase = getSupabaseAdmin();
  const followerId = await resolveAccountByAddress(supabase, followerAddress, followerPublicKey, "buyer");
  const creator = await creatorByAddress(supabase, creatorAddress);
  if (followerId === creator.id) throw new SubscriptionError("cannot subscribe to yourself");
  if (!creator.stripe_price_id) {
    throw new SubscriptionError("creator has no subscription price set", 409);
  }

  const stripe = getStripe();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("follower_id", followerId)
    .eq("creator_id", creator.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { address: followerAddress } });
    customerId = customer.id;
    // Test mode: attach Stripe's shared test card so the first invoice succeeds.
    // In production the buyer's payment method comes from the Hermes Stripe skill.
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
  }

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: creator.stripe_price_id }],
  });

  const currentPeriodEnd = periodEndIso(sub as unknown as StripeSubscriptionLike);

  const { error } = await supabase.from("subscriptions").upsert(
    {
      follower_id: followerId,
      creator_id: creator.id,
      tier: "paid",
      status: sub.status,
      current_period_end: currentPeriodEnd,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
    },
    { onConflict: "follower_id,creator_id" },
  );
  if (error) throw new SubscriptionError(`failed to record subscription: ${error.message}`, 500);

  return {
    tier: "paid",
    status: sub.status,
    currentPeriodEnd,
    subscriptionId: sub.id,
    priceUsd: creator.subscription_price_usd,
  };
}

/** Does `followerId` have access to `creatorId`'s premium content? */
export async function hasActiveSubscription(
  supabase: SupabaseClient<Database>,
  followerId: string,
  creatorId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("follower_id", followerId)
    .eq("creator_id", creatorId)
    .eq("tier", "paid")
    .maybeSingle();
  if (!data) return false;
  if (data.status !== "active" && data.status !== "trialing") return false;
  if (data.current_period_end && new Date(data.current_period_end).getTime() < Date.now()) {
    return false;
  }
  return true;
}

export interface SubscriptionSyncResult {
  matched: boolean;
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * Mirror a Stripe Subscription's status + billing period onto our row, keyed by
 * stripe_subscription_id. Driven by webhook events (renewal, cancellation,
 * payment failure) so the feed gate reflects Stripe without us polling.
 * No-op (matched: false) when we have no local row for that subscription.
 */
export async function syncSubscriptionFromStripe(
  sub: StripeSubscriptionLike,
): Promise<SubscriptionSyncResult> {
  const supabase = getSupabaseAdmin();
  const currentPeriodEnd = periodEndIso(sub);

  const update: Database["public"]["Tables"]["subscriptions"]["Update"] = { status: sub.status };
  // Keep a known good period if Stripe omits it on this particular event.
  if (currentPeriodEnd) update.current_period_end = currentPeriodEnd;

  const { data, error } = await supabase
    .from("subscriptions")
    .update(update)
    .eq("stripe_subscription_id", sub.id)
    .select("id")
    .maybeSingle();
  if (error) throw new SubscriptionError(`subscription sync failed: ${error.message}`, 500);

  return { matched: Boolean(data), status: sub.status, currentPeriodEnd };
}
