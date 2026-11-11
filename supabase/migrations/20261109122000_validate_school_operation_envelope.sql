-- Validate the public replay boundary even when an authenticated caller bypasses
-- the local capture API. Only the existing authorized inner transaction writes.
create or replace function public.replay_school_operation(p_envelope jsonb,p_payload_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.school_operation_session_valid() then raise exception 'not_authorized'; end if;
  if jsonb_typeof(p_envelope) is distinct from 'object'
    or coalesce(p_envelope->>'kind','') not in ('attendance','update')
    or jsonb_typeof(p_envelope->'payload') is distinct from 'object' then raise exception 'invalid_operation'; end if;
  return public.replay_school_operation_authorized_inner(p_envelope,p_payload_hash);
end $$;
revoke all on function public.replay_school_operation(jsonb,text) from public,anon;
grant execute on function public.replay_school_operation(jsonb,text) to authenticated;
notify pgrst,'reload schema';
