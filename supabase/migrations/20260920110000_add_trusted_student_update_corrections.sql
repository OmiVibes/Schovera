-- Trusted correction chains preserve sent communication and create a new,
-- linked current record. A -> B -> C is allowed; competing direct children are not.
alter table public.student_updates
  add column if not exists corrects_update_id uuid
  references public.student_updates(id) on delete restrict;

create unique index if not exists student_updates_one_direct_correction_idx
  on public.student_updates(corrects_update_id)
  where corrects_update_id is not null;

create or replace function public.send_student_update_correction(
  p_original_update_id uuid,
  p_title text,
  p_message text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school uuid;
  original_update public.student_updates;
  correction_update_id uuid;
  clean_title text;
  clean_message text;
begin
  if public.current_user_role() <> 'teacher' then
    raise exception 'not authorized';
  end if;
  actor_school := public.current_user_school_id();

  select update_row.* into original_update
  from public.student_updates as update_row
  where update_row.id = p_original_update_id;
  if not found then
    raise exception 'update not found';
  end if;
  if original_update.teacher_id <> auth.uid()
    or original_update.school_id <> actor_school
    or not exists(
      select 1
      from public.teacher_class_assignments as assignment_row
      where assignment_row.teacher_id = auth.uid()
        and assignment_row.class_id = original_update.class_id
        and assignment_row.ended_at is null
    ) then
    raise exception 'not authorized';
  end if;
  if exists(
    select 1
    from public.student_updates as child_update
    where child_update.corrects_update_id = original_update.id
  ) then
    raise exception 'update was already corrected';
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

  begin
    insert into public.student_updates(
      school_id,
      class_id,
      student_id,
      teacher_id,
      category,
      title,
      message,
      importance,
      corrects_update_id
    ) values (
      original_update.school_id,
      original_update.class_id,
      original_update.student_id,
      auth.uid(),
      original_update.category,
      clean_title,
      clean_message,
      original_update.importance,
      original_update.id
    ) returning id into correction_update_id;
  exception when unique_violation then
    raise exception 'update was already corrected';
  end;

  insert into public.audit_events(
    school_id,
    actor_id,
    event_type,
    target_type,
    target_id,
    metadata
  ) values (
    original_update.school_id,
    auth.uid(),
    'student_update_corrected',
    'student_update',
    original_update.id,
    jsonb_build_object('correction_update_id', correction_update_id)
  );

  return correction_update_id;
end $$;

revoke execute on function public.send_student_update_correction(uuid, text, text) from public;
grant execute on function public.send_student_update_correction(uuid, text, text) to authenticated;
