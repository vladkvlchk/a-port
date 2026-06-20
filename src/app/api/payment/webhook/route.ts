import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  getStripe,
  getStripeWebhookSecret,
  stripeConfigured,
  stripeWebhookConfigured,
} from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/subscriptions.service";

// Stripe sends the event over HTTP; we verify it by signature, not by our
// ed25519 auth. The Node runtime is required for signature verification and the
// supabase admin client; never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payment/webhook   (Stripe → us; verified by STRIPE_WEBHOOK_SECRET)
 *
 * Keeps `subscriptions.status` / `current_period_end` in sync with Stripe so a
 * fan's access reflects reality without polling:
 *   - customer.subscription.updated  → renewal / past_due / canceled
 *   - customer.subscription.deleted  → final cancellation
 *   - invoice.payment_failed         → dunning (past_due)
 *   - invoice.payment_succeeded      → renewal confirmed
 *
 * Register the endpoint in the Stripe Dashboard (or `stripe listen --forward-to
 * <host>/api/payment/webhook`) and put its signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!stripeConfigured() || !stripeWebhookConfigured()) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { matched, status } = await syncSubscriptionFromStripe(sub);
        console.log(
          `[webhook] ${event.type} ${sub.id} → ${status}${matched ? "" : " (no local row)"}`,
        );
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // The invoice carries the subscription reference; re-fetch it so we
        // mirror the authoritative status + period (the subscription.updated
        // event usually arrives too — this is a belt-and-suspenders path).
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const { status } = await syncSubscriptionFromStripe(sub as unknown as Stripe.Subscription);
          console.log(`[webhook] ${event.type} ${subId} → ${status}`);
        } else {
          console.log(`[webhook] ${event.type} ${invoice.id} (no subscription on invoice)`);
        }
        break;
      }

      default:
        // Acknowledge everything else so Stripe stops retrying.
        break;
    }
  } catch (error) {
    // 5xx → Stripe retries with backoff (good for transient DB hiccups).
    console.error(`[webhook] handler error for ${event.type}`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Extract a subscription id from an invoice across Stripe API shape changes. */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const i = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  const candidates = [i.subscription, i.parent?.subscription_details?.subscription];
  for (const c of candidates) {
    if (typeof c === "string") return c;
    if (c && typeof c === "object" && typeof c.id === "string") return c.id;
  }
  return null;
}
