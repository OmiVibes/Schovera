-- Task 29: authoritative retry safety, a coherent school week, and school-local attendance dates.

alter table public.announcements
  add column if not exists client_request_id uuid;
create unique index if not exists announcements_creator_request_id_idx
  on public.announcements(created_by, client_request_id)
  where client_request_id is not null;

drop function if exists public.publish_announcement(text, text, text);
create function public.publish_announcement(
  p_title text,
  p_body text,
  p_priority text,
  p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school_id uuid;
  announcement_id uuid;
  existing_announcement public.announcements;
  clean_title text;
  clean_body text;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  if p_client_request_id is null then raise exception 'invalid request key'; end if;

  clean_title := btrim(p_title, E' \t\n\r');
  clean_body := btrim(p_body, E' \t\n\r');
  if clean_title is null or char_length(clean_title) not between 3 and 120
    or char_length(regexp_replace(clean_title, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid title';
  end if;
  if clean_body is null or char_length(clean_body) not between 3 and 1000
    or char_length(regexp_replace(clean_body, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid body';
  end if;
  if p_priority not in ('normal', 'important') then raise exception 'invalid priority'; end if;
  actor_school_id := public.current_user_school_id();

  select * into existing_announcement
  from public.announcements
  where created_by = auth.uid() and client_request_id = p_client_request_id;
  if found then
    if existing_announcement.school_id <> actor_school_id then raise exception 'not authorized'; end if;
    if existing_announcement.title <> clean_title
      or existing_announcement.body <> clean_body
      or existing_announcement.priority <> p_priority then
      raise exception 'idempotency conflict';
    end if;
    return existing_announcement.id;
  end if;

  insert into public.announcements(school_id, created_by, title, body, priority, client_request_id)
  values(actor_school_id, auth.uid(), clean_title, clean_body, p_priority, p_client_request_id)
  on conflict (created_by, client_request_id) where client_request_id is not null do nothing
  returning id into announcement_id;

  if announcement_id is not null then
    insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
    values(actor_school_id, auth.uid(), 'announcement_published', 'announcement', announcement_id);
    return announcement_id;
  end if;

  -- A concurrent request with the same key won the insert. Re-read and validate
  -- the canonical payload; only the inserting transaction writes the audit.
  select * into existing_announcement
  from public.announcements
  where created_by = auth.uid() and client_request_id = p_client_request_id;
  if not found then raise exception 'could not resolve request'; end if;
  if existing_announcement.school_id <> actor_school_id then raise exception 'not authorized'; end if;
  if existing_announcement.title <> clean_title
    or existing_announcement.body <> clean_body
    or existing_announcement.priority <> p_priority then
    raise exception 'idempotency conflict';
  end if;
  return existing_announcement.id;
end $$;
revoke execute on function public.publish_announcement(text, text, text, uuid) from public;
grant execute on function public.publish_announcement(text, text, text, uuid) to authenticated;

-- The demo school and timetable UI are designed for a Monday-Saturday school
-- week. Sunday remains a no-school day at the database boundary as well.
alter table public.timetable_entries drop constraint if exists timetable_entries_weekday_check;
alter table public.timetable_entries add constraint timetable_entries_weekday_check
  check (weekday between 1 and 6);

drop function if exists public.save_timetable_entry(uuid, uuid, uuid, smallint, smallint, text, time, time, text, uuid);
create function public.save_timetable_entry(
  p_entry_id uuid,
  p_class_id uuid,
  p_teacher_id uuid,
  p_weekday smallint,
  p_period_number smallint,
  p_subject text,
  p_start_time time,
  p_end_time time,
  p_room text,
  p_client_request_id uuid,
  p_expected_updated_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
  clean_subject text;
  clean_room text;
  entry_id uuid;
  existing public.timetable_entries;
  lock_weekday smallint;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  clean_subject := btrim(p_subject, E' \t\n\r');
  clean_room := nullif(btrim(coalesce(p_room, ''), E' \t\n\r'), '');
  if clean_subject is null or char_length(clean_subject) not between 2 and 80
    or char_length(regexp_replace(clean_subject, '[[:space:]]', '', 'g')) = 0 then raise exception 'invalid subject'; end if;
  if clean_room is not null and char_length(clean_room) > 80 then raise exception 'invalid room'; end if;
  if p_weekday not between 1 and 6 then raise exception 'invalid weekday'; end if;
  if p_period_number is null or p_period_number <= 0 or p_period_number > 20 then raise exception 'invalid period number'; end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then raise exception 'invalid period time'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=actor_school and active) then raise exception 'class not available'; end if;
  if not exists(select 1 from public.profiles where id=p_teacher_id and school_id=actor_school and role='teacher' and active) then raise exception 'teacher not available'; end if;
  if not exists(select 1 from public.teacher_class_assignments where teacher_id=p_teacher_id and class_id=p_class_id and ended_at is null) then raise exception 'teacher is not assigned to class'; end if;

  if p_entry_id is null then
    if p_client_request_id is null then raise exception 'invalid request key'; end if;
    select * into existing from public.timetable_entries where created_by=auth.uid() and client_request_id=p_client_request_id;
    if found then
      if existing.school_id <> actor_school then raise exception 'not authorized'; end if;
      if existing.class_id<>p_class_id or existing.teacher_id<>p_teacher_id or existing.weekday<>p_weekday or existing.period_number<>p_period_number or existing.subject<>clean_subject or existing.start_time<>p_start_time or existing.end_time<>p_end_time or existing.room is distinct from clean_room then raise exception 'idempotency conflict'; end if;
      return existing.id;
    end if;
  else
    select * into existing from public.timetable_entries where id=p_entry_id and school_id=actor_school;
    if not found then raise exception 'timetable entry not found'; end if;
    -- A successful edit retried with its original version is an acknowledgement
    -- of the persisted result, not a second update/audit event.
    if existing.class_id=p_class_id and existing.teacher_id=p_teacher_id and existing.weekday=p_weekday and existing.period_number=p_period_number and existing.subject=clean_subject and existing.start_time=p_start_time and existing.end_time=p_end_time and existing.room is not distinct from clean_room then
      return existing.id;
    end if;
    if p_expected_updated_at is null then raise exception 'expected timetable version is required'; end if;
    if existing.updated_at is distinct from p_expected_updated_at then raise exception 'timetable entry changed; reload before editing'; end if;
  end if;

  -- Serialize mutations for the affected weekday(s), so two principals cannot
  -- both pass the overlap checks against the same pre-write snapshot.
  for lock_weekday in
    select distinct requested_day
    from unnest(array[p_weekday, case when p_entry_id is null then null else existing.weekday end]) as requested(requested_day)
    where requested_day is not null
    order by requested_day
  loop
    perform pg_advisory_xact_lock(hashtextextended('schovera-timetable:' || lock_weekday::text, 0));
  end loop;

  -- Another same-key create may have completed while this request waited on
  -- the weekday lock. Resolve that request before treating its period as a
  -- conflicting independent timetable entry.
  if p_entry_id is null then
    select * into existing from public.timetable_entries where created_by=auth.uid() and client_request_id=p_client_request_id;
    if found then
      if existing.school_id <> actor_school then raise exception 'not authorized'; end if;
      if existing.class_id<>p_class_id or existing.teacher_id<>p_teacher_id or existing.weekday<>p_weekday or existing.period_number<>p_period_number or existing.subject<>clean_subject or existing.start_time<>p_start_time or existing.end_time<>p_end_time or existing.room is distinct from clean_room then raise exception 'idempotency conflict'; end if;
      return existing.id;
    end if;
  else
    select * into existing from public.timetable_entries where id=p_entry_id and school_id=actor_school for update;
    if not found then raise exception 'timetable entry not found'; end if;
    if existing.class_id=p_class_id and existing.teacher_id=p_teacher_id and existing.weekday=p_weekday and existing.period_number=p_period_number and existing.subject=clean_subject and existing.start_time=p_start_time and existing.end_time=p_end_time and existing.room is not distinct from clean_room then
      return existing.id;
    end if;
    if existing.updated_at is distinct from p_expected_updated_at then raise exception 'timetable entry changed; reload before editing'; end if;
  end if;

  if exists(select 1 from public.timetable_entries e where e.class_id=p_class_id and e.weekday=p_weekday and e.id is distinct from p_entry_id and e.start_time < p_end_time and p_start_time < e.end_time) then raise exception 'class timetable overlaps another period'; end if;
  if exists(select 1 from public.timetable_entries e where e.teacher_id=p_teacher_id and e.weekday=p_weekday and e.id is distinct from p_entry_id and e.start_time < p_end_time and p_start_time < e.end_time) then raise exception 'teacher has a timetable conflict'; end if;

  if p_entry_id is null then
    insert into public.timetable_entries(school_id,class_id,teacher_id,weekday,period_number,subject,start_time,end_time,room,created_by,client_request_id)
    values(actor_school,p_class_id,p_teacher_id,p_weekday,p_period_number,clean_subject,p_start_time,p_end_time,clean_room,auth.uid(),p_client_request_id)
    on conflict (created_by, client_request_id) where client_request_id is not null do nothing
    returning id into entry_id;
    if entry_id is null then
      select * into existing from public.timetable_entries where created_by=auth.uid() and client_request_id=p_client_request_id;
      if not found then raise exception 'duplicate timetable period'; end if;
      if existing.school_id <> actor_school then raise exception 'not authorized'; end if;
      if existing.class_id<>p_class_id or existing.teacher_id<>p_teacher_id or existing.weekday<>p_weekday or existing.period_number<>p_period_number or existing.subject<>clean_subject or existing.start_time<>p_start_time or existing.end_time<>p_end_time or existing.room is distinct from clean_room then raise exception 'idempotency conflict'; end if;
      return existing.id;
    end if;
    insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_created','timetable_entry',entry_id);
  else
    update public.timetable_entries set class_id=p_class_id,teacher_id=p_teacher_id,weekday=p_weekday,period_number=p_period_number,subject=clean_subject,start_time=p_start_time,end_time=p_end_time,room=clean_room,updated_at=greatest(clock_timestamp(), updated_at + interval '1 microsecond')
    where id=p_entry_id and school_id=actor_school and updated_at=p_expected_updated_at
    returning id into entry_id;
    if entry_id is null then raise exception 'timetable entry changed; reload before editing'; end if;
    insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_updated','timetable_entry',entry_id);
  end if;
  return entry_id;
exception when unique_violation then raise exception 'duplicate timetable period';
end $$;
revoke all on function public.save_timetable_entry(uuid,uuid,uuid,smallint,smallint,text,time,time,text,uuid,timestamptz) from public;
grant execute on function public.save_timetable_entry(uuid,uuid,uuid,smallint,smallint,text,time,time,text,uuid,timestamptz) to authenticated;

create or replace function public.delete_timetable_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
  deleted_entry_id uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  delete from public.timetable_entries where id=p_entry_id and school_id=actor_school returning id into deleted_entry_id;
  if deleted_entry_id is null then
    if exists(select 1 from public.audit_events where school_id=actor_school and actor_id=auth.uid() and event_type='timetable_entry_deleted' and target_id=p_entry_id) then return; end if;
    raise exception 'timetable entry not found';
  end if;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_deleted','timetable_entry',deleted_entry_id);
end $$;
revoke all on function public.delete_timetable_entry(uuid) from public;
grant execute on function public.delete_timetable_entry(uuid) to authenticated;

create or replace function public.save_class_attendance(
  p_class_id uuid,
  p_attendance_date date,
  p_records jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
  local_today date;
begin
  if public.current_user_role() <> 'teacher' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  select (now() at time zone school_row.timezone)::date into local_today
  from public.schools school_row where school_row.id=actor_school;
  if actor_school is null or local_today is null then raise exception 'not authorized'; end if;
  if p_attendance_date is null or p_attendance_date > local_today then raise exception 'invalid attendance date'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception 'attendance records are required'; end if;
  if not private.current_teacher_is_assigned(p_class_id) then raise exception 'not authorized'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) entry
    where not (entry ? 'student_id') or not (entry ? 'status')
      or (entry->>'status') not in ('present', 'absent', 'late')
  ) then raise exception 'invalid attendance record'; end if;
  if exists (
    select entry->>'student_id' from jsonb_array_elements(p_records) entry
    group by entry->>'student_id' having count(*) > 1
  ) then raise exception 'duplicate student in attendance payload'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) entry
    where not exists (
      select 1 from public.students student_row
      where student_row.id = (entry->>'student_id')::uuid
        and student_row.class_id = p_class_id
        and student_row.school_id = actor_school
        and student_row.active = true
    )
  ) then raise exception 'student not in assigned active class'; end if;
  if (select count(*) from jsonb_array_elements(p_records)) <> (
    select count(*) from public.students student_row where student_row.class_id = p_class_id and student_row.school_id = actor_school and student_row.active = true
  ) then raise exception 'attendance must include every active student in the class'; end if;

  insert into public.attendance_records(school_id, class_id, student_id, marked_by, attendance_date, status)
  select actor_school, p_class_id, (entry->>'student_id')::uuid, auth.uid(), p_attendance_date, (entry->>'status')::public.attendance_status
  from jsonb_array_elements(p_records) entry
  on conflict(student_id, attendance_date) do update set
    school_id = excluded.school_id,
    class_id = excluded.class_id,
    marked_by = excluded.marked_by,
    status = excluded.status,
    updated_at = now();

  insert into public.audit_events(school_id, actor_id, event_type, target_type, metadata)
  values(actor_school, auth.uid(), 'attendance_saved', 'attendance_class_day', jsonb_build_object('class_id', p_class_id, 'attendance_date', p_attendance_date));
end $$;
revoke execute on function public.save_class_attendance(uuid, date, jsonb) from public;
grant execute on function public.save_class_attendance(uuid, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
