create or replace function public.issue_rfid_assignment_capability_claims(
  p_assignment_id uuid, p_device_id uuid, p_key_id text, p_public_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; credential_row public.student_credentials; device_row public.school_devices; key_row public.rfid_capability_signing_keys;
  issued_at bigint; student_active boolean;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  select * into device_row from public.school_devices where id=p_device_id and school_id=actor_school and active for share;
  if not found then raise exception 'device not available'; end if;
  select * into key_row from public.rfid_capability_signing_keys where key_id=p_key_id and school_id=actor_school and active for share;
  if not found or key_row.verification_public_key is distinct from p_public_key then raise exception 'signing key unavailable'; end if;
  select * into credential_row from public.student_credentials where id=p_assignment_id and school_id=actor_school and revoked_at is null for share;
  if not found then raise exception 'credential assignment unavailable'; end if;
  select active into student_active from public.students where id=credential_row.student_id and school_id=actor_school for share;
  if not found or not student_active then raise exception 'credential assignment unavailable'; end if;
  issued_at := floor(extract(epoch from clock_timestamp()))::bigint;
  return jsonb_build_object('token_version',1,'key_id',p_key_id,'assignment_id',credential_row.id,
    'assignment_version',credential_row.credential_version,'credential_ref',credential_row.credential_ref,
    'device_id',device_row.id,'school_id',actor_school,'not_before',issued_at,'expires_at',issued_at+604800);
end $$;

notify pgrst, 'reload schema';
