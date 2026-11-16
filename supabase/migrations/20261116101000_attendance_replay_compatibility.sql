-- Preserve every existing envelope/receipt; do not rewrite the SQLite queue.
create or replace function public.school_operation_baseline_authorized_inner(p_class_id uuid,p_attendance_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; roster jsonb; revision text; register_revision integer; register_id uuid;
begin
  scope:=public.current_user_school_id();
  if public.current_user_role()<>'teacher' or scope is null or not private.current_teacher_is_assigned(p_class_id)
    or not exists(select 1 from public.classes where id=p_class_id and school_id=scope) then raise exception 'not_authorized'; end if;
  if p_attendance_date is null or p_attendance_date>(select (now() at time zone timezone)::date from public.schools where id=scope) then raise exception 'invalid_operation'; end if;
  select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into roster from public.students where class_id=p_class_id and school_id=scope and active;
  if jsonb_array_length(roster) not between 1 and 500 then raise exception 'invalid_operation'; end if;
  select md5(coalesce(jsonb_agg(jsonb_build_array(student_id,status,updated_at) order by student_id),'[]'::jsonb)::text)
    into revision from public.attendance_records where school_id=scope and class_id=p_class_id and attendance_date=p_attendance_date;
  select id,r.revision into register_id,register_revision from public.attendance_registers r where r.class_id=p_class_id and r.attendance_date=p_attendance_date;
  if register_id is not null then revision:=md5(jsonb_build_array(revision,register_id,register_revision)::text); end if;
  return jsonb_build_object('actor_id',auth.uid(),'school_id',scope,'class_id',p_class_id,'attendance_date',p_attendance_date,'roster',roster,'baseline',revision,'register_revision',coalesce(register_revision,0));
end $$;

create or replace function public.replay_school_operation_authorized_inner(p_envelope jsonb,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); scope uuid:=public.current_user_school_id();
  op uuid; klass uuid; day date; prior public.school_operation_receipts;
  snapshot jsonb; result jsonb; update_id uuid; payload jsonb;
begin
  if public.current_user_role()<>'teacher' or actor is null or scope is null then raise exception 'not_authorized'; end if;
  if p_envelope->>'actor_id' is distinct from actor::text or p_envelope->>'school_id' is distinct from scope::text then raise exception 'not_authorized'; end if;
  op:=(p_envelope->>'operation_id')::uuid; klass:=(p_envelope->>'class_id')::uuid; day:=(p_envelope->>'attendance_date')::date; payload:=p_envelope->'payload';
  if op is null or klass is null or day is null or p_payload_hash is null or p_payload_hash!~'^[a-f0-9]{64}$' or octet_length(p_envelope::text)>96000
    or p_envelope->>'kind' not in ('attendance','update') or p_envelope->>'authored_at' is null then raise exception 'invalid_operation'; end if;
  begin perform (p_envelope->>'authored_at')::timestamptz; exception when others then raise exception 'invalid_operation'; end;
  if not private.current_teacher_is_assigned(klass) or not exists(select 1 from public.classes where id=klass and school_id=scope) then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('school-operation:'||actor::text||':'||op::text,0));
  select * into prior from public.school_operation_receipts where actor_id=actor and operation_id=op;
  if found then
    if prior.envelope is distinct from p_envelope or prior.payload_hash<>p_payload_hash or prior.school_id<>scope then raise exception 'operation_conflict'; end if;
    return prior.receipt;
  end if;
  if p_envelope->>'kind'='attendance' then
    perform pg_advisory_xact_lock(hashtextextended('school-attendance:'||klass::text||':'||day::text,0));
    snapshot:=public.school_operation_baseline(klass,day);
    if snapshot->>'baseline' is distinct from p_envelope->>'baseline' then raise exception 'attendance_conflict'; end if;
    if payload ? 'attendance_version' then
      if payload->>'attendance_version' is distinct from '2' or payload->>'action' not in ('draft','finalize')
        or (payload->>'expected_revision') is null or (payload->>'expected_revision') !~ '^[0-9]+$'
        then raise exception 'invalid_operation'; end if;
      if (payload->>'expected_revision')::integer<>(snapshot->>'register_revision')::integer then raise exception 'attendance_conflict'; end if;
    elsif (select revision from public.attendance_registers where class_id=klass and attendance_date=day) is not null then
      -- Legacy rows have no revision/reason. Retain them for reviewed resolution
      -- instead of guessing a correction or altering their immutable envelope.
      raise exception 'attendance_review_required';
    end if;
    perform public.write_class_attendance(klass,day,payload->'records',
      (snapshot->>'register_revision')::integer,coalesce(payload->>'action','finalize'),payload->>'reason',op);
  else
    if payload->>'importance' is distinct from 'important' then raise exception 'invalid_operation'; end if;
    update_id:=public.send_student_update(klass,(payload->>'student_id')::uuid,(payload->>'category')::public.update_category,payload->>'title',payload->>'message','important',op);
  end if;
  result:=jsonb_build_object('operation_id',op,'confirmed',true,'received_at',now(),'record_id',update_id);
  insert into public.school_operation_receipts(actor_id,school_id,operation_id,envelope,payload_hash,receipt) values(actor,scope,op,p_envelope,p_payload_hash,result);
  return result;
end $$;

notify pgrst,'reload schema';
