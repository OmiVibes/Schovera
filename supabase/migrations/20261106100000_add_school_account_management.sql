-- Account creation only; service-role execution, no public signup or password storage.
create function public.school_account_manager(p_actor uuid, p_session uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare school uuid;
begin
  select school_id into school from public.profiles
    where id=p_actor and active and role='principal' for share;
  if school is null or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor
      and (not_after is null or not_after > now()))
    or not exists(select 1 from auth.users where id=p_actor and (banned_until is null or banned_until < now())
      and (raw_app_meta_data->>'schovera_demo_expires_at' is null
        or (raw_app_meta_data->>'schovera_demo_expires_at')::timestamptz > now())) then
    raise exception 'not authorized';
  end if;
  return school;
end $$;
revoke all on function public.school_account_manager(uuid,uuid) from public,anon,authenticated;
grant execute on function public.school_account_manager(uuid,uuid) to service_role;

create function public.finish_school_account(
  p_actor uuid, p_session uuid, p_user uuid, p_request uuid, p_hash text,
  p_name text, p_email text, p_role public.app_role,
  p_classes uuid[], p_children uuid[], p_confirm_principal boolean
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare school uuid; existing public.profiles; auth_row auth.users; matched integer;
begin
  school := public.school_account_manager(p_actor,p_session);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if p_name is null or char_length(btrim(p_name)) not between 2 and 120
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_classes is null or p_children is null or p_role is null
    or cardinality(p_classes)>50 or cardinality(p_children)>50
    or (select count(distinct id) from unnest(p_classes) id)<>cardinality(p_classes)
    or (select count(distinct id) from unnest(p_children) id)<>cardinality(p_children)
    or (p_role='parent' and (cardinality(p_children)=0 or cardinality(p_classes)<>0))
    or (p_role='teacher' and (cardinality(p_classes)=0 or cardinality(p_children)<>0))
    or (p_role='principal' and (p_confirm_principal is distinct from true or cardinality(p_classes)<>0 or cardinality(p_children)<>0))
    then raise exception 'invalid account'; end if;
  select * into auth_row from auth.users where id=p_user for share;
  if not found or auth_row.email<>p_email
    or auth_row.raw_app_meta_data->>'provisioned_by' is distinct from p_actor::text
    or auth_row.raw_app_meta_data->>'provisioning_request' is distinct from p_request::text
    or auth_row.raw_app_meta_data->>'provisioning_hash' is distinct from p_hash then
    raise exception 'account request mismatch'; end if;
  perform id from public.classes where id=any(p_classes) and school_id=school and active for share;
  get diagnostics matched = row_count;
  if matched<>cardinality(p_classes) then raise exception 'class not authorized'; end if;
  perform id from public.students where id=any(p_children) and school_id=school and active for share;
  get diagnostics matched = row_count;
  if matched<>cardinality(p_children) then raise exception 'child not authorized'; end if;
  select * into existing from public.profiles where id=p_user;
  if found then
    if existing.school_id<>school or existing.role<>p_role or existing.email<>p_email or existing.full_name<>p_name then
      raise exception 'idempotency conflict'; end if;
    return p_user;
  end if;
  insert into public.profiles(id,school_id,role,full_name,email,active)
    values(p_user,school,p_role,p_name,p_email,true);
  insert into public.teacher_class_assignments(teacher_id,class_id) select p_user,unnest(p_classes);
  insert into public.parent_student_links(parent_id,student_id,status) select p_user,unnest(p_children),'active';
  insert into public.audit_events(school_id,actor_id,event_type,target_type,target_id,metadata)
    values(school,p_actor,'school_account_created','profile',p_user,jsonb_build_object('role',p_role,'request_id',p_request));
  return p_user;
end $$;
revoke all on function public.finish_school_account(uuid,uuid,uuid,uuid,text,text,text,public.app_role,uuid[],uuid[],boolean) from public,anon,authenticated;
grant execute on function public.finish_school_account(uuid,uuid,uuid,uuid,text,text,text,public.app_role,uuid[],uuid[],boolean) to service_role;
notify pgrst,'reload schema';
