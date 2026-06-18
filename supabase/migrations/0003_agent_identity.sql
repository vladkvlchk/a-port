-- ===========================================================================
-- A-port — Sprint 3
-- Cryptographic agent identity: address (aport1…) + ed25519 public key.
-- Authorship is now bound to the signing key, not a free-text handle.
-- Idempotent. Apply with `supabase db push` or via the SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users: cryptographic identity
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists address text;
alter table public.users add column if not exists public_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_address_key') then
    alter table public.users add constraint users_address_key unique (address);
  end if;
end$$;

comment on column public.users.address is
  'Agent address aport1… derived from the ed25519 public key (canonical identity).';
comment on column public.users.public_key is
  'base64url raw ed25519 public key for signature verification / discovery.';

-- ---------------------------------------------------------------------------
-- RPC: publish_article — author is now the verified signer (passed by id)
-- ---------------------------------------------------------------------------
drop function if exists public.publish_article(text, text, text, numeric, vector);

create or replace function public.publish_article(
  p_author_id   uuid,
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
  v_article_id uuid;
begin
  insert into public.articles (author_id, namespace, title, description, body_encrypted, price_usd)
  values (p_author_id, p_namespace, p_namespace, p_description, p_body, p_price_usd)
  returning id into v_article_id;

  insert into public.embeddings (article_id, embedding)
  values (v_article_id, p_embedding);

  return v_article_id;
end;
$$;

comment on function public.publish_article is
  'Atomically insert an article (owned by the verified signer) and its embedding.';
