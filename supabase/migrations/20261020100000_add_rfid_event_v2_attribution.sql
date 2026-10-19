-- Task 32G: assignment-bound local event v2. Existing v1 rows remain untouched.

create table public.rfid_capability_signing_keys (
  key_id text not null check (key_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  school_id uuid not null references public.schools(id) on delete restrict,
  verification_public_key text not null check (char_length(verification_public_key) between 80 and 2000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  constraint rfid_capability_signing_keys_revocation_state check ((active and revoked_at is null) or (not active and revoked_at is not null)),
  primary key(key_id, school_id)
);
alter table public.rfid_capability_signing_keys enable row level security;
revoke all on public.rfid_capability_signing_keys from public, anon, authenticated;
grant select on public.rfid_capability_signing_keys to service_role;
grant select, insert, update, delete on public.rfid_capability_signing_keys to service_role;

alter table public.school_entry_events
  add column credential_assignment_id uuid references public.student_credentials(id) on delete restrict;
-- Existing v1 events retain NULL here. New v2 accepted events always set it.
create index school_entry_events_assignment_idx on public.school_entry_events(credential_assignment_id) where credential_assignment_id is not null;

alter table public.device_event_receipts
  drop constraint device_event_receipts_outcome_check,
  add constraint device_event_receipts_outcome_check check (outcome in ('accepted', 'unmatched', 'unresolved')),
  drop constraint device_event_receipts_check,
  add constraint device_event_receipts_check check (
    (outcome = 'accepted' and event_id is not null)
    or (outcome in ('unmatched', 'unresolved') and event_id is null)
  ),
  add column credential_assignment_id uuid,
  add column capability_key_id text,
  add column gateway_receipt_id uuid,
  add column event_type text,
  add column observed_at timestamptz,
  add column device_sequence bigint,
  add constraint device_event_receipts_v2_evidence_check check (
    capability_key_id is null or (event_type is not null and event_type in ('check_in','check_out')
      and observed_at is not null and device_sequence is not null and device_sequence > 0)
  );

create or replace function public.register_rfid_capability_key(p_key_id text, p_public_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  if p_key_id is null or p_key_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_public_key is null or char_length(p_public_key) not between 80 and 2000 then raise exception 'invalid signing key'; end if;
  if exists(select 1 from public.rfid_capability_signing_keys where key_id=p_key_id and school_id=actor_school) then raise exception 'signing key id already exists'; end if;
  insert into public.rfid_capability_signing_keys(key_id,school_id,verification_public_key,created_by)
  values(p_key_id,actor_school,p_public_key,auth.uid());
  insert into public.audit_events(school_id,actor_id,event_type,target_type,metadata)
  values(actor_school,auth.uid(),'rfid_capability_key_registered','rfid_capability_key',jsonb_build_object('key_id',p_key_id));
end $$;

create or replace function public.revoke_rfid_capability_key(p_key_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; affected text;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  update public.rfid_capability_signing_keys set active=false, revoked_at=clock_timestamp()
  where key_id=p_key_id and school_id=actor_school and active returning key_id into affected;
  if affected is null then
    if exists(select 1 from public.rfid_capability_signing_keys where key_id=p_key_id and school_id=actor_school and not active) then return; end if;
    raise exception 'signing key not found';
  end if;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,metadata)
  values(actor_school,auth.uid(),'rfid_capability_key_revoked','rfid_capability_key',jsonb_build_object('key_id',p_key_id));
end $$;

-- Returns opaque assignment/device claims only. It never returns student identity.
create or replace function public.issue_rfid_assignment_capability_claims(
  p_assignment_id uuid, p_device_id uuid, p_key_id text, p_public_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; credential_row public.student_credentials; device_row public.school_devices; key_row public.rfid_capability_signing_keys;
  issued_at bigint; claims jsonb; student_active boolean;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  select * into device_row from public.school_devices where id=p_device_id and school_id=actor_school and active;
  if not found then raise exception 'device not available'; end if;
  select * into key_row from public.rfid_capability_signing_keys where key_id=p_key_id and school_id=actor_school and active for share;
  if not found or key_row.verification_public_key is distinct from p_public_key then raise exception 'signing key unavailable'; end if;
  select * into credential_row from public.student_credentials where id=p_assignment_id and school_id=actor_school and revoked_at is null for share;
  if not found then raise exception 'credential assignment unavailable'; end if;
  select active into student_active from public.students where id=credential_row.student_id and school_id=actor_school for share;
  if not found or not student_active then raise exception 'credential assignment unavailable'; end if;
  issued_at := floor(extract(epoch from clock_timestamp()))::bigint;
  claims := jsonb_build_object('token_version',1,'key_id',p_key_id,'assignment_id',credential_row.id,
    'assignment_version',credential_row.credential_version,'credential_ref',credential_row.credential_ref,
    'device_id',device_row.id,'school_id',actor_school,'not_before',issued_at,'expires_at',issued_at+604800);
  return claims;
end $$;

create or replace function public.process_school_entry_event_v2(
  p_device_id uuid,
  p_device_event_id uuid,
  p_credential_ref text,
  p_assignment_id uuid,
  p_assignment_version integer,
  p_capability_key_id text,
  p_capability_school_id uuid,
  p_event_type text,
  p_observed_at timestamptz,
  p_device_sequence bigint,
  p_payload_hash text,
  p_request_nonce uuid,
  p_gateway_receipt_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  device_row public.school_devices; prior public.device_event_receipts; credential_row public.student_credentials;
  key_row public.rfid_capability_signing_keys; receipt_id uuid; event_row_id uuid; current_sequence bigint;
  state text; outcome text; quality text; receipt_received timestamptz; credential_found boolean; student_active boolean;
begin
  if p_device_event_id is null or p_credential_ref is null or p_assignment_id is null or p_assignment_version is null or p_assignment_version < 1
    or p_capability_key_id is null or p_event_type not in ('check_in','check_out') or p_device_sequence is null or p_device_sequence < 1
    or p_observed_at is null or p_request_nonce is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid event';
  end if;
  select * into device_row from public.school_devices where id=p_device_id for update;
  if not found or not device_row.active then raise exception 'device unavailable'; end if;
  select * into prior from public.device_event_receipts where device_id=p_device_id and device_event_id=p_device_event_id;
  if found then
    if prior.payload_hash <> p_payload_hash then raise exception 'event id conflict'; end if;
    return jsonb_build_object('receipt_id',prior.id,'event_id',prior.event_id,'outcome',prior.outcome,
      'sequence_state',prior.sequence_state,'received_at',prior.received_at,'duplicate',true);
  end if;
  if exists(select 1 from public.device_event_receipts where device_id=p_device_id and request_nonce=p_request_nonce) then raise exception 'request nonce replay'; end if;

  -- Locking the key and exact assignment serializes key/credential revocation against sync.
  select * into key_row from public.rfid_capability_signing_keys
    where key_id=p_capability_key_id and school_id=device_row.school_id and active for share;
  select * into credential_row from public.student_credentials where id=p_assignment_id for update;
  credential_found := found and credential_row.school_id=device_row.school_id and credential_row.credential_ref=p_credential_ref
    and credential_row.credential_version=p_assignment_version and credential_row.revoked_at is null
    and p_capability_school_id=device_row.school_id and key_row.key_id is not null;

  current_sequence := device_row.last_sequence;
  state := case when current_sequence is null or p_device_sequence=current_sequence+1 then 'in_order'
    when p_device_sequence>current_sequence+1 then 'gap' else 'out_of_order' end;
  if current_sequence is null or p_device_sequence>current_sequence then update public.school_devices set last_sequence=p_device_sequence where id=p_device_id; end if;
  quality := case when abs(extract(epoch from (clock_timestamp()-p_observed_at))) <= 600 then 'within_tolerance' else 'clock_uncertain' end;
  student_active := false;
  if credential_found then
    select active into student_active from public.students where id=credential_row.student_id and school_id=device_row.school_id for share;
  end if;
  if credential_found and student_active then
    insert into public.school_entry_events(school_id,student_id,device_id,device_event_id,event_type,observed_at,device_sequence,
      sequence_state,timestamp_quality,credential_version,credential_assignment_id)
    values(device_row.school_id,credential_row.student_id,p_device_id,p_device_event_id,p_event_type,p_observed_at,p_device_sequence,
      state,quality,credential_row.credential_version,credential_row.id) returning id into event_row_id;
    outcome := 'accepted';
  else
    outcome := 'unresolved';
  end if;
  insert into public.device_event_receipts(device_id,device_event_id,payload_hash,request_nonce,outcome,sequence_state,event_id,
    credential_assignment_id,capability_key_id,gateway_receipt_id,event_type,observed_at,device_sequence)
  values(p_device_id,p_device_event_id,p_payload_hash,p_request_nonce,outcome,state,event_row_id,p_assignment_id,p_capability_key_id,
    p_gateway_receipt_id,p_event_type,p_observed_at,p_device_sequence)
  returning id,received_at into receipt_id,receipt_received;
  return jsonb_build_object('receipt_id',receipt_id,'event_id',event_row_id,'outcome',outcome,
    'sequence_state',state,'received_at',receipt_received,'duplicate',false);
end $$;

revoke all on function public.register_rfid_capability_key(text,text) from public, anon;
revoke all on function public.revoke_rfid_capability_key(text) from public, anon;
revoke all on function public.issue_rfid_assignment_capability_claims(uuid,uuid,text,text) from public, anon;
revoke all on function public.process_school_entry_event_v2(uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,bigint,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.register_rfid_capability_key(text,text) to authenticated;
grant execute on function public.revoke_rfid_capability_key(text) to authenticated;
grant execute on function public.issue_rfid_assignment_capability_claims(uuid,uuid,text,text) to authenticated;
grant execute on function public.process_school_entry_event_v2(uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,bigint,text,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
