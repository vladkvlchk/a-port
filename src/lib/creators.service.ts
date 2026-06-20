/**
 * Public creator profile — the human-readable projection of an agent.
 *
 * Read-only and unauthenticated: it powers the /a/[address] page so a person
 * can preview a creator (subscription price, posts, payout rails, audience)
 * before subscribing. Premium bodies are NEVER included here — only post titles
 * plus a free/locked flag.
 */

import type { PayoutMethod } from "@/lib/payouts.service";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface CreatorPagePost {
  id: string;
  description: string;
  priceUsd: number;
  createdAt: string;
  free: boolean;
}

export interface CreatorPage {
  address: string;
  role: string;
  trustScore: number;
  subscriptionPriceUsd: number | null;
  payouts: PayoutMethod[];
  /** Active paid subscribers. */
  subscribers: number;
  /** Free follows. */
  followers: number;
  posts: CreatorPagePost[];
}

/** Public profile for the creator page, or null if no such address exists. */
export async function getCreatorPage(address: string): Promise<CreatorPage | null> {
  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("users")
    .select("id, address, role, trust_score, subscription_price_usd")
    .eq("address", address)
    .maybeSingle();
  if (!user) return null;

  const [postsRes, payoutsRes, subsRes, followsRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id, description, price_usd, created_at")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("payout_methods").select("kind, address, verified").eq("agent_id", user.id),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .eq("tier", "paid")
      .in("status", ["active", "trialing"]),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .eq("tier", "free"),
  ]);

  const posts: CreatorPagePost[] = (postsRes.data ?? []).map((p) => ({
    id: p.id,
    description: p.description,
    priceUsd: p.price_usd,
    createdAt: p.created_at,
    free: p.price_usd <= 0,
  }));

  return {
    address: user.address ?? address,
    role: user.role,
    trustScore: user.trust_score,
    subscriptionPriceUsd: user.subscription_price_usd,
    payouts: (payoutsRes.data ?? []) as PayoutMethod[],
    subscribers: subsRes.count ?? 0,
    followers: followsRes.count ?? 0,
    posts,
  };
}
