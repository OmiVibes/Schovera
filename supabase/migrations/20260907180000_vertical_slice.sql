-- Schovera Phase 1: authenticated, multi-school communication vertical slice.
create extension if not exists pgcrypto;

create type public.app_role as enum ('teacher', 'parent', 'principal');
create type public.update_category as enum ('academic', 'attendance', 'achievement', 'behaviour', 'homework_task', 'general');
create type public.update_importance as enum ('normal', 'important');

create table public.schools (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 160),
  code text not null unique, timezone text not null default 'Asia/Kolkata', logo_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, school_id uuid not null references public.schools(id) on delete restrict,
  role public.app_role not null, full_name text not null check (char_length(full_name) between 2 and 120), email text not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, email)
);
create table public.classes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  grade text not null, division text not null, academic_year text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, grade, division, academic_year)
);
create table public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict, assigned_at timestamptz not null default now(), ended_at timestamptz,
  unique (teacher_id, class_id)
);
create table public.students (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict, roll_number text not null, full_name text not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (class_id, roll_number)
);
create table public.parent_student_links (
  id uuid primary key default gen_random_uuid(), parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict, relationship_label text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(parent_id, student_id)
);
create table public.student_updates (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict, student_id uuid not null references public.students(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict, category public.update_category not null,
  title text not null check (char_length(title) between 3 and 120), message text not null check (char_length(message) between 3 and 1000),
  importance public.update_importance not null default 'normal', status text not null default 'sent' check (status in ('sent','archived')),
  sent_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.acknowledgements (
  id uuid primary key default gen_random_uuid(), update_id uuid not null references public.student_updates(id) on delete restrict,
  parent_id uuid not null references public.profiles(id) on delete restrict, acknowledged_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(update_id, parent_id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null, event_type text not null, target_type text not null,
  target_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index student_updates_student_sent_idx on public.student_updates(student_id, sent_at desc);
create index student_updates_school_sent_idx on public.student_updates(school_id, sent_at desc);
create index parent_links_parent_idx on public.parent_student_links(parent_id, status);
create index acknowledgement_update_idx on public.acknowledgements(update_id, acknowledged_at);

create or replace function public.current_profile() returns public.profiles language sql stable security definer set search_path = public, pg_temp as $$
  select profile_row.* from public.profiles as profile_row where profile_row.id = auth.uid() and profile_row.active = true
$$;
create or replace function public.same_school(target_school uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.active and p.school_id = target_school)
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.students enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.student_updates enable row level security;
alter table public.acknowledgements enable row level security;
alter table public.audit_events enable row level security;

create policy "own school" on public.schools for select using (public.same_school(schools.id));
create policy "own profile" on public.profiles for select using (profiles.id = auth.uid() or ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and public.same_school(profiles.school_id)));
create policy "assigned or linked class" on public.classes for select using (
  ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and public.same_school(classes.school_id)) or
  exists(select 1 from public.teacher_class_assignments a where a.class_id = classes.id and a.teacher_id = auth.uid() and a.ended_at is null) or
  exists(select 1 from public.students s join public.parent_student_links l on l.student_id = s.id where s.class_id = classes.id and l.parent_id = auth.uid() and l.status = 'active')
);
create policy "own assignment" on public.teacher_class_assignments for select using (teacher_class_assignments.teacher_id = auth.uid() or ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and exists(select 1 from public.classes c where c.id = teacher_class_assignments.class_id and public.same_school(c.school_id))));
create policy "authorized students" on public.students for select using (
  ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and public.same_school(students.school_id)) or
  exists(select 1 from public.teacher_class_assignments a where a.class_id=students.class_id and a.teacher_id=auth.uid() and a.ended_at is null) or
  exists(select 1 from public.parent_student_links l where l.student_id=students.id and l.parent_id=auth.uid() and l.status='active')
);
create policy "own parent links" on public.parent_student_links for select using (parent_student_links.parent_id = auth.uid() or ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and exists(select 1 from public.students s where s.id = parent_student_links.student_id and public.same_school(s.school_id))));
create policy "authorized updates" on public.student_updates for select using (
  ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and public.same_school(student_updates.school_id)) or student_updates.teacher_id = auth.uid() or
  exists(select 1 from public.parent_student_links l where l.student_id=student_updates.student_id and l.parent_id=auth.uid() and l.status='active')
);
create policy "authorized acknowledgement read" on public.acknowledgements for select using (
  acknowledgements.parent_id = auth.uid() or exists(select 1 from public.student_updates u where u.id = acknowledgements.update_id and (u.teacher_id = auth.uid() or ((select current_user_profile.role from public.current_profile() as current_user_profile) = 'principal' and public.same_school(u.school_id))))
);

create or replace function public.send_student_update(p_class_id uuid, p_student_id uuid, p_category public.update_category, p_title text, p_message text, p_importance public.update_importance)
returns public.student_updates language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; result public.student_updates;
begin
  select * into actor from public.current_profile();
  if actor.role <> 'teacher' or not exists(select 1 from public.teacher_class_assignments assignment_row where assignment_row.teacher_id = auth.uid() and assignment_row.class_id = p_class_id and assignment_row.ended_at is null) then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.students student_row where student_row.id = p_student_id and student_row.class_id = p_class_id and student_row.school_id = actor.school_id and student_row.active) then raise exception 'student not in assigned class'; end if;
  insert into public.student_updates(school_id,class_id,student_id,teacher_id,category,title,message,importance) values(actor.school_id,p_class_id,p_student_id,auth.uid(),p_category,p_title,p_message,p_importance) returning * into result;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor.school_id,auth.uid(),'student_update_sent','student_update',result.id);
  return result;
end $$;
create or replace function public.acknowledge_update(p_update_id uuid) returns public.acknowledgements language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; result public.acknowledgements; update_school uuid;
begin
  select * into actor from public.current_profile();
  if actor.role <> 'parent' then raise exception 'not authorized'; end if;
  select update_row.school_id into update_school from public.student_updates update_row join public.parent_student_links parent_link_row on parent_link_row.student_id = update_row.student_id where update_row.id = p_update_id and parent_link_row.parent_id = auth.uid() and parent_link_row.status = 'active';
  if update_school is null then raise exception 'not authorized'; end if;
  insert into public.acknowledgements(update_id,parent_id) values(p_update_id,auth.uid()) on conflict(update_id,parent_id) do update set acknowledged_at = public.acknowledgements.acknowledged_at returning * into result;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(update_school,auth.uid(),'student_update_acknowledged','student_update',p_update_id);
  return result;
end $$;
grant execute on function public.send_student_update(uuid,uuid,public.update_category,text,text,public.update_importance) to authenticated;
grant execute on function public.acknowledge_update(uuid) to authenticated;
alter publication supabase_realtime add table public.student_updates, public.acknowledgements;
