-- Add a truthful Nano hardware label without changing ingestion, enrollment,
-- RLS, attendance or existing device rows. Prior hardware values remain valid.
begin;
alter table public.school_devices drop constraint school_devices_hardware_type_check;
alter table public.school_devices add constraint school_devices_hardware_type_check
  check (hardware_type in ('esp32_rc522', 'uno_r4_wifi_rc522', 'nano_rc522', 'local_simulator'));

create or replace function public.provision_school_device(
  p_label text, p_hardware_type text, p_verification_public_key text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid; created_id uuid; clean_label text;
begin
  if public.current_user_role() is distinct from 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  clean_label := btrim(p_label, E' \t\n\r');
  if clean_label is null or char_length(clean_label) not between 2 and 100 then raise exception 'invalid device label'; end if;
  if p_hardware_type is null or p_hardware_type not in ('esp32_rc522', 'uno_r4_wifi_rc522', 'nano_rc522', 'local_simulator') then raise exception 'invalid hardware type'; end if;
  if p_verification_public_key is null or char_length(p_verification_public_key) not between 80 and 2000 then raise exception 'invalid verification key'; end if;
  insert into public.school_devices(school_id,label,hardware_type,verification_public_key,created_by)
  values(actor_school,clean_label,p_hardware_type,p_verification_public_key,auth.uid()) returning id into created_id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
  values(actor_school,auth.uid(),'school_device_provisioned','school_device',created_id);
  return created_id;
end $$;
commit;
