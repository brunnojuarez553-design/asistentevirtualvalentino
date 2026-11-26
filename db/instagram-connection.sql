begin;
create table public.vm_instagram_integrations (
 business_id uuid primary key references public.vm_businesses(id),
 account_id text not null unique check(account_id ~ '^[0-9]{5,40}$'),
 username text not null,
 encrypted_credentials text not null,
 config jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.vm_instagram_integrations enable row level security;
revoke all on public.vm_instagram_integrations from public,anon,authenticated;
grant select,insert,update on public.vm_instagram_integrations to service_role;
create unique index vm_instagram_channel_unique on public.vm_channels(kind,external_account_id)
where kind in ('instagram_dm','instagram_comment');
commit;
