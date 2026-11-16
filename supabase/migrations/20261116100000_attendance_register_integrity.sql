-- Additive M1 rollout. No historical attendance is rewritten or backfilled.
-- attendance_records remains the published, teacher-saved classroom projection.
-- Drafts live only in attendance_registers and cannot be read by Parents.
create table public.attendance_registers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  attendance_date date not null,
  state text not null check (state in ('draft','finalized')),
  revision integer not null check (revision > 0),
  draft_records jsonb,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(class_id,attendance_date),
  check ((state='draft' and draft_records is not null and confirmed_by is null and confirmed_at is null)
    or (state='finalized' and draft_records is null and confirmed_by is not null and confirmed_at is not null))
);
create table public.attendance_changes (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.attendance_registers(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  revision integer not null,
  previous_status public.attendance_status,
  new_status public.attendance_status not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  unique(register_id,revision,student_id)
);
-- Use the existing status enum; a later Excused migration must also update
-- validation, consumers and queue contracts. No status is silently remapped here.
create table public.attendance_write_receipts (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  register_id uuid not null references public.attendance_registers(id) on delete cascade,
  intent jsonb not null,
  result jsonb not null,
  primary key(actor_id,request_id)
);
alter table public.attendance_registers enable row level security;
alter table public.attendance_changes enable row level security;
alter table public.attendance_write_receipts enable row level security;
revoke all on public.attendance_registers,public.attendance_changes,public.attendance_write_receipts from public,anon,authenticated;
grant select on public.attendance_registers,public.attendance_changes to authenticated;
create policy "staff register read" on public.attendance_registers for select to authenticated using (
  public.same_school(school_id) and (private.current_teacher_is_assigned(class_id) or public.current_user_role()='principal')
);
create policy "authorized attendance history read" on public.attendance_changes for select to authenticated using (
  public.same_school(school_id) and (private.current_parent_is_linked_to_student(student_id)
    or public.current_user_role()='principal'
    or exists(select 1 from public.attendance_registers r where r.id=register_id and private.current_teacher_is_assigned(r.class_id)))
);

create function private.attendance_scope(p_class_id uuid,p_day date) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope uuid:=public.current_user_school_id();
begin
  if not private.school_operation_session_valid() or public.current_user_role() is distinct from 'teacher'
    or scope is null or not private.current_teacher_is_assigned(p_class_id)
    or not exists(select 1 from public.classes where id=p_class_id and school_id=scope and active)
    then raise exception 'not_authorized'; end if;
  if p_day is null or p_day>(select (now() at time zone timezone)::date from public.schools where id=scope)
    then raise exception 'invalid_attendance_date'; end if;
  return scope;
end $$;
revoke all on function private.attendance_scope(uuid,date) from public,anon,authenticated,service_role;

create function public.class_attendance_snapshot(p_class_id uuid,p_attendance_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; r public.attendance_registers; rows jsonb; confirmer uuid; confirmed timestamptz;
begin
  scope:=private.attendance_scope(p_class_id,p_attendance_date);
  -- Same lock as every writer: revision and rows are one consistent snapshot.
  perform pg_advisory_xact_lock(hashtextextended('school-attendance:'||p_class_id::text||':'||p_attendance_date::text,0));
  select * into r from public.attendance_registers where class_id=p_class_id and attendance_date=p_attendance_date;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'status',status) order by student_id),'[]'::jsonb)
    into rows from public.attendance_records where school_id=scope and class_id=p_class_id and attendance_date=p_attendance_date;
  if r.id is null and jsonb_array_length(rows)>0 then
    select marked_by,updated_at into confirmer,confirmed from public.attendance_records
      where school_id=scope and class_id=p_class_id and attendance_date=p_attendance_date order by updated_at desc,id limit 1;
  end if;
  return jsonb_build_object('register_id',r.id,'state',coalesce(r.state,case when jsonb_array_length(rows)>0 then 'finalized' else 'draft' end),
    'revision',coalesce(r.revision,0),'records',case when r.state='draft' then r.draft_records else rows end,
    'confirmed_by',coalesce(r.confirmed_by,confirmer),'confirmed_at',coalesce(r.confirmed_at,confirmed),
    'legacy',r.id is null and jsonb_array_length(rows)>0);
end $$;
revoke all on function public.class_attendance_snapshot(uuid,date) from public,anon;
grant execute on function public.class_attendance_snapshot(uuid,date) to authenticated;

create function public.write_class_attendance(p_class_id uuid,p_attendance_date date,p_records jsonb,
  p_expected_revision integer,p_action text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; actor uuid:=auth.uid(); prior public.attendance_write_receipts; snapshot jsonb;
  intent jsonb; canonical jsonb; result jsonb; register_id uuid; next_revision integer; reason text:=btrim(coalesce(p_reason,''));
begin
  scope:=private.attendance_scope(p_class_id,p_attendance_date);
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_action is null
    or p_action not in ('draft','finalize') or jsonb_typeof(p_records) is distinct from 'array'
    or jsonb_array_length(p_records) not between 1 and 500 or length(reason)>500 then raise exception 'invalid_attendance'; end if;
  if exists(select 1 from jsonb_array_elements(p_records) e where jsonb_typeof(e) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(e))<>2 or not(e ? 'student_id' and e ? 'status')
    or coalesce(e->>'status','') not in ('present','absent','late')) then raise exception 'invalid_attendance'; end if;
  if exists(select 1 from jsonb_array_elements(p_records) e where not exists(select 1 from public.students s
    where s.id=(e->>'student_id')::uuid and s.class_id=p_class_id and s.school_id=scope and s.active))
    or (select count(distinct e->>'student_id') from jsonb_array_elements(p_records) e)<>jsonb_array_length(p_records)
    or jsonb_array_length(p_records)<>(select count(*) from public.students where class_id=p_class_id and school_id=scope and active)
    then raise exception 'invalid_attendance_roster'; end if;
  select jsonb_agg(jsonb_build_object('student_id',(e->>'student_id')::uuid,'status',e->>'status') order by (e->>'student_id')::uuid)
    into canonical from jsonb_array_elements(p_records) e;
  intent:=jsonb_build_object('class_id',p_class_id,'date',p_attendance_date,'records',canonical,'expected_revision',p_expected_revision,'action',p_action,'reason',reason);
  snapshot:=public.class_attendance_snapshot(p_class_id,p_attendance_date);
  -- Actor/request lock prevents a request ID being reused across class/day locks.
  perform pg_advisory_xact_lock(hashtextextended('attendance-request:'||actor::text||':'||p_request_id::text,0));
  select * into prior from public.attendance_write_receipts where actor_id=actor and request_id=p_request_id;
  if found then
    if prior.intent is distinct from intent then raise exception 'operation_conflict'; end if;
    return prior.result;
  end if;
  if (snapshot->>'revision')::integer<>p_expected_revision then raise exception 'attendance_conflict'; end if;
  if snapshot->>'state'='finalized' then
    if p_action='draft' then raise exception 'attendance_already_finalized'; end if;
    if snapshot->'records' is distinct from canonical and length(reason)<3 then raise exception 'attendance_reason_required'; end if;
  end if;
  next_revision:=p_expected_revision+1;
  insert into public.attendance_registers(school_id,class_id,attendance_date,state,revision,draft_records,confirmed_by,confirmed_at)
    values(scope,p_class_id,p_attendance_date,case when p_action='draft' then 'draft' else 'finalized' end,next_revision,
      case when p_action='draft' then canonical else null end,case when p_action='finalize' then actor else null end,case when p_action='finalize' then now() else null end)
    on conflict(class_id,attendance_date) do update set state=excluded.state,revision=excluded.revision,draft_records=excluded.draft_records,
      confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,updated_at=now()
    returning id into register_id;
  if p_action='finalize' then
    insert into public.attendance_changes(register_id,school_id,student_id,revision,previous_status,new_status,actor_id,reason)
      select register_id,scope,(e->>'student_id')::uuid,next_revision,old.status,(e->>'status')::public.attendance_status,actor,
        case when snapshot->>'state'='finalized' then coalesce(nullif(reason,''),'Reconfirmed unchanged attendance') else 'Initial classroom confirmation' end
      from jsonb_array_elements(canonical) e left join public.attendance_records old
        on old.student_id=(e->>'student_id')::uuid and old.attendance_date=p_attendance_date
      where old.status is distinct from (e->>'status')::public.attendance_status;
    -- Existing validation/authorization and attendance_saved audit event retained.
    perform public.save_class_attendance_authorized_inner(p_class_id,p_attendance_date,canonical);
  end if;
  result:=public.class_attendance_snapshot(p_class_id,p_attendance_date);
  insert into public.attendance_write_receipts(actor_id,request_id,register_id,intent,result) values(actor,p_request_id,register_id,intent,result);
  return result;
end $$;
revoke all on function public.write_class_attendance(uuid,date,jsonb,integer,text,text,uuid) from public,anon;
grant execute on function public.write_class_attendance(uuid,date,jsonb,integer,text,text,uuid) to authenticated;

-- Legacy clients may explicitly save a previously unmarked register or retry an
-- identical final register. They cannot overwrite a newer register or correct it
-- without supplying revision/reason through the new contract.
create or replace function public.save_class_attendance(p_class_id uuid,p_attendance_date date,p_records jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; canonical jsonb;
begin
  snapshot:=public.class_attendance_snapshot(p_class_id,p_attendance_date);
  select jsonb_agg(e order by (e->>'student_id')::uuid) into canonical from jsonb_array_elements(p_records) e;
  if (snapshot->>'revision')::integer>0 or snapshot->>'state'='finalized' then
    if snapshot->>'state'='finalized' and snapshot->'records'=canonical then return; end if;
    raise exception 'attendance_revision_required';
  end if;
  perform public.write_class_attendance(p_class_id,p_attendance_date,p_records,0,'finalize',null,gen_random_uuid());
end $$;
notify pgrst,'reload schema';
