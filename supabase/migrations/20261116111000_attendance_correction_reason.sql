-- Keep exact M1 receipts replayable; new corrections need a useful explanation.
alter function public.write_class_attendance(uuid,date,jsonb,integer,text,text,uuid) rename to write_class_attendance_m1_inner;
revoke all on function public.write_class_attendance_m1_inner(uuid,date,jsonb,integer,text,text,uuid) from public,anon,authenticated,service_role;
create function public.write_class_attendance(p_class_id uuid,p_attendance_date date,p_records jsonb,
  p_expected_revision integer,p_action text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; canonical jsonb; reason text:=btrim(coalesce(p_reason,''));
begin
  perform private.attendance_scope(p_class_id,p_attendance_date);
  if not exists(select 1 from public.attendance_write_receipts where actor_id=auth.uid() and request_id=p_request_id) then
    snapshot:=public.class_attendance_snapshot(p_class_id,p_attendance_date);
    if jsonb_typeof(p_records)='array' then
      select jsonb_agg(jsonb_build_object('student_id',(e->>'student_id')::uuid,'status',e->>'status') order by (e->>'student_id')::uuid) into canonical from jsonb_array_elements(p_records) e;
      if snapshot->>'state'='finalized' and (snapshot->>'revision')::integer=p_expected_revision
        and snapshot->'records' is distinct from canonical and (length(reason) not between 8 and 500 or cardinality(regexp_split_to_array(reason,'\s+'))<2)
        then raise exception 'attendance_reason_required'; end if;
    end if;
  end if;
  return public.write_class_attendance_m1_inner(p_class_id,p_attendance_date,p_records,p_expected_revision,p_action,p_reason,p_request_id);
end $$;
revoke all on function public.write_class_attendance(uuid,date,jsonb,integer,text,text,uuid) from public,anon;
grant execute on function public.write_class_attendance(uuid,date,jsonb,integer,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
