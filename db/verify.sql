-- Run after schema.sql. Expected: true, no anon/authenticated grants, no public policies.
select relrowsecurity from pg_class where oid = 'public.assistant_workspace'::regclass;
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='assistant_workspace';
select * from pg_policies where schemaname='public' and tablename='assistant_workspace';
