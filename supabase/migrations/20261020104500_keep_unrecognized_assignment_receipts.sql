-- Preserve a generic unresolved receipt even when the signed assignment UUID
-- no longer exists. This column remains private and is not a student FK.
alter table public.device_event_receipts
  drop constraint if exists device_event_receipts_credential_assignment_id_fkey;

notify pgrst, 'reload schema';
