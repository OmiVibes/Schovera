-- M2 read-side reconciliation. Gate evidence never writes classroom attendance.
create table public.attendance_exception_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null,
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{32}$'),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  reason text not null check(length(btrim(reason)) between 8 and 500 and cardinality(regexp_split_to_array(btrim(reason),'\s+'))>=2),
  reviewed_at timestamptz not null default now(),
  unique(actor_id,request_id)
);
alter table public.attendance_exception_reviews enable row level security;
revoke all on public.attendance_exception_reviews from public,anon,authenticated;
-- Staff use bounded RPCs; Parents gain no correction/review-note permission.
create index attendance_exception_review_lookup on public.attendance_exception_reviews(student_id,class_id,attendance_date,fingerprint,reviewed_at desc);
create index school_entry_observed_scope on public.school_entry_events(school_id,observed_at) where credential_assignment_id is not null;

create function private.attendance_review_scope(p_class uuid,p_day date) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope uuid:=public.current_user_school_id(); role text:=public.current_user_role();
begin
  if not private.school_operation_session_valid() or scope is null or role is null or role not in ('teacher','principal')
    or not exists(select 1 from public.classes where id=p_class and school_id=scope and active)
    or (role='teacher' and not private.current_teacher_is_assigned(p_class)) then raise exception 'not_authorized'; end if;
  if p_day is null or p_day>(select (now() at time zone timezone)::date from public.schools where id=scope) then raise exception 'invalid_attendance_date'; end if;
  return scope;
end $$;
revoke all on function private.attendance_review_scope(uuid,date) from public,anon,authenticated,service_role;

-- Current roster comparison, never a historical class-at-scan assertion. Only
-- accepted v2 assignment-bound evidence contributes to named reconciliation.
create function private.attendance_review_rows(p_school uuid,p_class uuid,p_day date)
returns table(student_id uuid,class_id uuid,student_name text,roll_number text,classroom_status text,register_state text,revision integer,
  gate_events bigint,check_ins bigint,reliable_entries bigint,timing_issues bigint,delayed_sync bigint,sequence_issues bigint,legacy_events bigint,
  first_observed timestamptz,last_received timestamptz,flags text[],fingerprint text,reviewed boolean,reviewer_name text,reviewed_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with bounds as (
    select p_day::timestamp at time zone timezone as start_at,(p_day+1)::timestamp at time zone timezone as end_at,
      exists(select 1 from public.school_devices d where d.school_id=p_school and d.active) as configured
    from public.schools where id=p_school
  ), roster as (
    select s.* from public.students s join public.classes c on c.id=s.class_id and c.active and c.school_id=p_school
    where s.school_id=p_school and s.active and (p_class is null or s.class_id=p_class)
  ), facts as (
    select s.id as student_id,s.class_id,s.full_name as student_name,s.roll_number,a.status::text as classroom_status,
      coalesce(r.state,case when a.id is not null then 'legacy_saved' else 'unmarked' end) as register_state,coalesce(r.revision,0) as revision,
      b.configured,
      count(e.id) filter(where e.credential_assignment_id is not null) as gate_events,
      count(e.id) filter(where e.credential_assignment_id is not null and e.event_type='check_in') as check_ins,
      count(e.id) filter(where e.credential_assignment_id is not null and e.event_type='check_in'
        and e.timestamp_quality='within_tolerance' and e.observed_at>=b.start_at and e.observed_at<b.end_at) as reliable_entries,
      count(e.id) filter(where e.credential_assignment_id is not null and e.timestamp_quality='clock_uncertain') as timing_issues,
      count(e.id) filter(where e.credential_assignment_id is not null and e.received_at-e.observed_at>interval '10 minutes') as delayed_sync,
      count(e.id) filter(where e.credential_assignment_id is not null and e.sequence_state<>'in_order') as sequence_issues,
      count(e.id) filter(where e.credential_assignment_id is null) as legacy_events,
      min(e.observed_at) filter(where e.credential_assignment_id is not null) as first_observed,
      max(e.received_at) filter(where e.credential_assignment_id is not null) as last_received,
      md5(coalesce(jsonb_agg(jsonb_build_array(e.id,e.timestamp_quality,e.sequence_state) order by e.id) filter(where e.id is not null),'[]'::jsonb)::text) as evidence_identity
    from roster s cross join bounds b
    left join public.attendance_records a on a.student_id=s.id and a.class_id=s.class_id and a.school_id=p_school and a.attendance_date=p_day
    left join public.attendance_registers r on r.class_id=s.class_id and r.school_id=p_school and r.attendance_date=p_day
    left join public.school_entry_events e on e.student_id=s.id and e.school_id=p_school and (
      (e.observed_at>=b.start_at and e.observed_at<b.end_at)
      or (e.timestamp_quality='clock_uncertain' and e.received_at>=b.start_at and e.received_at<b.end_at))
    group by s.id,s.class_id,s.full_name,s.roll_number,a.status,a.id,r.state,r.revision,b.configured,b.start_at,b.end_at
  ), flagged as (
    select f.*,array_remove(array[
      case when configured and classroom_status in ('present','late') and reliable_entries=0 then 'no_matching_scan' end,
      case when reliable_entries>0 and classroom_status is null then 'gate_without_confirmation' end,
      case when reliable_entries>0 and classroom_status='absent' then 'gate_class_mismatch' end,
      case when check_ins>1 then 'separate_scans' end,
      case when timing_issues>0 then 'uncertain_time' end,
      case when delayed_sync>0 then 'delayed_receipt' end,
      case when sequence_issues>0 then 'sequence_review' end
    ],null) as flags,md5(to_jsonb(f)::text) as fingerprint from facts f
  )
  select f.student_id,f.class_id,f.student_name,f.roll_number,f.classroom_status,f.register_state,f.revision,
    f.gate_events,f.check_ins,f.reliable_entries,f.timing_issues,f.delayed_sync,f.sequence_issues,f.legacy_events,
    f.first_observed,f.last_received,f.flags,f.fingerprint,v.id is not null,p.full_name,v.reviewed_at
  from flagged f left join lateral (
    select * from public.attendance_exception_reviews v where v.school_id=p_school and v.class_id=f.class_id and v.student_id=f.student_id
      and v.attendance_date=p_day and v.fingerprint=f.fingerprint order by v.reviewed_at desc,v.id desc limit 1
  ) v on true left join public.profiles p on p.id=v.actor_id
$$;
revoke all on function private.attendance_review_rows(uuid,uuid,date) from public,anon,authenticated,service_role;

create function public.class_attendance_review(p_class_id uuid,p_attendance_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; rows jsonb; confirmer text; confirmed timestamptz;
begin
  scope:=private.attendance_review_scope(p_class_id,p_attendance_date);
  if (select count(*) from public.students where class_id=p_class_id and school_id=scope and active)>500 then raise exception 'attendance_scope_too_large'; end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.roll_number,f.student_id),'[]'::jsonb) into rows
    from private.attendance_review_rows(scope,p_class_id,p_attendance_date) f;
  select p.full_name,r.confirmed_at into confirmer,confirmed from public.attendance_registers r join public.profiles p on p.id=r.confirmed_by
    where r.class_id=p_class_id and r.attendance_date=p_attendance_date;
  return jsonb_build_object('class_id',p_class_id,'attendance_date',p_attendance_date,'rows',rows,'confirming_teacher',confirmer,'confirmed_at',confirmed);
end $$;
revoke all on function public.class_attendance_review(uuid,date) from public,anon;
grant execute on function public.class_attendance_review(uuid,date) to authenticated;

create function public.review_attendance_exception(p_class_id uuid,p_attendance_date date,p_student_id uuid,p_fingerprint text,p_reason text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; facts record; prior public.attendance_exception_reviews; result uuid; reason text:=btrim(coalesce(p_reason,''));
begin
  scope:=private.attendance_review_scope(p_class_id,p_attendance_date);
  if p_request_id is null or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{32}$' or length(reason) not between 8 and 500
    or cardinality(regexp_split_to_array(reason,'\s+'))<2 then raise exception 'review_reason_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-review:'||auth.uid()::text||':'||p_request_id::text,0));
  select * into prior from public.attendance_exception_reviews where actor_id=auth.uid() and request_id=p_request_id;
  if found then
    if prior.class_id<>p_class_id or prior.attendance_date<>p_attendance_date or prior.student_id<>p_student_id
      or prior.fingerprint<>p_fingerprint or prior.reason<>reason then raise exception 'operation_conflict'; end if;
    return prior.id;
  end if;
  select * into facts from private.attendance_review_rows(scope,p_class_id,p_attendance_date) f where f.student_id=p_student_id;
  if not found then raise exception 'not_authorized'; end if;
  if facts.fingerprint<>p_fingerprint then raise exception 'attendance_conflict'; end if;
  if cardinality(facts.flags)=0 then raise exception 'no_exception_to_review'; end if;
  insert into public.attendance_exception_reviews(school_id,class_id,student_id,attendance_date,fingerprint,actor_id,request_id,reason)
    values(scope,p_class_id,p_student_id,p_attendance_date,p_fingerprint,auth.uid(),p_request_id,reason) returning id into result;
  return result;
end $$;
revoke all on function public.review_attendance_exception(uuid,date,uuid,text,text,uuid) from public,anon;
grant execute on function public.review_attendance_exception(uuid,date,uuid,text,text,uuid) to authenticated;

create function public.principal_attendance_review(p_attendance_date date default null,p_after_id uuid default null,p_limit integer default 40) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid:=public.current_user_school_id(); day date; summary jsonb; page jsonb; unknown_count bigint;
begin
  if not private.school_operation_session_valid() or public.current_user_role() is distinct from 'principal' or scope is null then raise exception 'not_authorized'; end if;
  select coalesce(p_attendance_date,(now() at time zone timezone)::date) into day from public.schools where id=scope;
  if p_limit is null or p_limit not between 1 and 100 or day>(select (now() at time zone timezone)::date from public.schools where id=scope) then raise exception 'invalid_attendance_date'; end if;
  with facts as materialized (select * from private.attendance_review_rows(scope,null,day)),
  class_summary as (
    select c.id,c.grade,c.division,coalesce(r.state,case when count(f.classroom_status)>0 then 'legacy_saved' else 'unmarked' end) as state,
      count(f.student_id) as students,count(f.classroom_status) as saved,
      count(*) filter(where f.classroom_status='present') as present,count(*) filter(where f.classroom_status='absent') as absent,count(*) filter(where f.classroom_status='late') as late,
      count(*) filter(where cardinality(f.flags)>0 and not f.reviewed) as unresolved
    from public.classes c left join facts f on f.class_id=c.id left join public.attendance_registers r on r.class_id=c.id and r.attendance_date=day
    where c.school_id=scope and c.active group by c.id,c.grade,c.division,r.state
  ) select jsonb_build_object('classes',count(*),'finalized_registers',count(*) filter(where state='finalized'),
    'draft_registers',count(*) filter(where state='draft'),'legacy_registers',count(*) filter(where state='legacy_saved'),'unmarked_registers',count(*) filter(where state='unmarked'),
    'students',coalesce(sum(students),0),'saved',coalesce(sum(saved),0),'present',coalesce(sum(present),0),'absent',coalesce(sum(absent),0),'late',coalesce(sum(late),0),
    'unresolved',coalesce(sum(unresolved),0)),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (select * from class_summary where p_after_id is null or id>p_after_id order by id limit p_limit+1) p),'[]'::jsonb)
    into summary,page from class_summary;
  -- Unresolved/unknown/inactive/ambiguous evidence has no reliable named class
  -- association. Return a Principal-only count by receipt day, never card data.
  select count(*) into unknown_count from public.device_event_receipts r join public.school_devices d on d.id=r.device_id join public.schools s on s.id=d.school_id
    where d.school_id=scope and r.outcome in ('unresolved','unmatched') and (r.received_at at time zone s.timezone)::date=day;
  return jsonb_build_object('attendance_date',day,'summary',summary,'unresolved_card_receipts',unknown_count,
    'has_more',jsonb_array_length(page)>p_limit,'classes',case when jsonb_array_length(page)>p_limit then page-p_limit else page end);
end $$;
revoke all on function public.principal_attendance_review(date,uuid,integer) from public,anon;
grant execute on function public.principal_attendance_review(date,uuid,integer) to authenticated;

create function public.parent_classroom_confirmation(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope uuid:=public.current_user_school_id(); day date; saved public.attendance_records;
begin
  if not private.school_operation_session_valid() or public.current_user_role() is distinct from 'parent'
    or not private.current_parent_is_linked_to_student(p_student_id)
    or not exists(select 1 from public.students where id=p_student_id and school_id=scope) then raise exception 'not_authorized'; end if;
  select (now() at time zone timezone)::date into day from public.schools where id=scope;
  select * into saved from public.attendance_records where student_id=p_student_id and school_id=scope and attendance_date=day;
  return jsonb_build_object('attendance_date',day,'status',saved.status,'available',saved.id is not null);
end $$;
revoke all on function public.parent_classroom_confirmation(uuid) from public,anon;
grant execute on function public.parent_classroom_confirmation(uuid) to authenticated;
notify pgrst,'reload schema';
