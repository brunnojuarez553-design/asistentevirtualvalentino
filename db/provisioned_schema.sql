-- Diseño de almacenamiento v2 para Valentino Motors.
-- Esquema inicial de Valentino Motors, proyecto Supabase oficyvzpwpfjnajaqkrg.
-- Las tablas vm_* son la estructura normalizada futura. El backend de simulación actual usa assistant_workspace (JSON).
begin;

create table if not exists public.vm_businesses (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 display_name text not null,
 locale text not null default 'es-VE',
 timezone text not null default 'America/Caracas',
 settings jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.vm_staff (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','agent')),
 active boolean not null default true,
 unique (business_id,user_id)
);

create table if not exists public.vm_channels (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 kind text not null check (kind in ('whatsapp','instagram_dm','instagram_comment')),
 external_account_id text,
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 unique (business_id,kind,external_account_id)
);

create table if not exists public.vm_contacts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 display_name text,
 phone_e164 text,
 customer_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.vm_contact_identities (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 contact_id uuid not null references public.vm_contacts(id) on delete cascade,
 kind text not null check (kind in ('whatsapp','instagram')),
 external_user_id text not null,
 unique(business_id,kind,external_user_id)
);

create table if not exists public.vm_services (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 code text not null,
 name text not null,
 description text,
 public_copy text,
 warranty_terms text,
 reference_price_usd numeric(12,2),
 needs_technical_review boolean not null default true,
 needs_legal_review boolean not null default false,
 approved boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,code)
);

create table if not exists public.vm_price_rules (
 id uuid primary key default gen_random_uuid(),
 service_id uuid not null references public.vm_services(id) on delete cascade,
 make text not null,
 model text not null,
 model_year integer not null check(model_year between 1950 and 2100),
 engine text not null,
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 amount numeric(12,2) not null check(amount > 0),
 terms text,
 valid_from date not null default current_date,
 valid_until date,
 approved boolean not null default false,
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(valid_until is null or valid_until >= valid_from)
);

create unique index if not exists vm_price_rule_exact
  on public.vm_price_rules(service_id, lower(make), lower(model), model_year, lower(engine), valid_from);

create table if not exists public.vm_conversations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 channel_id uuid references public.vm_channels(id),
 contact_id uuid references public.vm_contacts(id),
 external_thread_id text,
 state text not null default 'ai' check(state in ('ai','review','human')),
 human_takeover_at timestamptz,
 human_takeover_by uuid references auth.users(id),
 ai_paused_reason text,
 assigned_to uuid references auth.users(id),
 last_message_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(channel_id,external_thread_id)
);

create index if not exists vm_conversations_dashboard
  on public.vm_conversations(business_id,state,last_message_at desc);
create index if not exists vm_conversations_contact on public.vm_conversations(contact_id);

create table if not exists public.vm_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.vm_conversations(id) on delete cascade,
 provider_message_id text,
 direction text not null check(direction in ('incoming','outgoing')),
 authored_by text not null check(authored_by in ('customer','ai','valentino','staff')),
 message_type text not null default 'text',
 body text,
 delivery_status text not null default 'received'
   check(delivery_status in ('received','draft','pending_approval','queued','sent','delivered','failed','read')),
 approved_by uuid references auth.users(id),
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(conversation_id,provider_message_id)
);
create index if not exists vm_messages_history on public.vm_messages(conversation_id,occurred_at);

create table if not exists public.vm_webhook_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid references public.vm_businesses(id) on delete cascade,
 provider text not null check(provider in ('whatsapp','instagram')),
 provider_event_id text not null,
 event_kind text not null,
 raw_payload jsonb,
 processed_at timestamptz,
 status text not null default 'pending' check(status in ('pending','processed','failed')),
 received_at timestamptz not null default now(),
 unique(provider,provider_event_id)
);
create index if not exists vm_webhook_events_pending on public.vm_webhook_events(status,received_at);

create table if not exists public.vm_handoffs (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.vm_conversations(id) on delete cascade,
 trigger_reason text not null,
 status text not null default 'pending' check(status in ('pending','accepted','resolved')),
 assigned_to uuid references auth.users(id),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);

create table if not exists public.vm_appointment_requests (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.vm_conversations(id) on delete cascade,
 contact_name text,
 preferred_day_text text,
 vehicle_make text,
 vehicle_model text,
 vehicle_year text,
 vehicle_engine text,
 requested_service text,
 status text not null default 'pending_human'
   check(status in ('pending_human','contacted','confirmed_by_valentino','cancelled')),
 human_confirmed_at timestamptz,
 human_confirmed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.vm_alerts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.vm_businesses(id) on delete cascade,
 conversation_id uuid references public.vm_conversations(id) on delete cascade,
 alert_type text not null,
 summary text not null,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists vm_alerts_unread on public.vm_alerts(business_id,created_at desc) where read_at is null;

create table if not exists public.vm_audit_log (
 id uuid primary key default gen_random_uuid(),
 business_id uuid references public.vm_businesses(id) on delete cascade,
 conversation_id uuid references public.vm_conversations(id) on delete set null,
 action text not null,
 actor_user_id uuid references auth.users(id),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

-- Todas las tablas son privadas en fase inicial. No exponer datos personales ni chats
-- a 'anon' o 'authenticated': el panel accederá a través de un backend autenticado.
-- La secret key de Supabase nunca va al navegador ni a GitHub.
do $$
declare t text;
begin
  foreach t in array array[
    'vm_businesses','vm_staff','vm_channels','vm_contacts','vm_contact_identities',
    'vm_services','vm_price_rules','vm_conversations','vm_messages','vm_webhook_events',
    'vm_handoffs','vm_appointment_requests','vm_alerts','vm_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated, public',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;

-- Compatibilidad con el backend actual en modo simulación.
create table if not exists public.assistant_workspace (
  id text primary key check(id = 'default'),
  payload jsonb not null check(jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.assistant_workspace enable row level security;
revoke all on public.assistant_workspace from public, anon, authenticated;
grant select, insert, update, delete on public.assistant_workspace to service_role;
commit;
