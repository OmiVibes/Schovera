-- QA fix: a duplicate acknowledgement request must not create a duplicate audit event.
create or replace function public.acknowledge_update(p_update_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  update_school uuid;
  created_acknowledgement_id uuid;
begin
  if public.current_user_role() <> 'parent' then
    raise exception 'not authorized';
  end if;

  select update_row.school_id into update_school
  from public.student_updates update_row
  join public.parent_student_links link_row
    on link_row.student_id = update_row.student_id
  where update_row.id = p_update_id
    and link_row.parent_id = auth.uid()
    and link_row.status = 'active';
  if update_school is null then
    raise exception 'not authorized';
  end if;

  insert into public.acknowledgements(update_id, parent_id)
  values(p_update_id, auth.uid())
  on conflict(update_id, parent_id) do nothing
  returning id into created_acknowledgement_id;

  if created_acknowledgement_id is not null then
    insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
    values(update_school, auth.uid(), 'student_update_acknowledged', 'student_update', p_update_id);
  end if;
end $$;

revoke execute on function public.acknowledge_update(uuid) from public;
grant execute on function public.acknowledge_update(uuid) to authenticated;
