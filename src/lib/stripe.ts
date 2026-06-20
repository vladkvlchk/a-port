/**
 * Stripe client (server-side, lazy). Uses the official SDK.
 * Requires STRIPE_SECRET_KEY (use a test key, sk_test_…, for the demo).
 */

import Stripe from "stripe";

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY (use a test key sk_test_… for the demo).");
  }
  cached = new Stripe(key);
  return cached;
}

/** Whether the webhook signing secret is set (STRIPE_WEBHOOK_SECRET, whsec_…). */
export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET (from the Stripe Dashboard webhook or `stripe listen`).");
  }
  return secret;
}
