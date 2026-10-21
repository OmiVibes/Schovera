-- Task 32R: author-only homework edits; existing read policies and grants stay unchanged.
create function public.edit_class_assignment(
  p_assignment_id uuid, p_subject text, p_title text, p_description text,
  p_due_date date, p_expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.class_assignments;
  actor_school uuid;
  local_today date;
  subject_value text := btrim(p_subject, E' \t\n\r');
  title_value text := btrim(p_title, E' \t\n\r');
  description_value text := btrim(p_description, E' \t\n\r');
begin
  if public.current_user_role() is distinct from 'teacher' then raise exception 'not authorized'; end if;
  actor_school := public.current_user_school_id();
  select * into existing from public.class_assignments where id=p_assignment_id for update;
  if not found or existing.teacher_id is distinct from auth.uid() or existing.school_id is distinct from actor_school
    or not private.current_teacher_is_assigned(existing.class_id) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.classes where id=existing.class_id and school_id=actor_school and active) then raise exception 'class not available'; end if;
  select (now() at time zone timezone)::date into local_today from public.schools where id=actor_school;
  if subject_value is null or char_length(subject_value) not between 2 and 80 or subject_value !~ '[^[:space:]]'
    or title_value is null or char_length(title_value) not between 3 and 140 or title_value !~ '[^[:space:]]'
    or description_value is null or char_length(description_value) not between 3 and 1500 or description_value !~ '[^[:space:]]'
    or p_due_date is null or local_today is null or p_due_date < local_today then raise exception 'invalid homework fields or due date'; end if;
  -- A lost response can safely retry the same resulting content without another audit.
  if existing.subject=subject_value and existing.title=title_value and existing.description=description_value and existing.due_date=p_due_date then return existing.id; end if;
  if p_expected_updated_at is distinct from existing.updated_at then raise exception 'homework changed; reload before editing'; end if;
  update public.class_assignments set subject=subject_value,title=title_value,description=description_value,
    due_date=p_due_date,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=existing.id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
    values(actor_school,auth.uid(),'class_assignment_edited','class_assignment',existing.id);
  return existing.id;
end $$;
revoke all on function public.edit_class_assignment(uuid,text,text,text,date,timestamptz) from public;
grant execute on function public.edit_class_assignment(uuid,text,text,text,date,timestamptz) to authenticated;
notify pgrst, 'reload schema';
