-- Mark simulator events from registered device metadata. Historical and
-- non-simulator events remain unverified: device type alone cannot prove a
-- physical card was presented. No historical row is inferred.
begin;

alter table public.school_entry_events
  add column source_kind text not null default 'historical_unknown'
  check (source_kind in ('physical', 'simulated', 'historical_unknown'));

create or replace function private.classify_school_entry_event_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  registered_hardware text;
begin
  select d.hardware_type into registered_hardware
  from public.school_devices as d
  where d.id = new.device_id and d.school_id = new.school_id and d.active;

  if not found then
    raise exception 'school entry device is not active in this school';
  end if;

  if registered_hardware = 'local_simulator' then
    new.source_kind := 'simulated';
  else
    new.source_kind := 'historical_unknown';
  end if;

  return new;
end;
$$;

revoke all on function private.classify_school_entry_event_source()
  from public, anon, authenticated, service_role;

create trigger classify_school_entry_event_source_before_insert
before insert on public.school_entry_events
for each row execute function private.classify_school_entry_event_source();

commit;
