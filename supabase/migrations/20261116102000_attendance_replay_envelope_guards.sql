-- A lease baseline must describe one register revision, not a mixture of reads.
create or replace function public.school_operation_baseline(p_class_id uuid,p_attendance_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.attendance_scope(p_class_id,p_attendance_date);
  perform pg_advisory_xact_lock(hashtextextended('school-attendance:'||p_class_id::text||':'||p_attendance_date::text,0));
  return public.school_operation_baseline_authorized_inner(p_class_id,p_attendance_date);
end $$;

-- Validate direct RPC callers as strictly as the local capture adapter. Existing
-- version-1 {records} envelopes remain valid and byte-for-byte unchanged.
create or replace function public.replay_school_operation(p_envelope jsonb,p_payload_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare payload jsonb:=p_envelope->'payload';
begin
  if not private.school_operation_session_valid() then raise exception 'not_authorized'; end if;
  if jsonb_typeof(p_envelope) is distinct from 'object'
    or coalesce(p_envelope->>'kind','') not in ('attendance','update')
    or jsonb_typeof(payload) is distinct from 'object' then raise exception 'invalid_operation'; end if;
  if p_envelope->>'kind'='attendance' then
    if payload ? 'attendance_version' then
      if jsonb_typeof(payload->'attendance_version') is distinct from 'number' or payload->>'attendance_version'<>'2'
        or coalesce(payload->>'action','') not in ('draft','finalize')
        or jsonb_typeof(payload->'expected_revision') is distinct from 'number'
        or coalesce(payload->>'expected_revision','') !~ '^[0-9]{1,9}$'
        or (payload ? 'reason' and jsonb_typeof(payload->'reason') not in ('string','null'))
        or exists(select 1 from jsonb_object_keys(payload) k where k not in ('records','attendance_version','expected_revision','action','reason'))
        then raise exception 'invalid_operation'; end if;
    elsif exists(select 1 from jsonb_object_keys(payload) k where k<>'records') then raise exception 'invalid_operation';
    end if;
  end if;
  return public.replay_school_operation_authorized_inner(p_envelope,p_payload_hash);
end $$;
notify pgrst,'reload schema';
