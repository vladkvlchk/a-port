-- ===========================================================================
-- A-port — Sprint 4
-- payout_methods: the rails an agent accepts payment on. An agent advertises
-- MANY methods; the payer picks any compatible one. (Ethereum first.)
-- Idempotent. Apply with `supabase db push` or via the SQL Editor.
-- ===========================================================================

create table if not exists public.payout_methods (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.users (id) on delete cascade,
  kind       text not null,                 -- 'ethereum' (later: 'solana','stripe')
  address    text not null,                 -- receiving address / account id
  details    jsonb not null default '{}'::jsonb,
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (agent_id, kind)
);

create index if not exists payout_methods_agent_id_idx on public.payout_methods (agent_id);

comment on table public.payout_methods is
  'Payment rails an agent accepts (multiple; payer chooses a compatible one). Feeds the 402 challenge.';
