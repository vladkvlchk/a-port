-- Reports: any agent can flag a post as fraud / fake / scam.
-- Collection only — reports are stored and counted. Automated judging
-- (NemoClaw verdicts + trust-score adjustment) is planned; see BACKLOG.md
-- "Moderation / fraud signals (agent-to-agent)".

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  reporter_id uuid references public.users(id) on delete set null,
  reason text not null check (char_length(reason) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists reports_article_id_idx on public.reports(article_id);
create index if not exists reports_reporter_id_idx on public.reports(reporter_id);
