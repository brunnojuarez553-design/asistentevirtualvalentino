-- Durable, service-only receipt ledger for signed Meta events and one-shot operations.
create table if not exists public.vm_meta_event_receipts (
 event_key text primary key,
 business_id uuid not null references public.vm_businesses(id),
 payload jsonb not null,
 state text not null check(state in ('received','pending','processed')),
 created_at timestamptz not null default now()
);
alter table public.vm_meta_event_receipts enable row level security;
revoke all on public.vm_meta_event_receipts from public,anon,authenticated;
grant select,insert,update on public.vm_meta_event_receipts to service_role;
create index if not exists vm_meta_event_receipts_business on public.vm_meta_event_receipts(business_id,created_at);
create unique index if not exists vm_whatsapp_channel_phone_unique
 on public.vm_channels(external_account_id) where kind='whatsapp' and enabled=true;
