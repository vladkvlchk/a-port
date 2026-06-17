/**
 * Embedding generation.
 *
 * Sprint 1 ships a dependency-free **mock** provider. It is deterministic
 * (the same text always yields the same vector) so the search endpoint is
 * reproducible in tests and demos — but the vectors carry no real semantic
 * meaning. Swap in OpenAI / NVIDIA by implementing `EmbeddingProvider` and
 * wiring it into `getEmbeddingProvider()`; nothing else in the app changes.
 */

/** OpenAI text-embedding-3-small / NVIDIA NV-Embed dimensionality. */
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  readonly name: string;
  /** Return an `EMBEDDING_DIMENSIONS`-length vector for `input`. */
  embed(input: string): Promise<number[]>;
}

/* ------------------------------------------------------------------------- */
/* Deterministic pseudo-random helpers (seeded by the input text)            */
/* ------------------------------------------------------------------------- */

/** cyrb53-style 32-bit string hash, used to seed the PRNG. */
function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — fast, seedable, returns floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------------- */
/* Mock provider                                                             */
/* ------------------------------------------------------------------------- */

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";

  async embed(input: string): Promise<number[]> {
    const next = mulberry32(hashString(input));
    // Values in [-1, 1], shaped like a normalised embedding.
    return Array.from({ length: EMBEDDING_DIMENSIONS }, () => next() * 2 - 1);
  }
}

/* ------------------------------------------------------------------------- */
/* Provider selection                                                        */
/* ------------------------------------------------------------------------- */

let provider: EmbeddingProvider | null = null;

/**
 * Resolve the active embedding provider from `EMBEDDING_PROVIDER`.
 * Extend the switch with real providers (openai, nvidia) in later sprints.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (provider) return provider;

  const selected = process.env.EMBEDDING_PROVIDER ?? "mock";
  switch (selected) {
    case "mock":
      provider = new MockEmbeddingProvider();
      break;
    default:
      throw new Error(
        `Unsupported EMBEDDING_PROVIDER "${selected}". Supported: "mock".`,
      );
  }

  return provider;
}

/** Generate an embedding for arbitrary text using the active provider. */
export async function createEmbedding(input: string): Promise<number[]> {
  const text = input.trim();
  if (!text) {
    throw new Error("Cannot create an embedding for empty input.");
  }
  return getEmbeddingProvider().embed(text);
}

/**
 * Serialise a numeric vector into the pgvector text literal (`[0.1,0.2,...]`)
 * expected by Supabase/PostgREST for `vector` columns and function arguments.
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
