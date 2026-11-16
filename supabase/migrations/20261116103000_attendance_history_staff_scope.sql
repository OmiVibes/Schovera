-- Correction reasons are staff audit material. M1 does not introduce a Parent
-- history feature or broaden family access to potentially sensitive staff notes.
drop policy "authorized attendance history read" on public.attendance_changes;
create policy "authorized attendance history read" on public.attendance_changes for select to authenticated using (
  public.same_school(school_id) and (public.current_user_role()='principal'
    or exists(select 1 from public.attendance_registers r where r.id=register_id and private.current_teacher_is_assigned(r.class_id)))
);
notify pgrst,'reload schema';
