-- QA fix: reject blank/whitespace-only school communication at the authority boundary.
-- This preserves the existing RPC contract, teacher authorization, and tenant checks.
create or replace function public.send_student_update(
  p_class_id uuid,
  p_student_id uuid,
  p_category public.update_category,
  p_title text,
  p_message text,
  p_importance public.update_importance
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
  actor_role text;
  created_update_id uuid;
  clean_title text;
  clean_message text;
begin
  actor_role := public.current_user_role();
  actor_school := public.current_user_school_id();
  if actor_role <> 'teacher' or not exists(
    select 1 from public.teacher_class_assignments assignment_row
    where assignment_row.teacher_id = auth.uid()
      and assignment_row.class_id = p_class_id
      and assignment_row.ended_at is null
  ) then
    raise exception 'not authorized';
  end if;

  clean_title := btrim(p_title, E' \t\n\r');
  clean_message := btrim(p_message, E' \t\n\r');
  if clean_title is null
    or char_length(clean_title) not between 3 and 120
    or char_length(regexp_replace(clean_title, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid title';
  end if;
  if clean_message is null
    or char_length(clean_message) not between 3 and 1000
    or char_length(regexp_replace(clean_message, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid message';
  end if;

  if not exists(
    select 1 from public.students student_row
    where student_row.id = p_student_id
      and student_row.class_id = p_class_id
      and student_row.school_id = actor_school
      and student_row.active
  ) then
    raise exception 'student not in assigned class';
  end if;

  insert into public.student_updates as update_row(
    school_id, class_id, student_id, teacher_id, category, title, message, importance
  ) values (
    actor_school, p_class_id, p_student_id, auth.uid(), p_category,
    clean_title, clean_message, p_importance
  ) returning update_row.id into created_update_id;

  insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
  values(actor_school, auth.uid(), 'student_update_sent', 'student_update', created_update_id);
  return created_update_id;
end $$;

revoke execute on function public.send_student_update(uuid, uuid, public.update_category, text, text, public.update_importance) from public;
grant execute on function public.send_student_update(uuid, uuid, public.update_category, text, text, public.update_importance) to authenticated;
