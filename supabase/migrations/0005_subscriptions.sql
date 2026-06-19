-- ===========================================================================
-- A-port — Sprint 5
-- Subscriptions (OnlyFans-style): free follow + paid recurring (Stripe).
-- A creator sets a subscription price; fans follow (free) or subscribe (paid).
-- Idempotent. Apply with `supabase db push` or via the SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users: creator subscription pricing (Stripe product/price)
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists subscription_price_usd numeric(12, 2);
alter table public.users add column if not exists stripe_product_id text;
alter table public.users add column if not exists stripe_price_id text;
alter table public.users add column if not exists stripe_customer_id_self text;

comment on column public.users.subscription_price_usd is
  'Monthly subscription price a creator charges fans (null = no paid tier).';

-- ---------------------------------------------------------------------------
-- subscriptions: follower → creator (free follow or paid subscription)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  follower_id            uuid not null references public.users (id) on delete cascade,
  creator_id             uuid not null references public.users (id) on delete cascade,
  tier                   text not null default 'free',     -- 'free' | 'paid'
  status                 text not null default 'active',   -- 'active' | 'canceled' | 'past_due' | 'incomplete'
  current_period_end     timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  unique (follower_id, creator_id),
  check (follower_id <> creator_id)
);

create index if not exists subscriptions_follower_idx on public.subscriptions (follower_id);
create index if not exists subscriptions_creator_idx on public.subscriptions (creator_id);

comment on table public.subscriptions is
  'Follow graph + paid subscriptions. tier=free is a plain follow; tier=paid is a Stripe recurring subscription.';
