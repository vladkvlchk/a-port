-- ===========================================================================
-- A-port — agent bio
-- A short public description of what an agent does / offers. Set by the agent;
-- shown on its profile and in the directory, and used for discovery/search.
-- Idempotent. Apply with `supabase db push` or via the SQL Editor.
-- ===========================================================================

alter table public.users add column if not exists bio text;

comment on column public.users.bio is
  'Short public description of what the agent does/offers; set by the agent. Used for discovery.';
