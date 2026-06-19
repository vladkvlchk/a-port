/**
 * Feed + post access gating.
 *
 * A viewer's feed = posts from creators they follow/subscribe to. A premium
 * post's body is unlocked only for: the author, a buyer (PPV purchase), or an
 * active paid subscriber of the author. Free posts (price 0) are open.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAccountByAddress } from "@/lib/users.service";
import type { Database } from "@/types/database.types";

export interface FeedPost {
  id: string;
  namespace: string | null;
  description: string;
  priceUsd: number;
  authorId: string;
  createdAt: string;
  locked: boolean;
}

export interface PostView extends FeedPost {
  content: string | null;
}

interface AccessContext {
  viewerId: string;
  paidCreatorIds: Set<string>;
  purchasedPostIds: Set<string>;
}

async function buildAccessContext(
  supabase: SupabaseClient<Database>,
  viewerId: string,
): Promise<AccessContext> {
  const [{ data: subs }, { data: purchases }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("creator_id, current_period_end")
      .eq("follower_id", viewerId)
      .eq("tier", "paid")
      .in("status", ["active", "trialing"]),
    supabase.from("purchases").select("article_id").eq("buyer_id", viewerId),
  ]);

  const now = Date.now();
  const paidCreatorIds = new Set<string>();
  for (const s of subs ?? []) {
    if (!s.current_period_end || new Date(s.current_period_end).getTime() > now) {
      paidCreatorIds.add(s.creator_id);
    }
  }
  const purchasedPostIds = new Set((purchases ?? []).map((p) => p.article_id));
  return { viewerId, paidCreatorIds, purchasedPostIds };
}

function canAccess(
  ctx: AccessContext,
  post: { id: string; author_id: string; price_usd: number },
): boolean {
  if (post.price_usd <= 0) return true; // free
  if (post.author_id === ctx.viewerId) return true; // own post
  if (ctx.purchasedPostIds.has(post.id)) return true; // bought (PPV)
  if (ctx.paidCreatorIds.has(post.author_id)) return true; // active subscriber
  return false;
}

/** Posts from everyone the viewer follows/subscribes, newest first. */
export async function getFeed(
  viewerAddress: string,
  viewerPublicKey: string,
): Promise<FeedPost[]> {
  const supabase = getSupabaseAdmin();
  const viewerId = await resolveAccountByAddress(supabase, viewerAddress, viewerPublicKey, "buyer");

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("creator_id")
    .eq("follower_id", viewerId);
  const creatorIds = [...new Set((subs ?? []).map((s) => s.creator_id))];
  if (creatorIds.length === 0) return [];

  const ctx = await buildAccessContext(supabase, viewerId);
  const { data: posts } = await supabase
    .from("articles")
    .select("id, author_id, namespace, description, price_usd, created_at")
    .in("author_id", creatorIds)
    .order("created_at", { ascending: false })
    .limit(50);

  return (posts ?? []).map((p) => ({
    id: p.id,
    namespace: p.namespace,
    description: p.description,
    priceUsd: p.price_usd,
    authorId: p.author_id,
    createdAt: p.created_at,
    locked: !canAccess(ctx, { id: p.id, author_id: p.author_id, price_usd: p.price_usd }),
  }));
}

/** A single post; `content` is included only if the viewer has access. */
export async function getPostForViewer(
  viewerAddress: string,
  viewerPublicKey: string,
  postId: string,
): Promise<PostView | null> {
  const supabase = getSupabaseAdmin();
  const viewerId = await resolveAccountByAddress(supabase, viewerAddress, viewerPublicKey, "buyer");

  const { data: post } = await supabase
    .from("articles")
    .select("id, author_id, namespace, description, price_usd, body_encrypted, created_at")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return null;

  const ctx = await buildAccessContext(supabase, viewerId);
  const access = canAccess(ctx, {
    id: post.id,
    author_id: post.author_id,
    price_usd: post.price_usd,
  });

  return {
    id: post.id,
    namespace: post.namespace,
    description: post.description,
    priceUsd: post.price_usd,
    authorId: post.author_id,
    createdAt: post.created_at,
    locked: !access,
    content: access ? post.body_encrypted : null,
  };
}
