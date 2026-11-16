-- A same-day class transfer must not make an old-class mark look like a mark
-- for the child's current class. Existing authorized history is not changed.
create or replace function public.parent_classroom_confirmation(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope uuid:=public.current_user_school_id(); day date; saved public.attendance_records;
begin
  if not private.school_operation_session_valid() or public.current_user_role() is distinct from 'parent'
    or not private.current_parent_is_linked_to_student(p_student_id)
    or not exists(select 1 from public.students where id=p_student_id and school_id=scope) then raise exception 'not_authorized'; end if;
  select (now() at time zone timezone)::date into day from public.schools where id=scope;
  select a.* into saved from public.attendance_records a join public.students s on s.id=a.student_id and s.class_id=a.class_id
    where a.student_id=p_student_id and a.school_id=scope and a.attendance_date=day;
  return jsonb_build_object('attendance_date',day,'status',saved.status,'available',saved.id is not null);
end $$;
notify pgrst,'reload schema';
