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
