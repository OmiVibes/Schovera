-- Queued work must not use a logged-out bearer session to mutate the destination.
create function private.school_operation_session_valid() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and (u.banned_until is null or u.banned_until<=now()))
$$;
revoke all on function private.school_operation_session_valid() from public,anon,authenticated,service_role;

create function public.school_operation_identity() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not private.school_operation_session_valid() or public.current_user_role()<>'teacher' then raise exception 'not_authorized'; end if;
  return jsonb_build_object('actor_id',auth.uid(),'school_id',public.current_user_school_id());
end $$;
revoke all on function public.school_operation_identity() from public,anon;
grant execute on function public.school_operation_identity() to authenticated;

alter function public.school_operation_baseline(uuid,date) rename to school_operation_baseline_authorized_inner;
revoke all on function public.school_operation_baseline_authorized_inner(uuid,date) from public,anon,authenticated,service_role;
create function public.school_operation_baseline(p_class_id uuid,p_attendance_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.school_operation_session_valid() then raise exception 'not_authorized'; end if;
  return public.school_operation_baseline_authorized_inner(p_class_id,p_attendance_date);
end $$;
revoke all on function public.school_operation_baseline(uuid,date) from public,anon;
grant execute on function public.school_operation_baseline(uuid,date) to authenticated;

alter function public.replay_school_operation(jsonb,text) rename to replay_school_operation_authorized_inner;
revoke all on function public.replay_school_operation_authorized_inner(jsonb,text) from public,anon,authenticated,service_role;
create function public.replay_school_operation(p_envelope jsonb,p_payload_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.school_operation_session_valid() then raise exception 'not_authorized'; end if;
  return public.replay_school_operation_authorized_inner(p_envelope,p_payload_hash);
end $$;
revoke all on function public.replay_school_operation(jsonb,text) from public,anon;
grant execute on function public.replay_school_operation(jsonb,text) to authenticated;
notify pgrst,'reload schema';
