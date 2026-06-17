/**
 * Article use-cases (application layer).
 *
 * Publishing now operates on the structured namespace [author].[type].[name].
 * The embedding is generated from "[namespace] [description]" and search runs
 * cosine similarity over that vector. body_encrypted is never returned here.
 */

import { createEmbedding, toPgVector } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Top-N results returned by search. */
export const DEFAULT_MATCH_COUNT = 5;

/**
 * Minimum cosine similarity for a hit. Permissive in Sprint 1/2 because the
 * mock provider produces non-semantic vectors; raise to ~0.7–0.8 once a real
 * embedding provider is wired in.
 */
export const DEFAULT_MATCH_THRESHOLD = 0.0;

/** `[author].[type].[name]` — lowercase segments of letters/digits/_/-. */
export const NAMESPACE_PATTERN = /^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/;

export class NamespaceTakenError extends Error {
  constructor(public readonly namespace: string) {
    super(`Namespace already exists: ${namespace}`);
    this.name = "NamespaceTakenError";
  }
}

export interface PublishArticleInput {
  namespace: string;
  description: string;
  body: string;
  priceUsd: number;
}

export interface PublishArticleResult {
  id: string;
  namespace: string;
  authorHandle: string;
}

export interface ArticleSearchResult {
  id: string;
  authorId: string;
  namespace: string | null;
  description: string;
  priceUsd: number;
  similarity: number;
}

/**
 * Publish an article under a namespace: embed "[namespace] [description]", then
 * atomically self-register the author and persist the article + embedding via
 * the `publish_article` RPC.
 */
export async function publishArticle(
  input: PublishArticleInput,
): Promise<PublishArticleResult> {
  const supabase = getSupabaseAdmin();

  const embedding = await createEmbedding(`${input.namespace} ${input.description}`);

  const { data, error } = await supabase.rpc("publish_article", {
    p_namespace: input.namespace,
    p_description: input.description,
    p_body: input.body,
    p_price_usd: input.priceUsd,
    p_embedding: toPgVector(embedding),
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new NamespaceTakenError(input.namespace);
    }
    throw new Error(`Failed to publish article: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to publish article: no id returned from database.");
  }

  return {
    id: data,
    namespace: input.namespace,
    authorHandle: input.namespace.split(".")[0] ?? "",
  };
}

/**
 * Semantic search over published namespaces + descriptions. Delegates ranking
 * to the `match_articles` RPC, which never selects body_encrypted.
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
    namespace: row.namespace,
    description: row.description,
    priceUsd: row.price_usd,
    similarity: row.similarity,
  }));
}
