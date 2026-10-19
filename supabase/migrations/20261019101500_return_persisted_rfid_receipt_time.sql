-- A first-delivery response reports the exact durable receipt timestamp too;
-- retries already read that timestamp from the existing receipt row.
create or replace function public.process_school_entry_event(
  p_device_id uuid, p_device_event_id uuid, p_credential_ref text,
  p_event_type text, p_observed_at timestamptz, p_device_sequence bigint,
  p_payload_hash text, p_request_nonce uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  device_row public.school_devices; prior public.device_event_receipts;
  credential_row public.student_credentials; receipt_id uuid; event_row_id uuid;
  current_sequence bigint; state text; outcome text; quality text; receipt_received timestamptz;
  credential_found boolean;
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
  quality := case when abs(extract(epoch from (clock_timestamp()-p_observed_at))) <= 600
    then 'within_tolerance' else 'clock_uncertain' end;

  if credential_found and exists(select 1 from public.students where id=credential_row.student_id and active) then
    insert into public.school_entry_events(school_id,student_id,device_id,device_event_id,event_type,
      observed_at,device_sequence,sequence_state,timestamp_quality,credential_version)
    values(device_row.school_id,credential_row.student_id,p_device_id,p_device_event_id,p_event_type,
      p_observed_at,p_device_sequence,state,quality,credential_row.credential_version) returning id into event_row_id;
    outcome := 'accepted';
  else
    outcome := 'unmatched';
  end if;
  insert into public.device_event_receipts(device_id,device_event_id,payload_hash,request_nonce,outcome,sequence_state,event_id)
  values(p_device_id,p_device_event_id,p_payload_hash,p_request_nonce,outcome,state,event_row_id)
  returning id,received_at into receipt_id,receipt_received;
  return jsonb_build_object('receipt_id',receipt_id,'event_id',event_row_id,'outcome',outcome,
    'sequence_state',state,'received_at',receipt_received,'duplicate',false);
end $$;
revoke all on function public.process_school_entry_event(uuid,uuid,text,text,timestamptz,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.process_school_entry_event(uuid,uuid,text,text,timestamptz,bigint,text,uuid) to service_role;
