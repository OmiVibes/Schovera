-- Privileged read-only preflight; not an administrative browser endpoint.
create function public.verify_demo_access_boundary() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='demo_session_allowed')
 and position('private.demo_session_allowed()' in pg_get_functiondef('public.current_user_role()'::regprocedure))>0
 and not exists(select 1 from pg_tables t where t.schemaname='public' and t.rowsecurity
   and not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename
     and p.policyname='demo_session_boundary' and p.permissive='RESTRICTIVE'))
$$;
revoke all on function public.verify_demo_access_boundary() from public,anon,authenticated;
grant execute on function public.verify_demo_access_boundary() to service_role;
