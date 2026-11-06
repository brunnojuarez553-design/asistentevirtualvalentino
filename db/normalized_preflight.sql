-- Read-only preflight: safe to run on the Valentino production project.
-- Never returns customer names, message bodies, contact IDs or credentials.
with workspace as (
 select payload from public.assistant_workspace where id='default'
), legacy as (
 select coalesce(jsonb_array_length(case when jsonb_typeof(payload->'conversations')='array'
 then payload->'conversations' else '[]'::jsonb end),0) as conversations,
 coalesce(jsonb_array_length(case when jsonb_typeof(payload->'events')='array'
 then payload->'events' else '[]'::jsonb end),0) as events
 from workspace
)
select (select count(*) from public.vm_businesses) as businesses,
 (select count(*) from public.vm_conversations) as normalized_conversations,
 (select count(*) from public.vm_messages) as normalized_messages,
 (select count(*) from public.vm_webhook_events) as normalized_events,
 (select coalesce(sum(conversations),0) from legacy) as legacy_conversations,
 (select coalesce(sum(events),0) from legacy) as legacy_events,
 exists(select 1 from information_schema.columns where table_schema='public'
 and table_name='assistant_workspace' and column_name='version') as cas_version_ready,
 exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='vm_workspace_compare_and_swap') as cas_function_ready;
