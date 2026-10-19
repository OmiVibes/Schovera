alter table public.device_event_receipts
  drop constraint device_event_receipts_v2_evidence_check,
  add constraint device_event_receipts_v2_evidence_check check (
    capability_key_id is null or (event_type is not null and event_type in ('check_in','check_out')
      and observed_at is not null and device_sequence is not null and device_sequence > 0)
  );

notify pgrst, 'reload schema';
