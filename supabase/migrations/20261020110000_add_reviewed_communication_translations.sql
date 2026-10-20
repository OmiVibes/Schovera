-- Human-entered language versions. Originals and acknowledgement identity stay unchanged.
create table public.communication_translations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_update_id uuid references public.student_updates(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  language text not null check (language in ('en','hi','mr')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 3 and 3000),
  status text not null default 'draft' check (status in ('draft','in_review','approved','needs_review')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  authored_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(student_update_id, announcement_id) = 1),
  check ((status='approved' and approved_by is not null and approved_at is not null)
    or (status<>'approved' and approved_by is null and approved_at is null))
);
create unique index communication_translations_update_language_idx
  on public.communication_translations(student_update_id,language) where student_update_id is not null;
create unique index communication_translations_announcement_language_idx
  on public.communication_translations(announcement_id,language) where announcement_id is not null;

create function private.communication_hash(title text, body text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_array(title,body)::text,'UTF8')),'hex')
$$;
create function private.communication_source(kind text, source_id uuid)
returns table(school_id uuid, title text, body text, teacher_id uuid, class_id uuid, student_id uuid, superseded boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select u.school_id,u.title,u.message,u.teacher_id,u.class_id,u.student_id,
    exists(select 1 from public.student_updates c where c.corrects_update_id=u.id)
  from public.student_updates u where kind='update' and u.id=source_id
  union all
  select a.school_id,a.title,a.body,null::uuid,null::uuid,null::uuid,false
  from public.announcements a where kind='announcement' and a.id=source_id
$$;
create function private.can_manage_translation(kind text, source_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from private.communication_source(kind,source_id) s
    join public.profiles p on p.id=auth.uid() and p.active and p.school_id=s.school_id
    where p.role='principal' or (p.role='teacher' and kind='update' and s.teacher_id=p.id
      and private.current_teacher_is_assigned(s.class_id)))
$$;
create function private.can_read_translation(kind text, source_id uuid, row_school uuid, row_status text, row_hash text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from private.communication_source(kind,source_id) s
    join public.profiles p on p.id=auth.uid() and p.active and p.school_id=s.school_id
    where s.school_id=row_school and (
      private.can_manage_translation(kind,source_id)
      or (p.role='parent' and row_status='approved' and not s.superseded
        and row_hash=private.communication_hash(s.title,s.body)
        and ((kind='update' and private.current_parent_is_linked_to_student(s.student_id))
          or (kind='announcement' and private.current_parent_has_child_in_school(s.school_id))))))
$$;
revoke all on function private.communication_hash(text,text) from public;
revoke all on function private.communication_source(text,uuid) from public;
revoke all on function private.can_manage_translation(text,uuid) from public;
revoke all on function private.can_read_translation(text,uuid,uuid,text,text) from public;
grant execute on function private.can_read_translation(text,uuid,uuid,text,text) to authenticated;

alter table public.communication_translations enable row level security;
revoke all on public.communication_translations from anon,authenticated;
grant select on public.communication_translations to authenticated;
grant all on public.communication_translations to service_role;
create policy "authorized reviewed translations" on public.communication_translations for select to authenticated
using (private.can_read_translation(case when student_update_id is not null then 'update' else 'announcement' end,
  coalesce(student_update_id,announcement_id),school_id,status,source_hash));

create function public.manage_communication_translation(
  p_source_kind text, p_source_id uuid, p_language text, p_action text,
  p_expected_title text, p_expected_body text, p_title text default null, p_body text default null,
  p_expected_updated_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  source_row record;
  translation public.communication_translations;
  result_id uuid;
  current_hash text;
begin
  if p_source_kind is null or p_source_kind not in ('update','announcement')
    or p_language is null or p_language not in ('en','hi','mr')
    or p_action is null or p_action not in ('save','submit','approve') then raise exception 'invalid translation request'; end if;
  if not private.can_manage_translation(p_source_kind,p_source_id) then raise exception 'not authorized'; end if;
  -- Serialize source edits/corrections and all reviewers for this original.
  if p_source_kind='update' then
    perform id from public.student_updates where id=p_source_id for update;
  else
    perform id from public.announcements where id=p_source_id for update;
  end if;
  select * into source_row from private.communication_source(p_source_kind,p_source_id);
  if not found or not private.can_manage_translation(p_source_kind,p_source_id) then raise exception 'not authorized'; end if;
  if source_row.superseded then raise exception 'original was corrected; translate the new communication'; end if;
  if source_row.title is distinct from p_expected_title or source_row.body is distinct from p_expected_body then
    raise exception 'original changed; reload before reviewing';
  end if;
  current_hash:=private.communication_hash(source_row.title,source_row.body);
  select * into translation from public.communication_translations
    where language=p_language and ((p_source_kind='update' and student_update_id=p_source_id)
      or (p_source_kind='announcement' and announcement_id=p_source_id)) for update;
  if (translation.id is null and p_expected_updated_at is not null)
    or (translation.id is not null and translation.updated_at is distinct from p_expected_updated_at) then
    raise exception 'translation changed; reload before editing';
  end if;
  if p_action='save' then
    if p_title is null or char_length(btrim(p_title)) not between 3 and 160
      or p_body is null or char_length(btrim(p_body)) not between 3 and 3000
      or regexp_replace(p_title,'[[:space:]]','','g')='' or regexp_replace(p_body,'[[:space:]]','','g')='' then
      raise exception 'invalid translation text';
    end if;
    if translation.id is null then
      insert into public.communication_translations(school_id,student_update_id,announcement_id,language,title,body,source_hash,authored_by)
      values(source_row.school_id,case when p_source_kind='update' then p_source_id end,
        case when p_source_kind='announcement' then p_source_id end,p_language,btrim(p_title),btrim(p_body),current_hash,auth.uid())
      returning id into result_id;
    else
      update public.communication_translations set title=btrim(p_title),body=btrim(p_body),status='draft',source_hash=current_hash,
        authored_by=auth.uid(),approved_by=null,approved_at=null,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
      where id=translation.id returning id into result_id;
    end if;
  else
    if translation.id is null or translation.source_hash<>current_hash then raise exception 'save a current draft first'; end if;
    if p_action='submit' then
      if translation.status<>'draft' then raise exception 'save a draft before submitting'; end if;
      update public.communication_translations set status='in_review',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
      where id=translation.id returning id into result_id;
    else
      if public.current_user_role() is distinct from 'principal' then raise exception 'Principal review is required'; end if;
      if translation.status<>'in_review' then raise exception 'submit the draft for review first'; end if;
      update public.communication_translations set status='approved',approved_by=auth.uid(),approved_at=clock_timestamp(),
        updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=translation.id returning id into result_id;
    end if;
  end if;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
    values(source_row.school_id,auth.uid(),'translation_'||p_action,'communication_translation',result_id);
  return result_id;
end $$;
revoke all on function public.manage_communication_translation(text,uuid,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.manage_communication_translation(text,uuid,text,text,text,text,text,text,timestamptz) to authenticated;

create function private.invalidate_communication_translations() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='student_updates' then
    if tg_op='INSERT' then
      if new.corrects_update_id is null then return new; end if;
      perform id from public.student_updates where id=new.corrects_update_id for update;
      update public.communication_translations set status='needs_review',approved_by=null,approved_at=null,
        updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where student_update_id=new.corrects_update_id;
    elsif old.title is distinct from new.title or old.message is distinct from new.message then
      update public.communication_translations set status='needs_review',approved_by=null,approved_at=null,
        updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where student_update_id=new.id;
    end if;
  elsif old.title is distinct from new.title or old.body is distinct from new.body then
    update public.communication_translations set status='needs_review',approved_by=null,approved_at=null,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where announcement_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.invalidate_communication_translations() from public;
create trigger invalidate_update_language_versions after insert or update on public.student_updates
  for each row execute function private.invalidate_communication_translations();
create trigger invalidate_announcement_language_versions after update of title,body on public.announcements
  for each row execute function private.invalidate_communication_translations();
notify pgrst,'reload schema';
