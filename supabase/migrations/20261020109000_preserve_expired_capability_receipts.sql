alter table public.device_event_receipts add column unresolved_reason text;
alter table public.device_event_receipts add constraint device_event_receipts_v2_resolution_reason_check check (
  capability_key_id is null
  or (outcome = 'accepted' and unresolved_reason is null)
  or (outcome = 'unresolved' and unresolved_reason in (
    'capability_outside_validity','capability_key_unavailable','assignment_unavailable','student_inactive'
  ))
);

drop function public.process_school_entry_event_v2(uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,bigint,text,uuid,uuid);
create function public.process_school_entry_event_v2(
  p_device_id uuid, p_device_event_id uuid, p_credential_ref text, p_assignment_id uuid,
  p_assignment_version integer, p_capability_key_id text, p_capability_school_id uuid,
  p_event_type text, p_observed_at timestamptz, p_device_sequence bigint,
  p_payload_hash text, p_request_nonce uuid, p_capability_time_valid boolean, p_gateway_receipt_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  device_row public.school_devices; prior public.device_event_receipts; credential_row public.student_credentials;
  key_row public.rfid_capability_signing_keys; receipt_id uuid; event_row_id uuid; current_sequence bigint;
  state text; outcome text; quality text; receipt_received timestamptz; credential_found boolean; student_active boolean;
  reason text;
begin
  if p_device_event_id is null or p_credential_ref is null or p_assignment_id is null or p_assignment_version is null or p_assignment_version < 1
    or p_capability_key_id is null or p_capability_school_id is null or p_capability_time_valid is null
    or p_event_type not in ('check_in','check_out') or p_device_sequence is null or p_device_sequence < 1
    or p_observed_at is null or p_request_nonce is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid event'; end if;
  select * into device_row from public.school_devices where id=p_device_id for update;
  if not found or not device_row.active then raise exception 'device unavailable'; end if;
  select * into prior from public.device_event_receipts where device_id=p_device_id and device_event_id=p_device_event_id;
  if found then
    if prior.payload_hash <> p_payload_hash then raise exception 'event id conflict'; end if;
    return jsonb_build_object('receipt_id',prior.id,'event_id',prior.event_id,'outcome',prior.outcome,
      'sequence_state',prior.sequence_state,'received_at',prior.received_at,'duplicate',true);
  end if;
  if exists(select 1 from public.device_event_receipts where device_id=p_device_id and request_nonce=p_request_nonce) then raise exception 'request nonce replay'; end if;

  select * into key_row from public.rfid_capability_signing_keys
    where key_id=p_capability_key_id and school_id=device_row.school_id and active for share;
  select * into credential_row from public.student_credentials where id=p_assignment_id for update;
  credential_found := found;
  current_sequence := device_row.last_sequence;
  state := case when current_sequence is null or p_device_sequence=current_sequence+1 then 'in_order'
    when p_device_sequence>current_sequence+1 then 'gap' else 'out_of_order' end;
  if current_sequence is null or p_device_sequence>current_sequence then update public.school_devices set last_sequence=p_device_sequence where id=p_device_id; end if;
  quality := case when abs(extract(epoch from (clock_timestamp()-p_observed_at))) <= 600 then 'within_tolerance' else 'clock_uncertain' end;

  if not p_capability_time_valid then
    outcome := 'unresolved'; reason := 'capability_outside_validity';
  elsif key_row.key_id is null then
    outcome := 'unresolved'; reason := 'capability_key_unavailable';
  elsif not credential_found or credential_row.school_id<>device_row.school_id or credential_row.credential_ref<>p_credential_ref
    or credential_row.credential_version<>p_assignment_version or credential_row.revoked_at is not null
    or p_capability_school_id<>device_row.school_id then
    outcome := 'unresolved'; reason := 'assignment_unavailable';
  else
    select active into student_active from public.students where id=credential_row.student_id and school_id=device_row.school_id for share;
    if not found or not student_active then
      outcome := 'unresolved'; reason := 'student_inactive';
    else
      insert into public.school_entry_events(school_id,student_id,device_id,device_event_id,event_type,observed_at,device_sequence,
        sequence_state,timestamp_quality,credential_version,credential_assignment_id)
      values(device_row.school_id,credential_row.student_id,p_device_id,p_device_event_id,p_event_type,p_observed_at,p_device_sequence,
        state,quality,credential_row.credential_version,credential_row.id) returning id into event_row_id;
      outcome := 'accepted'; reason := null;
    end if;
  end if;

  insert into public.device_event_receipts(device_id,device_event_id,payload_hash,request_nonce,outcome,sequence_state,event_id,
    credential_assignment_id,capability_key_id,gateway_receipt_id,event_type,observed_at,device_sequence,unresolved_reason)
  values(p_device_id,p_device_event_id,p_payload_hash,p_request_nonce,outcome,state,event_row_id,p_assignment_id,p_capability_key_id,
    p_gateway_receipt_id,p_event_type,p_observed_at,p_device_sequence,reason)
  returning id,received_at into receipt_id,receipt_received;
  return jsonb_build_object('receipt_id',receipt_id,'event_id',event_row_id,'outcome',outcome,
    'sequence_state',state,'received_at',receipt_received,'duplicate',false);
end $$;

revoke all on function public.process_school_entry_event_v2(uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,bigint,text,uuid,boolean,uuid) from public, anon, authenticated;
grant execute on function public.process_school_entry_event_v2(uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,bigint,text,uuid,boolean,uuid) to service_role;

notify pgrst, 'reload schema';
