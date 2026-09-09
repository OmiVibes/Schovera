-- Phase 2A: secure, one-record-per-student-per-day attendance.
do $$ begin
  create type public.attendance_status as enum ('present', 'absent', 'late');
exception when duplicate_object then null;
end $$;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  marked_by uuid not null references public.profiles(id) on delete restrict,
  attendance_date date not null,
  status public.attendance_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, attendance_date)
);

create index if not exists attendance_records_class_date_idx on public.attendance_records(class_id, attendance_date desc);
create index if not exists attendance_records_student_date_idx on public.attendance_records(student_id, attendance_date desc);
create index if not exists attendance_records_school_date_idx on public.attendance_records(school_id, attendance_date desc);

alter table public.attendance_records enable row level security;
drop policy if exists "authorized attendance read" on public.attendance_records;
create policy "authorized attendance read" on public.attendance_records for select using (
  private.current_teacher_is_assigned(attendance_records.class_id)
  or private.current_parent_is_linked_to_student(attendance_records.student_id)
  or (public.current_user_role() = 'principal' and public.same_school(attendance_records.school_id))
);

create or replace function public.save_class_attendance(
  p_class_id uuid,
  p_attendance_date date,
  p_records jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
begin
  if public.current_user_role() <> 'teacher' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  if p_attendance_date is null or p_attendance_date > current_date then raise exception 'invalid attendance date'; end if;
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
