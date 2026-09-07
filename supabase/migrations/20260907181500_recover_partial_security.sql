-- Safe recovery for a partial first run of 20260907180000_vertical_slice.sql.
-- Does not drop tables, rows, Auth users, or types.
create or replace function public.current_profile() returns public.profiles language sql stable security definer set search_path = public, pg_temp as $$
  select profile_row.* from public.profiles as profile_row where profile_row.id = auth.uid() and profile_row.active = true
$$;
create or replace function public.same_school(target_school uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.active and p.school_id = target_school)
$$;
alter table public.schools enable row level security; alter table public.profiles enable row level security; alter table public.classes enable row level security;
alter table public.teacher_class_assignments enable row level security; alter table public.students enable row level security; alter table public.parent_student_links enable row level security;
alter table public.student_updates enable row level security; alter table public.acknowledgements enable row level security; alter table public.audit_events enable row level security;
drop policy if exists "own school" on public.schools; drop policy if exists "own profile" on public.profiles; drop policy if exists "assigned or linked class" on public.classes;
drop policy if exists "own assignment" on public.teacher_class_assignments; drop policy if exists "authorized students" on public.students; drop policy if exists "own parent links" on public.parent_student_links;
drop policy if exists "authorized updates" on public.student_updates; drop policy if exists "authorized acknowledgement read" on public.acknowledgements;
create policy "own school" on public.schools for select using (public.same_school(schools.id));
create policy "own profile" on public.profiles for select using (profiles.id = auth.uid() or ((select p.role from public.current_profile() p) = 'principal' and public.same_school(profiles.school_id)));
create policy "assigned or linked class" on public.classes for select using (((select p.role from public.current_profile() p) = 'principal' and public.same_school(classes.school_id)) or exists(select 1 from public.teacher_class_assignments a where a.class_id = classes.id and a.teacher_id = auth.uid() and a.ended_at is null) or exists(select 1 from public.students s join public.parent_student_links l on l.student_id = s.id where s.class_id = classes.id and l.parent_id = auth.uid() and l.status = 'active'));
create policy "own assignment" on public.teacher_class_assignments for select using (teacher_class_assignments.teacher_id = auth.uid() or ((select p.role from public.current_profile() p) = 'principal' and exists(select 1 from public.classes c where c.id = teacher_class_assignments.class_id and public.same_school(c.school_id))));
create policy "authorized students" on public.students for select using (((select p.role from public.current_profile() p) = 'principal' and public.same_school(students.school_id)) or exists(select 1 from public.teacher_class_assignments a where a.class_id = students.class_id and a.teacher_id = auth.uid() and a.ended_at is null) or exists(select 1 from public.parent_student_links l where l.student_id = students.id and l.parent_id = auth.uid() and l.status = 'active'));
create policy "own parent links" on public.parent_student_links for select using (parent_student_links.parent_id = auth.uid() or ((select p.role from public.current_profile() p) = 'principal' and exists(select 1 from public.students s where s.id = parent_student_links.student_id and public.same_school(s.school_id))));
create policy "authorized updates" on public.student_updates for select using (((select p.role from public.current_profile() p) = 'principal' and public.same_school(student_updates.school_id)) or student_updates.teacher_id = auth.uid() or exists(select 1 from public.parent_student_links l where l.student_id = student_updates.student_id and l.parent_id = auth.uid() and l.status = 'active'));
create policy "authorized acknowledgement read" on public.acknowledgements for select using (acknowledgements.parent_id = auth.uid() or exists(select 1 from public.student_updates u where u.id = acknowledgements.update_id and (u.teacher_id = auth.uid() or ((select p.role from public.current_profile() p) = 'principal' and public.same_school(u.school_id)))));
create or replace function public.send_student_update(p_class_id uuid, p_student_id uuid, p_category public.update_category, p_title text, p_message text, p_importance public.update_importance) returns public.student_updates language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; result public.student_updates; begin
 select * into actor from public.current_profile();
 if actor.role <> 'teacher' or not exists(select 1 from public.teacher_class_assignments a where a.teacher_id = auth.uid() and a.class_id = p_class_id and a.ended_at is null) then raise exception 'not authorized'; end if;
 if not exists(select 1 from public.students s where s.id = p_student_id and s.class_id = p_class_id and s.school_id = actor.school_id and s.active) then raise exception 'student not in assigned class'; end if;
 insert into public.student_updates(school_id,class_id,student_id,teacher_id,category,title,message,importance) values(actor.school_id,p_class_id,p_student_id,auth.uid(),p_category,p_title,p_message,p_importance) returning * into result;
 insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(actor.school_id,auth.uid(),'student_update_sent','student_update',result.id); return result; end $$;
create or replace function public.acknowledge_update(p_update_id uuid) returns public.acknowledgements language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; result public.acknowledgements; update_school uuid; begin
 select * into actor from public.current_profile(); if actor.role <> 'parent' then raise exception 'not authorized'; end if;
 select u.school_id into update_school from public.student_updates u join public.parent_student_links l on l.student_id = u.student_id where u.id = p_update_id and l.parent_id = auth.uid() and l.status = 'active';
 if update_school is null then raise exception 'not authorized'; end if;
 insert into public.acknowledgements(update_id,parent_id) values(p_update_id,auth.uid()) on conflict(update_id,parent_id) do update set acknowledged_at = public.acknowledgements.acknowledged_at returning * into result;
 insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id) values(update_school,auth.uid(),'student_update_acknowledged','student_update',p_update_id); return result; end $$;
grant execute on function public.send_student_update(uuid,uuid,public.update_category,text,text,public.update_importance) to authenticated;
grant execute on function public.acknowledge_update(uuid) to authenticated;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_updates') then alter publication supabase_realtime add table public.student_updates; end if; if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'acknowledgements') then alter publication supabase_realtime add table public.acknowledgements; end if; end $$;
