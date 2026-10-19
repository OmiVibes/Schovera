-- Task 32B-2: local RFID event registry and immutable, school-scoped observations.
-- This migration deliberately does not publish the event table to Realtime.

create table public.school_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  label text not null check (char_length(label) between 2 and 100),
  hardware_type text not null check (hardware_type in ('esp32_rc522', 'uno_r4_wifi_rc522', 'local_simulator')),
  verification_public_key text not null check (char_length(verification_public_key) between 80 and 2000),
  key_version integer not null default 1 check (key_version > 0),
  last_sequence bigint,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint school_devices_revocation_state check ((active and revoked_at is null) or (not active and revoked_at is not null))
);
alter table public.school_devices add constraint school_devices_id_school_unique unique(id, school_id);
create index school_devices_school_active_idx on public.school_devices(school_id, active);

create table public.student_credentials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  credential_ref text not null check (credential_ref ~ '^[A-Za-z0-9._:-]{1,128}$'),
  credential_version integer not null default 1 check (credential_version > 0),
  activated_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(id, school_id, student_id)
);
alter table public.students add constraint students_id_school_unique unique(id, school_id);
alter table public.student_credentials add constraint student_credentials_student_school_fk
  foreign key (student_id, school_id) references public.students(id, school_id) on delete restrict;
create unique index student_credentials_one_active_ref_idx
  on public.student_credentials(school_id, credential_ref) where revoked_at is null;
create unique index student_credentials_one_active_student_idx
  on public.student_credentials(student_id) where revoked_at is null;
create index student_credentials_active_student_idx
  on public.student_credentials(student_id) where revoked_at is null;

create table public.school_entry_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  device_id uuid not null references public.school_devices(id) on delete restrict,
  device_event_id uuid not null,
  event_type text not null check (event_type in ('check_in', 'check_out')),
  observed_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  device_sequence bigint not null check (device_sequence > 0),
  sequence_state text not null check (sequence_state in ('in_order', 'gap', 'out_of_order')),
  timestamp_quality text not null check (timestamp_quality in ('within_tolerance', 'clock_uncertain')),
  credential_version integer not null check (credential_version > 0),
  created_at timestamptz not null default now(),
  unique(device_id, device_event_id),
  foreign key (device_id, school_id) references public.school_devices(id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students(id, school_id) on delete restrict
);
create index school_entry_events_school_received_idx on public.school_entry_events(school_id, received_at desc);
create index school_entry_events_student_received_idx on public.school_entry_events(student_id, received_at desc);
create index school_entry_events_device_sequence_idx on public.school_entry_events(device_id, device_sequence);

create table public.device_event_receipts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.school_devices(id) on delete restrict,
  device_event_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  request_nonce uuid not null,
  outcome text not null check (outcome in ('accepted', 'unmatched')),
  sequence_state text not null check (sequence_state in ('in_order', 'gap', 'out_of_order')),
  event_id uuid references public.school_entry_events(id) on delete restrict,
  received_at timestamptz not null default clock_timestamp(),
  unique(device_id, device_event_id),
  unique(device_id, request_nonce),
  check ((outcome = 'accepted' and event_id is not null) or (outcome = 'unmatched' and event_id is null))
);
create index device_event_receipts_received_idx on public.device_event_receipts(device_id, received_at desc);

alter table public.school_devices enable row level security;
alter table public.student_credentials enable row level security;
alter table public.school_entry_events enable row level security;
alter table public.device_event_receipts enable row level security;

-- Sensitive registries have no authenticated/anonymous table policies. Event
-- SELECT alone is available to roles, strictly bounded by existing identities.
create policy "authorized school entry event read" on public.school_entry_events
for select to authenticated using (
  (public.current_user_role() = 'principal' and public.same_school(school_entry_events.school_id))
  or (public.current_user_role() = 'teacher' and exists (
    select 1 from public.students s
    where s.id = school_entry_events.student_id
      and private.current_teacher_is_assigned(s.class_id)
  ))
  or (public.current_user_role() = 'parent'
      and private.current_parent_is_linked_to_student(school_entry_events.student_id))
);

revoke all on public.school_devices, public.student_credentials,
  public.school_entry_events, public.device_event_receipts from anon, authenticated;
grant select on public.school_entry_events to authenticated;
grant select on public.school_devices, public.student_credentials, public.device_event_receipts to service_role;
grant select, insert, update, delete on public.school_devices, public.student_credentials,
  public.school_entry_events, public.device_event_receipts to service_role;

create or replace function public.provision_school_device(
  p_label text, p_hardware_type text, p_verification_public_key text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; created_id uuid; clean_label text;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  clean_label := btrim(p_label, E' \t\n\r');
  if clean_label is null or char_length(clean_label) not between 2 and 100 then raise exception 'invalid device label'; end if;
  if p_hardware_type not in ('esp32_rc522', 'uno_r4_wifi_rc522', 'local_simulator') then raise exception 'invalid hardware type'; end if;
  if p_verification_public_key is null or char_length(p_verification_public_key) not between 80 and 2000 then raise exception 'invalid verification key'; end if;
  insert into public.school_devices(school_id,label,hardware_type,verification_public_key,created_by)
  values(actor_school,clean_label,p_hardware_type,p_verification_public_key,auth.uid()) returning id into created_id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
  values(actor_school,auth.uid(),'school_device_provisioned','school_device',created_id);
  return created_id;
end $$;

create or replace function public.revoke_school_device(p_device_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; affected uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  update public.school_devices set active=false, revoked_at=clock_timestamp()
  where id=p_device_id and school_id=actor_school and active returning id into affected;
  if affected is null then
    if exists(select 1 from public.school_devices where id=p_device_id and school_id=actor_school and not active) then return; end if;
    raise exception 'device not found';
  end if;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
  values(actor_school,auth.uid(),'school_device_revoked','school_device',affected);
end $$;

create or replace function public.issue_student_credential(
  p_student_id uuid, p_credential_ref text, p_credential_version integer default 1
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; created_id uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  if p_credential_ref is null or p_credential_ref !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'invalid credential reference'; end if;
  if p_credential_version is null or p_credential_version < 1 then raise exception 'invalid credential version'; end if;
  if not exists(select 1 from public.students where id=p_student_id and school_id=actor_school and active) then raise exception 'student not available'; end if;
  if exists(select 1 from public.student_credentials where school_id=actor_school and student_id=p_student_id and revoked_at is null) then raise exception 'revoke the current credential before replacement'; end if;
  insert into public.student_credentials(school_id,student_id,credential_ref,credential_version,created_by)
  values(actor_school,p_student_id,p_credential_ref,p_credential_version,auth.uid()) returning id into created_id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
  values(actor_school,auth.uid(),'student_credential_issued','student_credential',created_id);
  return created_id;
end $$;

create or replace function public.revoke_student_credential(p_credential_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; affected uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  update public.student_credentials set revoked_at=clock_timestamp()
  where id=p_credential_id and school_id=actor_school and revoked_at is null returning id into affected;
  if affected is null then
    if exists(select 1 from public.student_credentials where id=p_credential_id and school_id=actor_school and revoked_at is not null) then return; end if;
    raise exception 'credential not found';
  end if;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
  values(actor_school,auth.uid(),'student_credential_revoked','student_credential',affected);
end $$;

-- Called only by the local server-side ingestion adapter using service_role.
-- Device row locking serializes retries, nonce checks, sequence observations,
-- and event/receipt writes into one transaction.
create or replace function public.process_school_entry_event(
  p_device_id uuid, p_device_event_id uuid, p_credential_ref text,
  p_event_type text, p_observed_at timestamptz, p_device_sequence bigint,
  p_payload_hash text, p_request_nonce uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  device_row public.school_devices; prior public.device_event_receipts;
  credential_row public.student_credentials; receipt_id uuid; event_row_id uuid;
  current_sequence bigint; state text; outcome text; observed timestamptz;
  quality text; credential_found boolean;
begin
  if p_event_type is null or p_event_type not in ('check_in','check_out') or p_device_sequence is null or p_device_sequence < 1
    or p_observed_at is null or p_request_nonce is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid event';
  end if;
  select * into device_row from public.school_devices where id=p_device_id for update;
  if not found or not device_row.active then raise exception 'device unavailable'; end if;

  select * into prior from public.device_event_receipts
  where device_id=p_device_id and device_event_id=p_device_event_id;
  if found then
    if prior.payload_hash <> p_payload_hash then raise exception 'event id conflict'; end if;
    return jsonb_build_object('receipt_id',prior.id,'event_id',prior.event_id,'outcome',prior.outcome,
      'sequence_state',prior.sequence_state,'received_at',prior.received_at,'duplicate',true);
  end if;
  if exists(select 1 from public.device_event_receipts where device_id=p_device_id and request_nonce=p_request_nonce) then
    raise exception 'request nonce replay';
  end if;

  select * into credential_row from public.student_credentials
  where school_id=device_row.school_id and credential_ref=p_credential_ref and revoked_at is null;
  credential_found := found;
  current_sequence := device_row.last_sequence;
  state := case when current_sequence is null or p_device_sequence=current_sequence+1 then 'in_order'
    when p_device_sequence>current_sequence+1 then 'gap' else 'out_of_order' end;
  if current_sequence is null or p_device_sequence>current_sequence then
    update public.school_devices set last_sequence=p_device_sequence where id=p_device_id;
  end if;
  observed := p_observed_at;
  quality := case when abs(extract(epoch from (clock_timestamp()-observed))) <= 600
    then 'within_tolerance' else 'clock_uncertain' end;

  if credential_found and exists(select 1 from public.students where id=credential_row.student_id and active) then
    insert into public.school_entry_events(school_id,student_id,device_id,device_event_id,event_type,
      observed_at,device_sequence,sequence_state,timestamp_quality,credential_version)
    values(device_row.school_id,credential_row.student_id,p_device_id,p_device_event_id,p_event_type,
      observed,p_device_sequence,state,quality,credential_row.credential_version) returning id into event_row_id;
    outcome := 'accepted';
  else
    outcome := 'unmatched';
  end if;
  insert into public.device_event_receipts(device_id,device_event_id,payload_hash,request_nonce,outcome,sequence_state,event_id)
  values(p_device_id,p_device_event_id,p_payload_hash,p_request_nonce,outcome,state,event_row_id)
  returning id into receipt_id;
  return jsonb_build_object('receipt_id',receipt_id,'event_id',event_row_id,'outcome',outcome,
    'sequence_state',state,'received_at',clock_timestamp(),'duplicate',false);
end $$;

revoke all on function public.provision_school_device(text,text,text) from public, anon;
revoke all on function public.revoke_school_device(uuid) from public, anon;
revoke all on function public.issue_student_credential(uuid,text,integer) from public, anon;
revoke all on function public.revoke_student_credential(uuid) from public, anon;
revoke all on function public.process_school_entry_event(uuid,uuid,text,text,timestamptz,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.provision_school_device(text,text,text) to authenticated;
grant execute on function public.revoke_school_device(uuid) to authenticated;
grant execute on function public.issue_student_credential(uuid,text,integer) to authenticated;
grant execute on function public.revoke_student_credential(uuid) to authenticated;
grant execute on function public.process_school_entry_event(uuid,uuid,text,text,timestamptz,bigint,text,uuid) to service_role;

notify pgrst, 'reload schema';
