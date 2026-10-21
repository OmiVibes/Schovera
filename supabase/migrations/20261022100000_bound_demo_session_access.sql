-- Applies only to server-tagged demo Auth accounts. Existing users keep their
-- existing policies. No public administration API and no production execution.
create or replace function private.demo_session_allowed() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case
    when u.raw_app_meta_data->>'schovera_demo_run' is null then true
    else coalesce((u.raw_app_meta_data->>'schovera_demo_expires_at')::timestamptz > now(), false)
      and coalesce(u.banned_until <= now(), true)
      and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
    end from auth.users u where u.id=auth.uid()), false)
$$;
revoke all on function private.demo_session_allowed() from public;
grant execute on function private.demo_session_allowed() to authenticated;

create or replace function public.current_user_role() returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select case when private.demo_session_allowed() then
   (select p.role::text from public.profiles p where p.id=auth.uid() and p.active)
 else 'disabled' end
$$;
create or replace function public.current_user_school_id() returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
 select p.school_id from public.profiles p where p.id=auth.uid() and p.active and private.demo_session_allowed()
$$;

-- Restrictive AND policies cover direct auth.uid()-based policies as well as
-- role helpers. SECURITY DEFINER writes still use the checked role helpers.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
   execute format('create policy demo_session_boundary on public.%I as restrictive for all to authenticated using (private.demo_session_allowed()) with check (private.demo_session_allowed())', t.tablename);
 end loop;
end $$;
