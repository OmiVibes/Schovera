-- Task 25: focused, class-scoped homework assignments.
-- A single assignment serves every active student in its class; parent access is
-- derived from an active parent/student link, never from browser-supplied identity.
create table public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (char_length(subject) between 2 and 80),
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 3 and 1500),
  due_date date not null,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index class_assignments_class_due_idx
  on public.class_assignments(class_id, due_date desc, created_at desc);
create index class_assignments_school_due_idx
  on public.class_assignments(school_id, due_date desc, created_at desc);
create unique index class_assignments_teacher_request_id_idx
  on public.class_assignments(teacher_id, client_request_id)
  where client_request_id is not null;

alter table public.class_assignments enable row level security;
create policy "authorized assignment read" on public.class_assignments for select using (
  private.current_teacher_is_assigned(class_assignments.class_id)
  or private.current_parent_is_linked_to_class(class_assignments.class_id)
  or (public.current_user_role() = 'principal' and public.same_school(class_assignments.school_id))
);

create or replace function public.create_class_assignment(
  p_class_id uuid,
  p_subject text,
  p_title text,
  p_description text,
  p_due_date date,
  p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school_id uuid;
  local_today date;
  created_assignment_id uuid;
  existing_assignment public.class_assignments;
  clean_subject text;
  clean_title text;
  clean_description text;
begin
  if public.current_user_role() <> 'teacher' then
    raise exception 'not authorized';
  end if;
  if p_client_request_id is null then
    raise exception 'invalid request key';
  end if;

  actor_school_id := public.current_user_school_id();
  select (now() at time zone school_row.timezone)::date into local_today
  from public.schools as school_row
  where school_row.id = actor_school_id;

  clean_subject := btrim(p_subject, E' \t\n\r');
  clean_title := btrim(p_title, E' \t\n\r');
  clean_description := btrim(p_description, E' \t\n\r');
  if clean_subject is null
    or char_length(clean_subject) not between 2 and 80
    or char_length(regexp_replace(clean_subject, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid subject';
  end if;
  if clean_title is null
    or char_length(clean_title) not between 3 and 140
    or char_length(regexp_replace(clean_title, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid title';
  end if;
  if clean_description is null
    or char_length(clean_description) not between 3 and 1500
    or char_length(regexp_replace(clean_description, '[[:space:]]', '', 'g')) = 0 then
    raise exception 'invalid description';
  end if;
  if p_due_date is null or p_due_date < local_today then
    raise exception 'invalid due date';
  end if;

  -- Resolve the authenticated Teacher's existing operation before validating a
  -- changed class target, so a reused key cannot silently create another task.
  select assignment_row.* into existing_assignment
  from public.class_assignments as assignment_row
  where assignment_row.teacher_id = auth.uid()
    and assignment_row.client_request_id = p_client_request_id;
  if found then
    if existing_assignment.school_id <> actor_school_id
      or not private.current_teacher_is_assigned(existing_assignment.class_id) then
      raise exception 'not authorized';
    end if;
    if existing_assignment.class_id <> p_class_id
      or existing_assignment.subject <> clean_subject
      or existing_assignment.title <> clean_title
      or existing_assignment.description <> clean_description
      or existing_assignment.due_date <> p_due_date then
      raise exception 'idempotency conflict';
    end if;
    return existing_assignment.id;
  end if;

  if not private.current_teacher_is_assigned(p_class_id) then
    raise exception 'not authorized';
  end if;
  if not exists(
    select 1 from public.classes as class_row
    where class_row.id = p_class_id
      and class_row.school_id = actor_school_id
      and class_row.active
  ) then
    raise exception 'class not available';
  end if;

  insert into public.class_assignments as assignment_row(
    school_id, class_id, teacher_id, subject, title, description, due_date,
    client_request_id
  ) values (
    actor_school_id, p_class_id, auth.uid(), clean_subject, clean_title,
    clean_description, p_due_date, p_client_request_id
  ) on conflict (teacher_id, client_request_id) where client_request_id is not null
    do nothing
  returning assignment_row.id into created_assignment_id;

  if created_assignment_id is not null then
    insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
    values(actor_school_id, auth.uid(), 'class_assignment_created', 'class_assignment', created_assignment_id);
    return created_assignment_id;
  end if;

  select assignment_row.* into existing_assignment
  from public.class_assignments as assignment_row
  where assignment_row.teacher_id = auth.uid()
    and assignment_row.client_request_id = p_client_request_id;
  if not found then
    raise exception 'could not resolve request';
  end if;
  if existing_assignment.school_id <> actor_school_id
    or not private.current_teacher_is_assigned(existing_assignment.class_id) then
    raise exception 'not authorized';
  end if;
  if existing_assignment.class_id <> p_class_id
    or existing_assignment.subject <> clean_subject
    or existing_assignment.title <> clean_title
    or existing_assignment.description <> clean_description
    or existing_assignment.due_date <> p_due_date then
    raise exception 'idempotency conflict';
  end if;
  return existing_assignment.id;
end $$;

revoke execute on function public.create_class_assignment(uuid, text, text, text, date, uuid) from public;
grant execute on function public.create_class_assignment(uuid, text, text, text, date, uuid) to authenticated;

do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_assignments'
  ) then
    alter publication supabase_realtime add table public.class_assignments;
  end if;
end $$;
