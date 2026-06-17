-- ===========================================================================
-- A-port — Sprint 2
-- Structured Information Network namespace ([author].[type].[name]),
-- agent self-registration by handle, purchases, and disputes.
--
-- Idempotent: safe to run whether or not 0001 was already applied.
-- Apply with `supabase db push` or paste into the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users: human/agent handle (first segment of a namespace, e.g. "vlad_kvlchk")
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists handle text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_handle_key'
  ) then
    -- NULLs are distinct under a UNIQUE constraint, so legacy rows are fine.
    alter table public.users add constraint users_handle_key unique (handle);
  end if;
end$$;

comment on column public.users.handle is
  'Unique agent/author handle; the first segment of a namespace.';

-- ---------------------------------------------------------------------------
-- articles: structured namespace [author].[type].[name]
-- ---------------------------------------------------------------------------
alter table public.articles add column if not exists namespace text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'articles_namespace_key'
  ) then
    alter table public.articles add constraint articles_namespace_key unique (namespace);
  end if;
end$$;

create index if not exists articles_namespace_idx on public.articles (namespace);

comment on column public.articles.namespace is
  'Structured identifier: [author].[type].[name] (e.g. anthropic.event.model_release).';

-- ---------------------------------------------------------------------------
-- purchases: a buyer''s confirmed access to an article (MVP "Stripe" record)
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  buyer_id   uuid not null references public.users (id) on delete cascade,
  amount_usd numeric(12, 2) not null default 0,
  status     text not null default 'confirmed',
  created_at timestamptz not null default now(),
  unique (article_id, buyer_id)
);

create index if not exists purchases_buyer_id_idx on public.purchases (buyer_id);

comment on table public.purchases is
  'Confirmed buyer access to an article (simulated Stripe checkout in Sprint 2).';

-- ---------------------------------------------------------------------------
-- disputes: NemoClaw arbitration outcomes
-- ---------------------------------------------------------------------------
create table if not exists public.disputes (
  id                      uuid primary key default gen_random_uuid(),
  article_id              uuid references public.articles (id) on delete set null,
  buyer_id                uuid references public.users (id) on delete set null,
  reason                  text not null,
  status                  text not null,
  trust_score_adjustment  integer not null default 0,
  rationale               text,
  created_at              timestamptz not null default now()
);

create index if not exists disputes_buyer_id_idx on public.disputes (buyer_id);

comment on table public.disputes is
  'Arbitration verdicts produced by the NemoClaw LLM judge.';

-- ---------------------------------------------------------------------------
-- RPC: publish_article (replaces the Sprint 1 signature)
-- Derives the author from the namespace''s first segment, self-registering the
-- agent if needed, then atomically inserts the article + its embedding.
-- ---------------------------------------------------------------------------
drop function if exists public.publish_article(uuid, text, text, text, numeric, vector);

create or replace function public.publish_article(
  p_namespace   text,
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
  v_handle     text;
  v_author_id  uuid;
  v_article_id uuid;
begin
  v_handle := split_part(p_namespace, '.', 1);
  if v_handle is null or v_handle = '' then
    raise exception 'namespace must start with an author handle: %', p_namespace;
  end if;

  -- self-register the author by handle
  select id into v_author_id from public.users where handle = v_handle;
  if v_author_id is null then
    insert into public.users (handle, role) values (v_handle, 'author')
    returning id into v_author_id;
  end if;

  insert into public.articles (author_id, namespace, title, description, body_encrypted, price_usd)
  values (v_author_id, p_namespace, p_namespace, p_description, p_body, p_price_usd)
  returning id into v_article_id;

  insert into public.embeddings (article_id, embedding)
  values (v_article_id, p_embedding);

  return v_article_id;
end;
$$;

comment on function public.publish_article is
  'Self-register author by namespace handle, then atomically insert article + embedding.';

-- ---------------------------------------------------------------------------
-- RPC: match_articles (now returns the namespace)
-- ---------------------------------------------------------------------------
drop function if exists public.match_articles(vector, float, int);

create or replace function public.match_articles(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
returns table (
  id          uuid,
  author_id   uuid,
  namespace   text,
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
    a.namespace,
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
  'Top-N cosine-similarity search over [namespace + description] embeddings; excludes body_encrypted.';
