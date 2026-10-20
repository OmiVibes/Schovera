-- LOCAL SYNTHETIC SIMULATOR ONLY. No telephone fields or telephony integration.
create table public.fallback_simulation_preferences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  recipient_ref text not null default ('SIM-'||gen_random_uuid()::text) check(recipient_ref ~ '^SIM-[0-9a-f-]{36}$'),
  channel text not null check(channel in ('sms','ivr')),
  purpose text not null default 'important_school_notice' check(purpose='important_school_notice'),
  opted_in boolean not null default false,
  preferred_language text not null check(preferred_language in ('en','hi','mr')),
  consented_at timestamptz,
  consent_source text not null default 'authenticated_parent_simulator' check(consent_source='authenticated_parent_simulator'),
  opted_out_at timestamptz,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  unique(school_id,parent_id,channel,purpose),
  check(not opted_in or consented_at is not null)
);
create table public.fallback_simulation_deliveries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  preference_id uuid not null references public.fallback_simulation_preferences(id) on delete cascade,
  student_update_id uuid references public.student_updates(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  channel text not null check(channel in ('sms','ivr')),
  requested_language text not null check(requested_language in ('en','hi','mr')),
  language text not null check(language in ('original','en','hi','mr')),
  translation_id uuid references public.communication_translations(id) on delete set null,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  consent_version bigint not null,
  status text not null default 'pending' check(status in ('pending','accepted','delivered','retry_wait','failed','uncertain','blocked')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  receipt_ref text check(receipt_ref ~ '^SIMULATED-[0-9a-f]{32}$'),
  last_code text,
  queued_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(student_update_id,announcement_id)=1)
);
create unique index fallback_update_recipient_idx on public.fallback_simulation_deliveries(preference_id,student_update_id) where student_update_id is not null;
create unique index fallback_announcement_recipient_idx on public.fallback_simulation_deliveries(preference_id,announcement_id) where announcement_id is not null;

create function private.fallback_operator(actor uuid, kind text, source_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from private.communication_source(kind,source_id) s
    join public.profiles p on p.id=actor and p.active and p.school_id=s.school_id
    where p.role='principal' or (p.role='teacher' and kind='update' and s.teacher_id=actor
      and exists(select 1 from public.teacher_class_assignments a where a.class_id=s.class_id and a.teacher_id=actor and a.ended_at is null)))
$$;
create function private.fallback_parent_link(parent_actor uuid, kind text, source_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from private.communication_source(kind,source_id) s
    join public.profiles p on p.id=parent_actor and p.active and p.role='parent' and p.school_id=s.school_id
    join public.parent_student_links l on l.parent_id=p.id and l.status='active'
    join public.students student on student.id=l.student_id and student.active and student.school_id=s.school_id
    where kind='announcement' or student.id=s.student_id)
$$;
create function private.lock_fallback_source(actor uuid, kind text, source_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if kind='update' then perform id from public.student_updates where id=source_id for update;
  elsif kind='announcement' then perform id from public.announcements where id=source_id for update;
  else raise exception 'invalid source'; end if;
  perform id from public.profiles where id=actor for share;
  if not private.fallback_operator(actor,kind,source_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.profiles where id=actor and role='teacher') then
    perform a.id from public.teacher_class_assignments a join public.student_updates u on u.class_id=a.class_id
      where u.id=source_id and a.teacher_id=actor and a.ended_at is null for share of a;
    if not found then raise exception 'not authorized'; end if;
  end if;
end $$;
create function private.lock_fallback_parent(parent_actor uuid, kind text, source_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform id from public.profiles where id=parent_actor and active and role='parent' for share;
  if not found then return false; end if;
  perform l.id from public.parent_student_links l join public.students st on st.id=l.student_id
    join private.communication_source(kind,source_id) s on s.school_id=st.school_id
    join public.profiles p on p.id=parent_actor and p.school_id=s.school_id
    where l.parent_id=parent_actor and l.status='active' and st.active
      and (kind='announcement' or st.id=s.student_id) for share of l,st;
  return found;
end $$;
create function private.fallback_delivery_visible(delivery_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.fallback_simulation_deliveries d
    join public.fallback_simulation_preferences p on p.id=d.preference_id
    where d.id=delivery_id and (
      private.fallback_operator(auth.uid(),case when d.student_update_id is null then 'announcement' else 'update' end,coalesce(d.student_update_id,d.announcement_id))
      or (p.parent_id=auth.uid() and private.fallback_parent_link(auth.uid(),case when d.student_update_id is null then 'announcement' else 'update' end,coalesce(d.student_update_id,d.announcement_id)))))
$$;
revoke all on function private.fallback_operator(uuid,text,uuid) from public;
revoke all on function private.fallback_parent_link(uuid,text,uuid) from public;
revoke all on function private.lock_fallback_source(uuid,text,uuid) from public;
revoke all on function private.lock_fallback_parent(uuid,text,uuid) from public;
revoke all on function private.fallback_delivery_visible(uuid) from public;
grant execute on function private.fallback_delivery_visible(uuid) to authenticated;
alter table public.fallback_simulation_preferences enable row level security;
alter table public.fallback_simulation_deliveries enable row level security;
revoke all on public.fallback_simulation_preferences,public.fallback_simulation_deliveries from anon,authenticated;
grant select on public.fallback_simulation_preferences,public.fallback_simulation_deliveries to authenticated;
grant all on public.fallback_simulation_preferences,public.fallback_simulation_deliveries to service_role;
create policy "own synthetic preferences" on public.fallback_simulation_preferences for select to authenticated
  using(parent_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='parent' and p.school_id=fallback_simulation_preferences.school_id));
create policy "authorized simulated delivery read" on public.fallback_simulation_deliveries for select to authenticated using(private.fallback_delivery_visible(id));

-- These RPCs are server-only. The route derives actor from a verified Auth token.
create function public.set_fallback_simulation_preferences(p_actor uuid,p_sms boolean,p_ivr boolean,p_language text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_school uuid; item record;
begin
  select school_id into actor_school from public.profiles where id=p_actor and role='parent' and active for share;
  if not found then raise exception 'not authorized'; end if;
  if p_sms is null or p_ivr is null or p_language is null or p_language not in ('en','hi','mr') then raise exception 'invalid preferences'; end if;
  for item in select * from (values('sms',p_sms),('ivr',p_ivr)) as preferences(channel,opted_in) loop
    insert into public.fallback_simulation_preferences(school_id,parent_id,channel,opted_in,preferred_language,consented_at)
    values(actor_school,p_actor,item.channel,item.opted_in,p_language,case when item.opted_in then clock_timestamp() end)
    on conflict(school_id,parent_id,channel,purpose) do update set
      opted_in=excluded.opted_in,preferred_language=excluded.preferred_language,
      consented_at=case when excluded.opted_in and not fallback_simulation_preferences.opted_in then clock_timestamp() else fallback_simulation_preferences.consented_at end,
      opted_out_at=case when not excluded.opted_in and fallback_simulation_preferences.opted_in then clock_timestamp() else fallback_simulation_preferences.opted_out_at end,
      version=fallback_simulation_preferences.version+1,updated_at=clock_timestamp()
    where fallback_simulation_preferences.opted_in is distinct from excluded.opted_in
      or fallback_simulation_preferences.preferred_language is distinct from excluded.preferred_language;
  end loop;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
    values(actor_school,p_actor,'simulation_preferences_saved','parent',p_actor);
end $$;

create function public.queue_fallback_simulation(p_actor uuid,p_kind text,p_source_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; pref public.fallback_simulation_preferences; lang_version public.communication_translations;
  source_digest text; queued integer:=0; inserted_id uuid;
begin
  perform private.lock_fallback_source(p_actor,p_kind,p_source_id);
  select * into s from private.communication_source(p_kind,p_source_id);
  if s.superseded or not (exists(select 1 from public.student_updates where p_kind='update' and id=p_source_id and importance='important')
    or exists(select 1 from public.announcements where p_kind='announcement' and id=p_source_id and priority='important')) then raise exception 'important current source required'; end if;
  source_digest:=private.communication_hash(s.title,s.body);
  if (select count(*) from public.fallback_simulation_preferences p where p.school_id=s.school_id and p.opted_in
    and private.fallback_parent_link(p.parent_id,p_kind,p_source_id))>100 then raise exception 'synthetic cohort limit exceeded'; end if;
  for pref in select * from public.fallback_simulation_preferences where school_id=s.school_id and opted_in order by id loop
    if not private.lock_fallback_parent(pref.parent_id,p_kind,p_source_id) then continue; end if;
    select * into pref from public.fallback_simulation_preferences where id=pref.id for update;
    if not pref.opted_in then continue; end if;
    select * into lang_version from public.communication_translations t where t.language=pref.preferred_language and t.status='approved' and t.source_hash=source_digest
      and ((p_kind='update' and t.student_update_id=p_source_id) or (p_kind='announcement' and t.announcement_id=p_source_id)) for share;
    inserted_id:=null;
    insert into public.fallback_simulation_deliveries(school_id,preference_id,student_update_id,announcement_id,channel,requested_language,language,translation_id,source_hash,content_hash,consent_version,queued_by)
    values(s.school_id,pref.id,case when p_kind='update' then p_source_id end,case when p_kind='announcement' then p_source_id end,
      pref.channel,pref.preferred_language,case when lang_version.id is null then 'original' else pref.preferred_language end,
      lang_version.id,source_digest,case when lang_version.id is null then source_digest else private.communication_hash(lang_version.title,lang_version.body) end,pref.version,p_actor)
    on conflict do nothing returning id into inserted_id;
    if inserted_id is not null then
      queued:=queued+1;
      insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id)
        values(s.school_id,p_actor,'simulated_delivery_queued','fallback_simulation',inserted_id);
    end if;
  end loop;
  return queued;
end $$;

create function public.review_fallback_simulation(p_actor uuid,p_kind text,p_source_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope_school uuid; result jsonb;
begin
  if not private.fallback_operator(p_actor,p_kind,p_source_id) then raise exception 'not authorized'; end if;
  select school_id into scope_school from private.communication_source(p_kind,p_source_id);
  select jsonb_build_object('simulated',true,'eligible_count',(select count(*) from public.fallback_simulation_preferences p
    where p.school_id=scope_school and p.opted_in and private.fallback_parent_link(p.parent_id,p_kind,p_source_id)),
    'deliveries',coalesce((select jsonb_agg(r order by r.created_at) from (
      select id,channel,language,requested_language,status,attempt_count,next_attempt_at,receipt_ref,last_code,created_at
      from public.fallback_simulation_deliveries where (p_kind='update' and student_update_id=p_source_id)
        or (p_kind='announcement' and announcement_id=p_source_id) order by created_at limit 200) r),'[]'::jsonb)) into result;
  return result;
end $$;

-- Two-phase simulation: prepare authorizes an ephemeral payload; finish rechecks
-- all authority under locks before persisting any fake receipt. Provider has no IO.
create function public.step_fallback_simulation(p_actor uuid,p_delivery_id uuid,p_phase text,
  p_expected_updated_at timestamptz default null,p_result jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.fallback_simulation_deliveries; pref public.fallback_simulation_preferences;
  s record; tr public.communication_translations; kind text; source_id uuid; valid_parent boolean;
  reason text; outcome text; delay_seconds integer; payload_title text; payload_body text;
begin
  if p_phase is null or p_phase not in ('prepare','finish') then raise exception 'invalid simulation phase'; end if;
  select * into d from public.fallback_simulation_deliveries where id=p_delivery_id;
  if not found then raise exception 'not authorized'; end if;
  kind:=case when d.student_update_id is null then 'announcement' else 'update' end;
  source_id:=coalesce(d.student_update_id,d.announcement_id);
  perform private.lock_fallback_source(p_actor,kind,source_id);
  select * into s from private.communication_source(kind,source_id);
  select * into pref from public.fallback_simulation_preferences where id=d.preference_id;
  valid_parent:=private.lock_fallback_parent(pref.parent_id,kind,source_id);
  select * into pref from public.fallback_simulation_preferences where id=d.preference_id for update;
  if d.translation_id is not null then select * into tr from public.communication_translations where id=d.translation_id for share; end if;
  select * into d from public.fallback_simulation_deliveries where id=p_delivery_id for update;
  if d.status in ('delivered','failed','blocked') then return jsonb_build_object('simulated',true,'ready',false,'status',d.status); end if;
  if s.superseded or d.source_hash<>private.communication_hash(s.title,s.body)
    or not(exists(select 1 from public.student_updates where kind='update' and id=source_id and importance='important')
      or exists(select 1 from public.announcements where kind='announcement' and id=source_id and priority='important')) then reason:='source_changed';
  elsif not valid_parent then reason:='link_unavailable';
  elsif not pref.opted_in or pref.version<>d.consent_version then reason:='consent_changed';
  elsif d.language<>'original' and (tr.id is null or tr.status<>'approved' or tr.source_hash<>d.source_hash
    or tr.language<>d.language or private.communication_hash(tr.title,tr.body)<>d.content_hash) then reason:='translation_changed'; end if;
  if reason is not null then
    update public.fallback_simulation_deliveries set status='blocked',last_code=reason,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=d.id;
    insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id,metadata)
      values(d.school_id,p_actor,'simulated_delivery_blocked','fallback_simulation',d.id,jsonb_build_object('reason',reason));
    return jsonb_build_object('simulated',true,'ready',false,'status','blocked');
  end if;
  if d.next_attempt_at>clock_timestamp() then return jsonb_build_object('simulated',true,'ready',false,'status',d.status); end if;
  if p_phase='prepare' then
    payload_title:=case when d.language='original' then s.title else tr.title end;
    payload_body:=case when d.language='original' then s.body else tr.body end;
    return jsonb_build_object('simulated',true,'ready',true,'idempotency_key',d.id,'recipient_ref',pref.recipient_ref,'channel',d.channel,
      'title',payload_title,'body',payload_body,'content_hash',d.content_hash,'status',d.status,'attempt_count',d.attempt_count,'updated_at',d.updated_at);
  end if;
  if p_expected_updated_at is null or p_expected_updated_at<>d.updated_at then return jsonb_build_object('simulated',true,'ready',false,'status',d.status); end if;
  outcome:=p_result->>'status';
  if p_result->>'label' is distinct from 'SIMULATED' or outcome is null or outcome not in ('accepted','delivered','retry_wait','failed','uncertain')
    or (p_result->>'receipt_ref' is not null and (p_result->>'receipt_ref') !~ '^SIMULATED-[0-9a-f]{32}$') then raise exception 'invalid fake receipt'; end if;
  if d.attempt_count>=5 then return jsonb_build_object('simulated',true,'ready',false,'status',d.status); end if;
  delay_seconds:=least(300,15*(2^d.attempt_count)::integer);
  if outcome='accepted' then delay_seconds:=30; end if;
  if d.attempt_count=4 and outcome in ('retry_wait','uncertain','accepted') then outcome:='failed'; reason:='retry_exhausted'; end if;
  update public.fallback_simulation_deliveries set status=outcome,attempt_count=attempt_count+1,
    next_attempt_at=clock_timestamp()+make_interval(secs=>delay_seconds),receipt_ref=coalesce(p_result->>'receipt_ref',receipt_ref),
    last_code=coalesce(reason,p_result->>'code'),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=d.id;
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id,metadata)
    values(d.school_id,p_actor,'simulated_delivery_step','fallback_simulation',d.id,jsonb_build_object('status',outcome,'attempt',d.attempt_count+1));
  return jsonb_build_object('simulated',true,'ready',false,'status',outcome);
end $$;

revoke all on function public.set_fallback_simulation_preferences(uuid,boolean,boolean,text) from public,anon,authenticated;
revoke all on function public.queue_fallback_simulation(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.review_fallback_simulation(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.step_fallback_simulation(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.set_fallback_simulation_preferences(uuid,boolean,boolean,text) to service_role;
grant execute on function public.queue_fallback_simulation(uuid,text,uuid) to service_role;
grant execute on function public.review_fallback_simulation(uuid,text,uuid) to service_role;
grant execute on function public.step_fallback_simulation(uuid,uuid,text,timestamptz,jsonb) to service_role;
notify pgrst,'reload schema';
