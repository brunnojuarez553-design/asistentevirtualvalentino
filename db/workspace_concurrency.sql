-- Apply only after reviewing in a non-production Supabase project.
-- Atomic optimistic concurrency for the existing assistant_workspace record.
-- This does NOT migrate conversations to vm_conversations/vm_messages.
begin;
alter table public.assistant_workspace add column if not exists version bigint not null default 0;
create or replace function public.vm_workspace_compare_and_swap(expected_version bigint, new_payload jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare changed integer;
begin
  if expected_version is null or expected_version < 0 or new_payload is null
     or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'Invalid workspace update';
  end if;
  update public.assistant_workspace
    set payload = new_payload, version = version + 1, updated_at = now()
    where id = 'default' and version = expected_version;
  get diagnostics changed = row_count;
  if changed = 1 then return true; end if;
  if expected_version = 0 then
    insert into public.assistant_workspace(id,payload,version)
    values ('default',new_payload,1)
    on conflict (id) do nothing;
    get diagnostics changed = row_count;
    return changed = 1;
  end if;
  return false;
end;
$$;
revoke all on function public.vm_workspace_compare_and_swap(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.vm_workspace_compare_and_swap(bigint,jsonb) to service_role;
commit;
