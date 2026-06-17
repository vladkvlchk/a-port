-- ===========================================================================
-- A-port — Sprint 1 schema
-- Knowledge Marketplace for AI agents (users, articles, vector embeddings).
--
-- Apply with the Supabase CLI:   supabase db push
-- or paste into:                 Supabase Dashboard -> SQL Editor
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- gen_random_uuid()
create extension if not exists "pgcrypto";
-- pgvector: the `vector` data type + similarity operators (<=> cosine distance)
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('author', 'buyer', 'arbitrator');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- users -------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  stripe_id   text,
  role        public.user_role not null default 'buyer',
  trust_score integer          not null default 100,
  created_at  timestamptz      not null default now()
);

comment on table public.users is 'Marketplace participants: authors, buyers and arbitrators.';
comment on column public.users.stripe_id is 'Stripe customer/account id; nullable until payments are connected.';
comment on column public.users.trust_score is 'Reputation score, starts at 100.';

-- articles ----------------------------------------------------------------
create table if not exists public.articles (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid    not null references public.users (id) on delete cascade,
  title          text    not null,
  description    text    not null,
  -- Raw text for now; simulates the encrypted premium payload. Never returned
  -- by the public search endpoint.
  body_encrypted text    not null,
  price_usd      numeric(12, 2) not null default 0 check (price_usd >= 0),
  created_at     timestamptz    not null default now()
);

comment on table public.articles is 'Published knowledge items for sale on the marketplace.';
comment on column public.articles.body_encrypted is 'Premium payload (raw text in Sprint 1, encrypted later). Must stay private.';

create index if not exists articles_author_id_idx on public.articles (author_id);
create index if not exists articles_created_at_idx on public.articles (created_at desc);

-- embeddings --------------------------------------------------------------
create table if not exists public.embeddings (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  -- 1536 dims matches OpenAI text-embedding-3-small / NVIDIA NV-Embed.
  embedding  vector(1536) not null
);

comment on table public.embeddings is 'Semantic vector (title + description) for each article.';

create index if not exists embeddings_article_id_idx on public.embeddings (article_id);

-- Approximate-nearest-neighbour index for cosine similarity search.
-- HNSW gives good recall/latency without a training step (unlike IVFFlat).
create index if not exists embeddings_embedding_hnsw_idx
  on public.embeddings
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RPC: publish_article
-- ---------------------------------------------------------------------------
-- A plpgsql function runs inside a single implicit transaction, so the article
-- row and its embedding are committed atomically (or not at all). This is the
-- correct way to span two inserts via Supabase/PostgREST, which executes each
-- REST call in its own transaction.
create or replace function public.publish_article(
  p_author_id   uuid,
  p_title       text,
  p_description text,
  p_body        text,
  p_price_usd   numeric,
  p_embedding   vector(1536)
)
returns uuid
language plpgsql
volatile
as $$
declare
  v_article_id uuid;
begin
  insert into public.articles (author_id, title, description, body_encrypted, price_usd)
  values (p_author_id, p_title, p_description, p_body, p_price_usd)
  returning id into v_article_id;

  insert into public.embeddings (article_id, embedding)
  values (v_article_id, p_embedding);

  return v_article_id;
end;
$$;

comment on function public.publish_article is
  'Atomically insert an article and its embedding, returning the new article id.';

-- ---------------------------------------------------------------------------
-- RPC: match_articles
-- ---------------------------------------------------------------------------
-- Cosine similarity search over article embeddings. Returns public-safe
-- columns only — body_encrypted is never selected, so it cannot leak.
--   similarity = 1 - cosine_distance,  range (-1 .. 1], higher = closer.
create or replace function public.match_articles(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
returns table (
  id          uuid,
  author_id   uuid,
  title       text,
  description text,
  price_usd   numeric,
  created_at  timestamptz,
  similarity  float
)
language sql
stable
as $$
  select
    a.id,
    a.author_id,
    a.title,
    a.description,
    a.price_usd,
    a.created_at,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  join public.articles a on a.id = e.article_id
  where 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_articles is
  'Top-N cosine-similarity article search; excludes body_encrypted by design.';
