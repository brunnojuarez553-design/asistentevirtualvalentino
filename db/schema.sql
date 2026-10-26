-- Initial bootstrap, run once in a NEW Supabase project SQL editor.
-- Server-only workspace. No client database credentials are needed.
begin;
create table public.assistant_workspace (
  id text primary key check (id = 'default'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.assistant_workspace enable row level security;
revoke all on public.assistant_workspace from public, anon, authenticated;
grant select, insert, update on public.assistant_workspace to service_role;
-- No anon/authenticated policies: all workspace access passes through the protected server.
commit;
