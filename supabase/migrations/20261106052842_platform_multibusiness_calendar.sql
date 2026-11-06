begin;
set local lock_timeout='5s';
lock table public.assistant_workspace in share row exclusive mode;
-- Preserve the existing payload in place. Old and new deployments share its CAS version.
alter table public.assistant_workspace add column if not exists business_id uuid references public.vm_businesses(id);
update public.assistant_workspace w set business_id=b.id from public.vm_businesses b
 where w.id='default' and b.slug='valentino-motors' and w.business_id is null;
alter table public.assistant_workspace drop constraint assistant_workspace_id_check;
alter table public.assistant_workspace add constraint assistant_workspace_id_check check(id='default' or (business_id is not null and id='business:'||business_id::text));
create unique index if not exists assistant_workspace_business on public.assistant_workspace(business_id) where business_id is not null;
alter table public.assistant_workspace enable row level security;
revoke all on public.assistant_workspace from anon,authenticated;
create or replace function public.vm_tenant_workspace_compare_and_swap(p_business_id uuid,expected_version bigint,new_payload jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_business_id is null or expected_version<0 or expected_version is null or jsonb_typeof(new_payload) is distinct from 'object' then raise exception 'Invalid workspace'; end if;
 update public.assistant_workspace set payload=new_payload,version=version+1,updated_at=now()
 where business_id=p_business_id and version=expected_version;
 get diagnostics changed=row_count;
 if changed=1 then return true; end if;
 if expected_version=0 then
  insert into public.assistant_workspace(id,business_id,payload,version) values('business:'||p_business_id,p_business_id,new_payload,1) on conflict do nothing;
  get diagnostics changed=row_count;return changed=1;
 end if;
 return false;
end $$;
revoke all on function public.vm_tenant_workspace_compare_and_swap(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.vm_tenant_workspace_compare_and_swap(uuid,bigint,jsonb) to service_role;

create table public.vm_platform_admins(user_id uuid primary key references auth.users(id),active boolean not null default true);
alter table public.vm_platform_admins enable row level security;
revoke all on public.vm_platform_admins from public,anon,authenticated;
grant select,insert,update,delete on public.vm_platform_admins to service_role;
create or replace function public.vm_create_business(p_actor uuid,p_name text,p_slug text,p_timezone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.vm_businesses;
begin
 if not exists(select 1 from public.vm_platform_admins where user_id=p_actor and active) then raise exception 'Platform administrator required'; end if;
 if length(trim(p_name))<3 or length(p_name)>140 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Invalid business'; end if;
 insert into public.vm_businesses(slug,display_name,locale,timezone) values(p_slug,trim(p_name),'es-AR',p_timezone) returning * into b;
 insert into public.vm_staff(business_id,user_id,role) values(b.id,p_actor,'owner');
 return jsonb_build_object('id',b.id,'slug',b.slug,'display_name',b.display_name,'timezone',b.timezone);
end $$;
revoke all on function public.vm_create_business(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vm_create_business(uuid,text,text,text) to service_role;
create index if not exists vm_staff_user_active on public.vm_staff(user_id,business_id) where active;

create table public.vm_integrations(
 business_id uuid not null references public.vm_businesses(id),provider text not null check(provider in ('google_calendar','meta')),
 encrypted_credentials text not null,config jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now(),
 primary key(business_id,provider)
);
alter table public.vm_integrations enable row level security;
revoke all on public.vm_integrations from public,anon,authenticated;
grant select,insert,update,delete on public.vm_integrations to service_role;
create table public.vm_oauth_states(
 state_hash text primary key,business_id uuid not null references public.vm_businesses(id),user_id uuid not null references auth.users(id),
 provider text not null check(provider in ('google_calendar','meta')),verifier text not null,expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.vm_oauth_states enable row level security;
revoke all on public.vm_oauth_states from public,anon,authenticated;
grant select,insert,delete on public.vm_oauth_states to service_role;
create index vm_oauth_states_expiry on public.vm_oauth_states(expires_at);
create or replace function public.vm_consume_oauth_state(p_hash text,p_provider text)
returns setof public.vm_oauth_states language sql security invoker set search_path='' as $$
 delete from public.vm_oauth_states where state_hash=p_hash and provider=p_provider and expires_at>now() returning *;
$$;
revoke all on function public.vm_consume_oauth_state(text,text) from public,anon,authenticated;
grant execute on function public.vm_consume_oauth_state(text,text) to service_role;

create table public.vm_calendar_bookings(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.vm_businesses(id),
 request_id uuid not null,fingerprint text not null,calendar_id text not null,event_id text not null,
 start_at timestamptz not null,end_at timestamptz not null check(end_at>start_at),
 summary text not null,contact text,status text not null default 'pending' check(status in ('pending','confirmed','check_required','failed','cancelled')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,request_id),unique(business_id,calendar_id,event_id)
);
alter table public.vm_calendar_bookings enable row level security;
revoke all on public.vm_calendar_bookings from public,anon,authenticated;
grant select,insert,update on public.vm_calendar_bookings to service_role;
create index vm_calendar_bookings_schedule on public.vm_calendar_bookings(business_id,start_at);
create or replace function public.vm_reserve_calendar_booking(p_business_id uuid,p_request_id uuid,p_fingerprint text,p_calendar_id text,p_event_id text,p_start timestamptz,p_end timestamptz,p_summary text,p_contact text,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.vm_calendar_bookings;
begin
 if not exists(select 1 from public.vm_staff where business_id=p_business_id and user_id=p_actor and active and role in ('owner','admin')) then raise exception 'Unauthorized'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '8 hours' or p_start<=now() or p_start>now()+interval '1 year' or length(trim(p_summary))<3 or length(p_summary)>200 then raise exception 'Invalid booking'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,0));
 select * into b from public.vm_calendar_bookings where business_id=p_business_id and request_id=p_request_id;
 if found then
  if b.fingerprint<>p_fingerprint then raise exception 'Idempotency payload mismatch'; end if;
  return to_jsonb(b)||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.vm_calendar_bookings where business_id=p_business_id and calendar_id=p_calendar_id and status in ('pending','confirmed','check_required') and start_at<p_end and end_at>p_start) then raise sqlstate '23505' using message='Slot already reserved'; end if;
 insert into public.vm_calendar_bookings(business_id,request_id,fingerprint,calendar_id,event_id,start_at,end_at,summary,contact,created_by)
 values(p_business_id,p_request_id,p_fingerprint,p_calendar_id,p_event_id,p_start,p_end,p_summary,p_contact,p_actor) returning * into b;
 return to_jsonb(b)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.vm_reserve_calendar_booking(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.vm_reserve_calendar_booking(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,uuid) to service_role;

create or replace function public.vm_manage_team(p_actor uuid,p_business_id uuid,p_action text,p_email text default null,p_role text default 'agent')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_role text;target_user uuid;target_role text;
begin
 select role into actor_role from public.vm_staff where business_id=p_business_id and user_id=p_actor and active;
 if actor_role is null then raise exception 'Unauthorized';end if;
 if p_action<>'list' then
  if actor_role not in ('owner','admin') then raise exception 'Administrator required';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,1));
  select id into target_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if target_user is null then raise exception 'La cuenta debe existir y tener el correo confirmado';end if;
  select role into target_role from public.vm_staff where business_id=p_business_id and user_id=target_user and active;
  if (target_role='owner' or p_role='owner') and actor_role<>'owner' then raise exception 'Owner required';end if;
  if target_user=p_actor and (p_action='disable' or p_role<>actor_role) then raise exception 'No podés quitarte tus propios permisos';end if;
  if p_action='add' and p_role in ('owner','admin','agent') then
   insert into public.vm_staff(business_id,user_id,role,active) values(p_business_id,target_user,p_role,true)
   on conflict(business_id,user_id) do update set role=excluded.role,active=true;
  elsif p_action='disable' then
   if target_role='owner' and (select count(*) from public.vm_staff where business_id=p_business_id and role='owner' and active)<=1 then raise exception 'El negocio necesita un propietario';end if;
   update public.vm_staff set active=false where business_id=p_business_id and user_id=target_user;
  else raise exception 'Invalid action';end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('email',u.email,'role',s.role,'active',s.active) order by s.role,u.email),'[]'::jsonb)
 from public.vm_staff s join auth.users u on u.id=s.user_id where s.business_id=p_business_id and s.active);
end $$;
revoke all on function public.vm_manage_team(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vm_manage_team(uuid,uuid,text,text,text) to service_role;

commit;
