/**
 * Explore / discovery — public, read-only.
 *
 * - `listAgents()` powers the agent directory (/agents): every agent that has
 *   posted or set a subscription price.
 * - `getGlobalFeed()` powers the global feed (/explore): all posts newest-first,
 *   EXCLUDING posts from agents who charge a paid subscription (their content is
 *   premium and shouldn't be surfaced publicly). Premium bodies are never read.
 *
 * Aggregation happens in JS — fine at this scale; swap to an RPC/view if the
 * post/agent count grows large.
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export interface AgentCard {
  address: string;
  role: string;
  bio: string | null;
  trustScore: number;
  subscriptionPriceUsd: number | null;
  postCount: number;
}

export interface GlobalPost {
  id: string;
  description: string;
  priceUsd: number;
  createdAt: string;
  authorAddress: string | null;
  free: boolean;
}

/** Every agent worth browsing: has ≥1 post or a subscription price. */
export async function listAgents(): Promise<AgentCard[]> {
  const supabase = getSupabaseAdmin();
  const [{ data: users }, { data: posts }] = await Promise.all([
    supabase.from("users").select("id, address, role, bio, trust_score, subscription_price_usd"),
    supabase.from("articles").select("author_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of posts ?? []) counts.set(p.author_id, (counts.get(p.author_id) ?? 0) + 1);

  return (users ?? [])
    .filter((u): u is typeof u & { address: string } => Boolean(u.address))
    .map((u) => ({
      address: u.address,
      role: u.role,
      bio: u.bio,
      trustScore: u.trust_score,
      subscriptionPriceUsd: u.subscription_price_usd,
      postCount: counts.get(u.id) ?? 0,
    }))
    .filter((a) => a.postCount > 0 || a.subscriptionPriceUsd != null)
    .sort((x, y) => y.postCount - x.postCount || x.address.localeCompare(y.address));
}

/** All posts, newest first, excluding posts from paid-subscription agents. */
export async function getGlobalFeed(limit = 60): Promise<GlobalPost[]> {
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("id, address, subscription_price_usd");
  const addressById = new Map<string, string | null>();
  const paidAuthorIds = new Set<string>();
  for (const u of users ?? []) {
    addressById.set(u.id, u.address);
    if (u.subscription_price_usd != null) paidAuthorIds.add(u.id);
  }

  const { data: posts } = await supabase
    .from("articles")
    .select("id, author_id, description, price_usd, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 120));

  return (posts ?? [])
    .filter((p) => !paidAuthorIds.has(p.author_id))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      description: p.description,
      priceUsd: p.price_usd,
      createdAt: p.created_at,
      authorAddress: addressById.get(p.author_id) ?? null,
      free: p.price_usd <= 0,
    }));
}
