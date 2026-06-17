/**
 * Article use-cases (application layer).
 *
 * Orchestrates embeddings + persistence so the route handlers stay thin and
 * free of infrastructure details. All Supabase access lives here.
 */

import { createEmbedding, toPgVector } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Top-N results returned by the search endpoint. */
export const DEFAULT_MATCH_COUNT = 5;

/**
 * Minimum cosine similarity for a hit. Kept permissive in Sprint 1 because the
 * mock provider produces non-semantic vectors; raise to ~0.7–0.8 once a real
 * embedding provider is wired in.
 */
export const DEFAULT_MATCH_THRESHOLD = 0.0;

export interface PublishArticleInput {
  authorId: string;
  title: string;
  description: string;
  body: string;
  priceUsd: number;
}

/** Public, body-free article shape returned to search clients. */
export interface ArticleSearchResult {
  id: string;
  authorId: string;
  title: string;
  description: string;
  priceUsd: number;
  similarity: number;
}

/**
 * Publish an article: embed its (title + description), then atomically persist
 * the article row and its embedding via the `publish_article` RPC.
 *
 * @returns the new article id.
 */
export async function publishArticle(
  input: PublishArticleInput,
): Promise<{ id: string }> {
  const supabase = getSupabaseAdmin();

  // Search matches on title + description, so that is what we embed.
  const embedding = await createEmbedding(`${input.title}\n\n${input.description}`);

  const { data, error } = await supabase.rpc("publish_article", {
    p_author_id: input.authorId,
    p_title: input.title,
    p_description: input.description,
    p_body: input.body,
    p_price_usd: input.priceUsd,
    p_embedding: toPgVector(embedding),
  });

  if (error) {
    throw new Error(`Failed to publish article: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to publish article: no id returned from database.");
  }

  return { id: data };
}

/**
 * Semantic search over published articles. Embeds the query, then delegates
 * ranking to the `match_articles` RPC. The RPC never selects `body_encrypted`,
 * so the premium payload cannot leak through this path.
 */
export async function searchArticles(
  query: string,
): Promise<ArticleSearchResult[]> {
  const supabase = getSupabaseAdmin();

  const embedding = await createEmbedding(query);

  const { data, error } = await supabase.rpc("match_articles", {
    query_embedding: toPgVector(embedding),
    match_threshold: DEFAULT_MATCH_THRESHOLD,
    match_count: DEFAULT_MATCH_COUNT,
  });

  if (error) {
    throw new Error(`Failed to search articles: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    priceUsd: row.price_usd,
    similarity: row.similarity,
  }));
}
