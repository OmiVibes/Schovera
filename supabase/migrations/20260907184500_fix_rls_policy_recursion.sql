-- Break RLS policy recursion without weakening tenant, parent, or teacher isolation.
-- Relationship checks run as narrowly scoped private SECURITY DEFINER helpers.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_teacher_is_assigned(target_class_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.teacher_class_assignments assignment_row where assignment_row.class_id = target_class_id and assignment_row.teacher_id = auth.uid() and assignment_row.ended_at is null)
$$;
create or replace function private.current_parent_is_linked_to_student(target_student_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.parent_student_links link_row where link_row.student_id = target_student_id and link_row.parent_id = auth.uid() and link_row.status = 'active')
$$;
create or replace function private.current_parent_is_linked_to_class(target_class_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.students student_row join public.parent_student_links link_row on link_row.student_id = student_row.id where student_row.class_id = target_class_id and link_row.parent_id = auth.uid() and link_row.status = 'active')
$$;
create or replace function private.class_is_in_current_school(target_class_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.classes class_row where class_row.id = target_class_id and public.same_school(class_row.school_id))
$$;
create or replace function private.student_is_in_current_school(target_student_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.students student_row where student_row.id = target_student_id and public.same_school(student_row.school_id))
$$;
create or replace function private.current_teacher_authored_update(target_update_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.student_updates update_row where update_row.id = target_update_id and update_row.teacher_id = auth.uid())
$$;
create or replace function private.update_is_in_current_school(target_update_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.student_updates update_row where update_row.id = target_update_id and public.same_school(update_row.school_id))
$$;

revoke all on function private.current_teacher_is_assigned(uuid) from public;
revoke all on function private.current_parent_is_linked_to_student(uuid) from public;
revoke all on function private.current_parent_is_linked_to_class(uuid) from public;
revoke all on function private.class_is_in_current_school(uuid) from public;
revoke all on function private.student_is_in_current_school(uuid) from public;
revoke all on function private.current_teacher_authored_update(uuid) from public;
revoke all on function private.update_is_in_current_school(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_teacher_is_assigned(uuid) to authenticated;
grant execute on function private.current_parent_is_linked_to_student(uuid) to authenticated;
grant execute on function private.current_parent_is_linked_to_class(uuid) to authenticated;
grant execute on function private.class_is_in_current_school(uuid) to authenticated;
grant execute on function private.student_is_in_current_school(uuid) to authenticated;
grant execute on function private.current_teacher_authored_update(uuid) to authenticated;
grant execute on function private.update_is_in_current_school(uuid) to authenticated;

drop policy if exists "assigned or linked class" on public.classes;
drop policy if exists "own assignment" on public.teacher_class_assignments;
drop policy if exists "authorized students" on public.students;
drop policy if exists "own parent links" on public.parent_student_links;
drop policy if exists "authorized updates" on public.student_updates;
drop policy if exists "authorized acknowledgement read" on public.acknowledgements;

create policy "assigned or linked class" on public.classes for select using (
  (public.current_user_role() = 'principal' and public.same_school(classes.school_id))
  or private.current_teacher_is_assigned(classes.id)
  or private.current_parent_is_linked_to_class(classes.id)
);
create policy "own assignment" on public.teacher_class_assignments for select using (
  teacher_class_assignments.teacher_id = auth.uid()
  or (public.current_user_role() = 'principal' and private.class_is_in_current_school(teacher_class_assignments.class_id))
);
create policy "authorized students" on public.students for select using (
  (public.current_user_role() = 'principal' and public.same_school(students.school_id))
  or private.current_teacher_is_assigned(students.class_id)
  or private.current_parent_is_linked_to_student(students.id)
);
create policy "own parent links" on public.parent_student_links for select using (
  parent_student_links.parent_id = auth.uid()
  or (public.current_user_role() = 'principal' and private.student_is_in_current_school(parent_student_links.student_id))
);
create policy "authorized updates" on public.student_updates for select using (
  (public.current_user_role() = 'principal' and public.same_school(student_updates.school_id))
  or student_updates.teacher_id = auth.uid()
  or private.current_parent_is_linked_to_student(student_updates.student_id)
);
create policy "authorized acknowledgement read" on public.acknowledgements for select using (
  acknowledgements.parent_id = auth.uid()
  or private.current_teacher_authored_update(acknowledgements.update_id)
  or (public.current_user_role() = 'principal' and private.update_is_in_current_school(acknowledgements.update_id))
);
