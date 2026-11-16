-- M4: append-only resolution receipts. Original queue envelopes are never edited.
create table public.school_operation_resolutions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade, class_id uuid not null references public.classes(id) on delete cascade,
 attendance_date date not null, original_operation_id uuid not null, original_payload_hash text not null check(original_payload_hash~'^[a-f0-9]{64}$'),
 request_id uuid not null, disposition text not null check(disposition in ('new_attendance_write','closed_without_applying')),
 intent jsonb not null, reason text not null, result jsonb not null, resolved_at timestamptz not null default now(),
 unique(actor_id,original_operation_id),unique(actor_id,request_id)
);
alter table public.school_operation_resolutions enable row level security;
revoke all on public.school_operation_resolutions from public,anon,authenticated;

create function public.resolve_held_school_operation(p_original_id uuid,p_original_hash text,p_class_id uuid,p_attendance_date date,
 p_request_id uuid,p_disposition text,p_expected_revision integer,p_records jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope uuid; actor uuid:=auth.uid(); previous public.school_operation_resolutions; intent jsonb; saved jsonb; result jsonb; reason text:=btrim(coalesce(p_reason,'')); resolution_id uuid:=gen_random_uuid();
begin
 scope:=private.attendance_scope(p_class_id,p_attendance_date);
 if p_original_id is null or p_request_id is null or p_original_id=p_request_id or p_original_hash is null or p_original_hash!~'^[a-f0-9]{64}$'
   or p_disposition is null or p_disposition not in ('new_attendance_write','closed_without_applying') or length(reason) not between 8 and 500
   or cardinality(regexp_split_to_array(reason,'\s+'))<2 then raise exception 'invalid_resolution'; end if;
 intent:=jsonb_build_object('original_id',p_original_id,'hash',p_original_hash,'class',p_class_id,'day',p_attendance_date,'request',p_request_id,'disposition',p_disposition,'revision',p_expected_revision,'records',p_records,'reason',reason);
 perform pg_advisory_xact_lock(hashtextextended('held-resolution:'||actor::text||':'||p_original_id::text,0));
 select * into previous from public.school_operation_resolutions where actor_id=actor and original_operation_id=p_original_id;
 if found then if previous.intent<>intent then raise exception 'operation_conflict'; end if; return previous.result; end if;
 if exists(select 1 from public.school_operation_resolutions where actor_id=actor and request_id=p_request_id) then raise exception 'operation_conflict'; end if;
 if p_disposition='new_attendance_write' then
   if exists(select 1 from public.attendance_write_receipts where actor_id=actor and request_id=p_request_id) then raise exception 'operation_conflict'; end if;
   saved:=public.write_class_attendance(p_class_id,p_attendance_date,p_records,p_expected_revision,'finalize',reason,p_request_id);
   saved:=jsonb_build_object('register_id',saved->'register_id','revision',saved->'revision','state',saved->'state','confirmed_at',saved->'confirmed_at');
 else
   if p_records is not null or p_expected_revision is not null then raise exception 'invalid_resolution'; end if;
 end if;
 result:=jsonb_build_object('resolution_id',resolution_id,'original_operation_id',p_original_id,'request_id',p_request_id,'disposition',p_disposition,'original_applied',false,'replacement',saved,'resolved_at',now());
 insert into public.school_operation_resolutions(id,school_id,actor_id,class_id,attendance_date,original_operation_id,original_payload_hash,request_id,disposition,intent,reason,result)
 values(resolution_id,scope,actor,p_class_id,p_attendance_date,p_original_id,p_original_hash,p_request_id,p_disposition,intent,reason,result);
 return result;
end $$;
revoke all on function public.resolve_held_school_operation(uuid,text,uuid,date,uuid,text,integer,jsonb,text) from public,anon;
grant execute on function public.resolve_held_school_operation(uuid,text,uuid,date,uuid,text,integer,jsonb,text) to authenticated;

create function public.held_school_operation_resolution(p_original_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.school_operation_resolutions;
begin
 select * into r from public.school_operation_resolutions where actor_id=auth.uid() and original_operation_id=p_original_id;
 if not found then
   if not private.school_operation_session_valid() or public.current_user_role() is distinct from 'teacher' then raise exception 'not_authorized'; end if;
   return null;
 end if;
 perform private.attendance_scope(r.class_id,r.attendance_date);
 return r.result;
end $$;
revoke all on function public.held_school_operation_resolution(uuid) from public,anon;
grant execute on function public.held_school_operation_resolution(uuid) to authenticated;
notify pgrst,'reload schema';
