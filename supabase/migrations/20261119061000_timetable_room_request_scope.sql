-- Follow-up: deny raw unauthorized requests before room existence can affect errors.
create or replace function private.check_timetable_room_conflict() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare room_label text;
begin
  -- PostgREST request roles must be authorized before a privileged room read.
  -- Trusted SQL administrators and server-only fixture/service writes retain
  -- their existing authority; browser direct writes still face unchanged RLS.
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    if public.current_user_role() is distinct from 'principal'
      or not coalesce(public.same_school(new.school_id), false) then
      raise exception 'not authorized';
    end if;
  end if;
  -- A grandfathered collision does not prevent an unrelated subject edit.
  if tg_op = 'UPDATE' and new.school_id = old.school_id
    and new.weekday = old.weekday and new.start_time = old.start_time
    and new.end_time = old.end_time and new.room is not distinct from old.room then
    return new;
  end if;
  room_label := lower(btrim(coalesce(new.room, ''), E' \t\n\r'));
  if room_label = '' then return new; end if;
  -- Same lock namespace as save_timetable_entry: concurrent different-class
  -- writes cannot both accept the same room/time from a pre-write snapshot.
  perform pg_advisory_xact_lock(hashtextextended('schovera-timetable:' || new.weekday::text, 0));
  if exists (
    select 1 from public.timetable_entries e
    where e.school_id = new.school_id and e.weekday = new.weekday
      and e.id is distinct from new.id
      and lower(btrim(coalesce(e.room, ''), E' \t\n\r')) = room_label
      and e.start_time < new.end_time and new.start_time < e.end_time
  ) then raise exception 'room has a timetable conflict'; end if;
  return new;
end $$;
revoke all on function private.check_timetable_room_conflict() from public, anon, authenticated, service_role;
