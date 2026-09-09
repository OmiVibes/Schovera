-- Phase 2B: official school-wide announcements.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 1000),
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_school_published_idx on public.announcements(school_id, published_at desc);
create index if not exists announcements_creator_idx on public.announcements(created_by, published_at desc);

-- This helper checks the actual child link rather than trusting a browser school value.
create or replace function private.current_parent_has_child_in_school(target_school_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.parent_student_links link_row
    join public.students student_row on student_row.id = link_row.student_id
    where link_row.parent_id = auth.uid()
      and link_row.status = 'active'
      and student_row.school_id = target_school_id
  )
$$;
revoke all on function private.current_parent_has_child_in_school(uuid) from public;
grant execute on function private.current_parent_has_child_in_school(uuid) to authenticated;

alter table public.announcements enable row level security;
drop policy if exists "authorized announcement read" on public.announcements;
create policy "authorized announcement read" on public.announcements for select using (
  (public.current_user_role() in ('teacher', 'principal') and public.same_school(announcements.school_id))
  or private.current_parent_has_child_in_school(announcements.school_id)
);

create or replace function public.publish_announcement(
  p_title text,
  p_body text,
  p_priority text default 'normal'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_school_id uuid;
  announcement_id uuid;
begin
  if public.current_user_role() <> 'principal' then raise exception 'not authorized'; end if;
  if char_length(trim(p_title)) not between 3 and 120 then raise exception 'invalid title'; end if;
  if char_length(trim(p_body)) not between 3 and 1000 then raise exception 'invalid body'; end if;
  if p_priority not in ('normal', 'important') then raise exception 'invalid priority'; end if;
  actor_school_id := public.current_user_school_id();

  insert into public.announcements(school_id, created_by, title, body, priority)
  values(actor_school_id, auth.uid(), trim(p_title), trim(p_body), p_priority)
  returning id into announcement_id;
  insert into public.audit_events(school_id, actor_id, event_type, target_type, target_id)
  values(actor_school_id, auth.uid(), 'announcement_published', 'announcement', announcement_id);
  return announcement_id;
end $$;

revoke execute on function public.publish_announcement(text, text, text) from public;
grant execute on function public.publish_announcement(text, text, text) to authenticated;
