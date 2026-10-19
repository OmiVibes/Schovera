revoke all on public.rfid_capability_signing_keys from public, anon, authenticated;
grant select on public.rfid_capability_signing_keys to service_role;
grant select, insert, update, delete on public.rfid_capability_signing_keys to service_role;

notify pgrst, 'reload schema';
