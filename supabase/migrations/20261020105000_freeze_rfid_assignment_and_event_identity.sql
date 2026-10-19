create or replace function private.prevent_rfid_identity_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'school_entry_events' then
    raise exception 'school entry events are immutable';
  end if;
  if old.id is distinct from new.id
    or old.school_id is distinct from new.school_id
    or old.student_id is distinct from new.student_id
    or old.credential_ref is distinct from new.credential_ref
    or old.credential_version is distinct from new.credential_version
    or old.activated_at is distinct from new.activated_at
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at then
    raise exception 'credential assignment identity is immutable';
  end if;
  return new;
end $$;

create trigger school_entry_events_immutable
before update on public.school_entry_events
for each row execute function private.prevent_rfid_identity_mutation();

create trigger student_credentials_identity_immutable
before update on public.student_credentials
for each row execute function private.prevent_rfid_identity_mutation();

revoke all on function private.prevent_rfid_identity_mutation() from public, anon, authenticated;

notify pgrst, 'reload schema';
