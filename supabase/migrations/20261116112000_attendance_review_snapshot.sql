-- Match M1's class/day lock so revision and confirmation metadata are consistent.
create or replace function public.class_attendance_review(p_class_id uuid,p_attendance_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; rows jsonb; confirmer text; confirmed timestamptz;
begin
  scope:=private.attendance_review_scope(p_class_id,p_attendance_date);
  perform pg_advisory_xact_lock(hashtextextended('school-attendance:'||p_class_id::text||':'||p_attendance_date::text,0));
  if (select count(*) from public.students where class_id=p_class_id and school_id=scope and active)>500 then raise exception 'attendance_scope_too_large'; end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.roll_number,f.student_id),'[]'::jsonb) into rows from private.attendance_review_rows(scope,p_class_id,p_attendance_date) f;
  select p.full_name,r.confirmed_at into confirmer,confirmed from public.attendance_registers r join public.profiles p on p.id=r.confirmed_by
    where r.class_id=p_class_id and r.attendance_date=p_attendance_date;
  return jsonb_build_object('class_id',p_class_id,'attendance_date',p_attendance_date,'rows',rows,'confirming_teacher',confirmer,'confirmed_at',confirmed);
end $$;
notify pgrst,'reload schema';
