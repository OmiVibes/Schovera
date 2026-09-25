-- Task 27: one authoritative, weekday-based timetable per school class.
create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  period_number smallint not null check (period_number > 0 and period_number <= 20),
  subject text not null check (char_length(subject) between 2 and 80),
  start_time time not null,
  end_time time not null,
  room text check (room is null or char_length(room) between 1 and 80),
  created_by uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique(class_id, weekday, period_number)
);
create unique index if not exists timetable_entries_creator_request_idx
  on public.timetable_entries(created_by, client_request_id) where client_request_id is not null;
create index if not exists timetable_entries_school_class_day_idx on public.timetable_entries(school_id, class_id, weekday, start_time);
create index if not exists timetable_entries_teacher_day_idx on public.timetable_entries(teacher_id, weekday, start_time);

alter table public.timetable_entries enable row level security;
create policy "authorized timetable read" on public.timetable_entries for select using (
  (public.current_user_role() = 'principal' and public.same_school(timetable_entries.school_id))
  or private.current_teacher_is_assigned(timetable_entries.class_id)
  or private.current_parent_is_linked_to_class(timetable_entries.class_id)
);

create or replace function public.save_timetable_entry(
  p_entry_id uuid,
  p_class_id uuid,
  p_teacher_id uuid,
  p_weekday smallint,
  p_period_number smallint,
  p_subject text,
  p_start_time time,
  p_end_time time,
  p_room text,
  p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid; clean_subject text; clean_room text; entry_id uuid; existing public.timetable_entries;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  clean_subject := btrim(p_subject, E' \t\n\r'); clean_room := nullif(btrim(coalesce(p_room, ''), E' \t\n\r'), '');
  if clean_subject is null or char_length(clean_subject) not between 2 and 80 or char_length(regexp_replace(clean_subject, '[[:space:]]', '', 'g')) = 0 then raise exception 'invalid subject'; end if;
  if clean_room is not null and char_length(clean_room) > 80 then raise exception 'invalid room'; end if;
  if p_weekday not between 1 and 7 then raise exception 'invalid weekday'; end if;
  if p_period_number is null or p_period_number <= 0 or p_period_number > 20 then raise exception 'invalid period number'; end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then raise exception 'invalid period time'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=actor_school and active) then raise exception 'class not available'; end if;
  if not exists(select 1 from public.profiles where id=p_teacher_id and school_id=actor_school and role='teacher' and active) then raise exception 'teacher not available'; end if;
  if not exists(select 1 from public.teacher_class_assignments where teacher_id=p_teacher_id and class_id=p_class_id and ended_at is null) then raise exception 'teacher is not assigned to class'; end if;
  if p_entry_id is null then
    if p_client_request_id is null then raise exception 'invalid request key'; end if;
    select * into existing from public.timetable_entries where created_by=auth.uid() and client_request_id=p_client_request_id;
    if found then
      if existing.class_id<>p_class_id or existing.teacher_id<>p_teacher_id or existing.weekday<>p_weekday or existing.period_number<>p_period_number or existing.subject<>clean_subject or existing.start_time<>p_start_time or existing.end_time<>p_end_time or existing.room is distinct from clean_room then raise exception 'idempotency conflict'; end if;
      return existing.id;
    end if;
  else
    select * into existing from public.timetable_entries where id=p_entry_id and school_id=actor_school;
    if not found then raise exception 'timetable entry not found'; end if;
  end if;
  if exists(select 1 from public.timetable_entries e where e.class_id=p_class_id and e.weekday=p_weekday and e.id is distinct from p_entry_id and e.start_time < p_end_time and p_start_time < e.end_time) then raise exception 'class timetable overlaps another period'; end if;
  if exists(select 1 from public.timetable_entries e where e.teacher_id=p_teacher_id and e.weekday=p_weekday and e.id is distinct from p_entry_id and e.start_time < p_end_time and p_start_time < e.end_time) then raise exception 'teacher has a timetable conflict'; end if;
  if p_entry_id is null then
    insert into public.timetable_entries(school_id,class_id,teacher_id,weekday,period_number,subject,start_time,end_time,room,created_by,client_request_id)
    values(actor_school,p_class_id,p_teacher_id,p_weekday,p_period_number,clean_subject,p_start_time,p_end_time,clean_room,auth.uid(),p_client_request_id) returning id into entry_id;
    insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_created','timetable_entry',entry_id);
  else
    update public.timetable_entries set class_id=p_class_id,teacher_id=p_teacher_id,weekday=p_weekday,period_number=p_period_number,subject=clean_subject,start_time=p_start_time,end_time=p_end_time,room=clean_room,updated_at=now() where id=p_entry_id returning id into entry_id;
    insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_updated','timetable_entry',entry_id);
  end if;
  return entry_id;
exception when unique_violation then raise exception 'duplicate timetable period';
end $$;

create or replace function public.delete_timetable_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_school uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  if not exists(select 1 from public.timetable_entries where id=p_entry_id and school_id=actor_school) then raise exception 'timetable entry not found'; end if;
  delete from public.timetable_entries where id=p_entry_id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor_school,auth.uid(),'timetable_entry_deleted','timetable_entry',p_entry_id);
end $$;
revoke all on function public.save_timetable_entry(uuid,uuid,uuid,smallint,smallint,text,time,time,text,uuid) from public;
revoke all on function public.delete_timetable_entry(uuid) from public;
grant execute on function public.save_timetable_entry(uuid,uuid,uuid,smallint,smallint,text,time,time,text,uuid) to authenticated;
grant execute on function public.delete_timetable_entry(uuid) to authenticated;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='timetable_entries') then alter publication supabase_realtime add table public.timetable_entries; end if; end $$;
