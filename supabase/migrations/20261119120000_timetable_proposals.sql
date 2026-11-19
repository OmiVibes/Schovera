-- Additive online intentions. Published timetables and their writer stay intact.
create table public.timetable_proposals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null, class_grade text not null, class_division text not null,
  proposed_by uuid not null, proposer_name text not null,
  client_request_id uuid not null, entry_id uuid, expected_updated_at timestamptz,
  source_weekday smallint, teacher_id uuid not null,
  subject text not null check(char_length(subject) between 2 and 80),
  weekday smallint not null check(weekday between 1 and 6),
  period_number smallint not null check(period_number between 1 and 20),
  start_time time not null, end_time time not null, room text,
  reason text not null check(char_length(reason) between 8 and 500),
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid, decider_name text, decided_at timestamptz, decision_reason text,
  published_entry_id uuid, published_updated_at timestamptz, published_snapshot jsonb,
  unique(proposed_by,client_request_id), unique(id,school_id),
  check(teacher_id=proposed_by), check(start_time<end_time),
  check(room is null or char_length(room) between 1 and 80),
  check((entry_id is null and expected_updated_at is null and source_weekday is null)
    or (entry_id is not null and expected_updated_at is not null and source_weekday between 1 and 6)),
  check((status='pending' and decided_by is null and decided_at is null)
    or (status<>'pending' and decided_by is not null and decided_at is not null)),
  check((status='approved' and published_entry_id is not null and published_snapshot is not null)
    or (status<>'approved' and published_entry_id is null and published_snapshot is null))
);
create index timetable_proposal_feed on public.timetable_proposals(school_id,created_at desc,id desc);
create index timetable_proposal_author on public.timetable_proposals(proposed_by,created_at desc,id desc);
create table public.timetable_proposal_events (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null, school_id uuid not null,
  actor_id uuid not null, event_type text not null check(event_type in ('submitted','approved','rejected','withdrawn')),
  reason text, created_at timestamptz not null default now(), published_entry_id uuid,
  foreign key(proposal_id,school_id) references public.timetable_proposals(id,school_id) on delete cascade,
  unique(proposal_id,event_type)
);
-- Actor/class IDs deliberately retain immutable history after staff/class removal.
-- School deletion is the explicit retention/owned-fixture cleanup boundary.
alter table public.timetable_proposals enable row level security;
alter table public.timetable_proposal_events enable row level security;
revoke all on public.timetable_proposals,public.timetable_proposal_events from public,anon,authenticated;
grant select on public.timetable_proposals,public.timetable_proposal_events to authenticated;
grant all on public.timetable_proposals,public.timetable_proposal_events to service_role;

create function private.timetable_proposal_scope(p_role text default null) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not private.school_operation_session_valid()
    or coalesce(public.current_user_role(),'') not in ('teacher','principal')
    or (p_role is not null and public.current_user_role() is distinct from p_role)
    or public.current_user_school_id() is null then raise exception 'not authorized'; end if;
  return public.current_user_school_id();
end $$;
revoke all on function private.timetable_proposal_scope(text) from public,anon,authenticated,service_role;
create function private.can_read_timetable_proposal(p_school uuid,p_author uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select private.school_operation_session_valid() and exists(
    select 1 from public.profiles p where p.id=auth.uid() and p.active and p.school_id=p_school
      and (p.role='principal' or (p.role='teacher' and p.id=p_author)))
$$;
revoke all on function private.can_read_timetable_proposal(uuid,uuid) from public,anon;
grant execute on function private.can_read_timetable_proposal(uuid,uuid) to authenticated;
create policy "authorized proposal history" on public.timetable_proposals for select to authenticated
using(private.can_read_timetable_proposal(school_id,proposed_by));
create policy "authorized proposal events" on public.timetable_proposal_events for select to authenticated
using(exists(select 1 from public.timetable_proposals p where p.id=proposal_id and p.school_id=timetable_proposal_events.school_id));

create function public.submit_timetable_proposal(p_class_id uuid,p_entry_id uuid,p_expected_updated_at timestamptz,
  p_weekday smallint,p_period_number smallint,p_subject text,p_start_time time,p_end_time time,p_room text,
  p_reason text,p_client_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; klass public.classes; source public.timetable_entries; prior public.timetable_proposals;
  clean_subject text:=btrim(p_subject,E' \t\n\r'); clean_reason text:=btrim(p_reason,E' \t\n\r');
  clean_room text:=nullif(btrim(coalesce(p_room,''),E' \t\n\r'),'');
begin
  scope:=private.timetable_proposal_scope('teacher');
  select * into klass from public.classes c where c.id=p_class_id and c.school_id=scope and c.active;
  if not found or not private.current_teacher_is_assigned(p_class_id) then raise exception 'Class is not assigned'; end if;
  if p_client_request_id is null or clean_subject is null or char_length(clean_subject) not between 2 and 80
    or clean_reason is null or char_length(clean_reason) not between 8 and 500
    or cardinality(regexp_split_to_array(clean_reason,'[[:space:]]+'))<2
    or (clean_room is not null and char_length(clean_room)>80)
    or p_weekday is null or p_weekday not between 1 and 6
    or p_period_number is null or p_period_number not between 1 and 20
    or p_start_time is null or p_end_time is null or p_start_time>=p_end_time
    or ((p_entry_id is null)<>(p_expected_updated_at is null)) then raise exception 'Invalid timetable proposal'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timetable-proposal:'||auth.uid()::text||':'||p_client_request_id::text,0));
  select * into prior from public.timetable_proposals where proposed_by=auth.uid() and client_request_id=p_client_request_id;
  if found then
    if prior.school_id<>scope or prior.class_id<>p_class_id or prior.entry_id is distinct from p_entry_id
      or prior.expected_updated_at is distinct from p_expected_updated_at or prior.weekday<>p_weekday
      or prior.period_number<>p_period_number or prior.subject<>clean_subject or prior.start_time<>p_start_time
      or prior.end_time<>p_end_time or prior.room is distinct from clean_room or prior.reason<>clean_reason then
      raise exception 'Proposal request conflict'; end if;
    return to_jsonb(prior);
  end if;
  if p_entry_id is not null then
    select * into source from public.timetable_entries where id=p_entry_id and school_id=scope and class_id=p_class_id and teacher_id=auth.uid();
    if not found then raise exception 'Published period is not available'; end if;
    if source.updated_at is distinct from p_expected_updated_at then raise exception 'Stale proposal: published period changed'; end if;
  end if;
  insert into public.timetable_proposals(school_id,class_id,class_grade,class_division,proposed_by,proposer_name,client_request_id,
    entry_id,expected_updated_at,source_weekday,teacher_id,subject,weekday,period_number,start_time,end_time,room,reason)
    values(scope,p_class_id,klass.grade,klass.division,auth.uid(),(select full_name from public.profiles where id=auth.uid()),p_client_request_id,
      p_entry_id,p_expected_updated_at,source.weekday,auth.uid(),clean_subject,p_weekday,p_period_number,p_start_time,p_end_time,clean_room,clean_reason)
    returning * into prior;
  insert into public.timetable_proposal_events(proposal_id,school_id,actor_id,event_type,reason)
    values(prior.id,scope,auth.uid(),'submitted',clean_reason);
  return to_jsonb(prior);
end $$;

create function public.decide_timetable_proposal(p_proposal_id uuid,p_decision text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; proposal public.timetable_proposals; source public.timetable_entries; published public.timetable_entries;
  lock_day smallint; clean_reason text:=btrim(coalesce(p_reason,''),E' \t\n\r');
begin
  scope:=private.timetable_proposal_scope('principal');
  if p_decision is null or p_decision not in ('approved','rejected') or char_length(clean_reason)>500 then raise exception 'Invalid proposal decision'; end if;
  select * into proposal from public.timetable_proposals where id=p_proposal_id and school_id=scope for update;
  if not found then raise exception 'Proposal is not available'; end if;
  if proposal.status<>'pending' then
    if proposal.status=p_decision and proposal.decision_reason=clean_reason then return to_jsonb(proposal); end if;
    raise exception 'Proposal is no longer pending';
  end if;
  if p_decision='approved' then
    if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
      where p.id=proposal.proposed_by and p.school_id=scope and p.role='teacher' and p.active
      and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Proposing Teacher is no longer authorized'; end if;
    for lock_day in select distinct d from unnest(array[proposal.weekday,proposal.source_weekday]) d where d is not null order by d loop
      perform pg_advisory_xact_lock(hashtextextended('schovera-timetable:'||lock_day::text,0));
    end loop;
    if proposal.entry_id is not null then
      select * into source from public.timetable_entries where id=proposal.entry_id and school_id=scope for update;
      if not found or source.updated_at is distinct from proposal.expected_updated_at
        or source.class_id<>proposal.class_id or source.teacher_id<>proposal.proposed_by then
        raise exception 'Stale proposal: published period changed'; end if;
    end if;
    -- Existing writer rechecks active class/assignment and all period/time,
    -- Teacher/class/room conflicts. The actual Principal remains the actor.
    proposal.published_entry_id:=public.save_timetable_entry(proposal.entry_id,proposal.class_id,proposal.teacher_id,
      proposal.weekday,proposal.period_number,proposal.subject,proposal.start_time,proposal.end_time,proposal.room,
      case when proposal.entry_id is null then proposal.id else null end,proposal.expected_updated_at);
    select * into published from public.timetable_entries where id=proposal.published_entry_id;
  end if;
  update public.timetable_proposals set status=p_decision,decided_by=auth.uid(),
    decider_name=(select full_name from public.profiles where id=auth.uid()),decided_at=clock_timestamp(),decision_reason=clean_reason,
    published_entry_id=proposal.published_entry_id,published_updated_at=published.updated_at,
    published_snapshot=case when p_decision='approved' then to_jsonb(published) else null end
    where id=proposal.id returning * into proposal;
  insert into public.timetable_proposal_events(proposal_id,school_id,actor_id,event_type,reason,published_entry_id)
    values(proposal.id,scope,auth.uid(),p_decision,clean_reason,proposal.published_entry_id);
  return to_jsonb(proposal);
end $$;

create function public.withdraw_timetable_proposal(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; proposal public.timetable_proposals;
begin
  scope:=private.timetable_proposal_scope('teacher');
  select * into proposal from public.timetable_proposals where id=p_proposal_id and school_id=scope and proposed_by=auth.uid() for update;
  if not found then raise exception 'Proposal is not available'; end if;
  if proposal.status='withdrawn' then return to_jsonb(proposal); end if;
  if proposal.status<>'pending' then raise exception 'Proposal is no longer pending'; end if;
  update public.timetable_proposals set status='withdrawn',decided_by=auth.uid(),decider_name=proposer_name,
    decided_at=clock_timestamp(),decision_reason='' where id=proposal.id returning * into proposal;
  insert into public.timetable_proposal_events(proposal_id,school_id,actor_id,event_type) values(proposal.id,scope,auth.uid(),'withdrawn');
  return to_jsonb(proposal);
end $$;

create function public.timetable_proposal_page(p_state text default null,p_class_id uuid default null,
  p_before_created_at timestamptz default null,p_before_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope uuid; result jsonb;
begin
  scope:=private.timetable_proposal_scope();
  if (p_state is not null and p_state not in ('pending','approved','rejected','withdrawn'))
    or p_limit is null or p_limit not between 1 and 40
    or ((p_before_created_at is null)<>(p_before_id is null)) then raise exception 'Invalid proposal page'; end if;
  with candidates as (
    select p.* from public.timetable_proposals p where p.school_id=scope
      and (public.current_user_role()='principal' or p.proposed_by=auth.uid())
      and (p_class_id is null or p.class_id=p_class_id) and (p_state is null or p.status=p_state)
      and (p_before_created_at is null or (p.created_at,p.id)<(p_before_created_at,p_before_id))
    order by p.created_at desc,p.id desc limit p_limit+1
  ), page as (select * from candidates order by created_at desc,id desc limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
    'has_more',(select count(*)>p_limit from candidates)) into result;
  return result;
end $$;
revoke all on function public.submit_timetable_proposal(uuid,uuid,timestamptz,smallint,smallint,text,time,time,text,text,uuid) from public,anon;
revoke all on function public.decide_timetable_proposal(uuid,text,text) from public,anon;
revoke all on function public.withdraw_timetable_proposal(uuid) from public,anon;
revoke all on function public.timetable_proposal_page(text,uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.submit_timetable_proposal(uuid,uuid,timestamptz,smallint,smallint,text,time,time,text,text,uuid) to authenticated;
grant execute on function public.decide_timetable_proposal(uuid,text,text) to authenticated;
grant execute on function public.withdraw_timetable_proposal(uuid) to authenticated;
grant execute on function public.timetable_proposal_page(text,uuid,timestamptz,uuid,integer) to authenticated;
notify pgrst,'reload schema';
