-- Reject blank-looking official notices at the authority boundary.
-- Normalization mirrors public.send_student_update without changing notice authorization.
create or replace function public.publish_announcement(
  p_title text,
  p_body text,
  p_priority text default 'normal'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school_id uuid;
  announcement_id uuid;
  clean_title text;
  clean_body text;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;

  clean_title := btrim(p_title, E' \t\n\r');
  clean_body := btrim(p_body, E' \t\n\r');
  if clean_title is null
    or char_length(clean_title) not between 3 and 120
    or char_length(regexp_replace(clean_title, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid title';
  end if;
  if clean_body is null
    or char_length(clean_body) not between 3 and 1000
    or char_length(regexp_replace(clean_body, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid body';
  end if;
  if p_priority not in ('normal', 'important') then raise exception 'invalid priority'; end if;

  actor_school_id := public.current_user_school_id();
  insert into public.announcements(school_id, created_by, title, body, priority)
  values(actor_school_id, auth.uid(), clean_title, clean_body, p_priority)
  returning id into announcement_id;
  insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
  values(actor_school_id, auth.uid(), 'announcement_published', 'announcement', announcement_id);
  return announcement_id;
end $$;

revoke execute on function public.publish_announcement(text, text, text) from public;
grant execute on function public.publish_announcement(text, text, text) to authenticated;
