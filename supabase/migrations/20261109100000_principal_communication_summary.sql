-- AUD-01: exact statistics and a bounded feed from one authorized MVCC snapshot.
-- Additive/read-only. Existing tables, data, grants and RLS policies are unchanged.
create or replace function public.principal_communication_page(
  p_filter text default 'all',
  p_before_sent_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 40
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.current_profile();
  if actor.id is null or not actor.active or actor.role <> 'principal'
    or public.current_user_role() is distinct from 'principal' then
    raise exception 'principal access required' using errcode = '42501';
  end if;
  if p_filter is null or p_filter not in ('all', 'awaiting')
    or p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_before_sent_at is null) <> (p_before_id is null)) then
    raise exception 'invalid communication page' using errcode = '22023';
  end if;
  return (
    with scoped as materialized (
      select u.id, u.sent_at, u.importance,
        exists(select 1 from public.student_updates c
          where c.corrects_update_id = u.id and c.school_id = actor.school_id) as corrected,
        exists(select 1 from public.acknowledgements a where a.update_id = u.id) as acknowledged
      from public.student_updates u where u.school_id = actor.school_id
    ), summary as (
      select count(*) as total_count,
        count(*) filter (where not corrected) as effective_count,
        count(*) filter (where not corrected and importance = 'important') as important_count,
        count(*) filter (where not corrected and importance = 'important' and acknowledged) as acknowledged_count,
        count(*) filter (where not corrected and importance = 'important' and not acknowledged) as awaiting_count
      from scoped
    ), candidates as materialized (
      select s.* from scoped s
      where (p_filter = 'all' or (not s.corrected and s.importance = 'important' and not s.acknowledged))
        and (p_before_sent_at is null or (s.sent_at, s.id) < (p_before_sent_at, p_before_id))
      order by s.sent_at desc, s.id desc limit p_limit + 1
    ), page as (
      select * from candidates order by sent_at desc, id desc limit p_limit
    )
    select jsonb_build_object(
      'school_id', actor.school_id,
      'summary', to_jsonb(summary) || jsonb_build_object('coverage',
        case when important_count = 0 then null
          else round(100.0 * acknowledged_count / important_count)::integer end),
      'updates', coalesce((
        select jsonb_agg(to_jsonb(u) || jsonb_build_object(
          'is_corrected', p.corrected,
          'correction_title', (select original.title from public.student_updates original
            where original.id = u.corrects_update_id and original.school_id = actor.school_id),
          'students', (select jsonb_build_object('full_name', s.full_name, 'roll_number', s.roll_number,
            'classes', (select jsonb_build_object('grade', c.grade, 'division', c.division)
              from public.classes c where c.id = s.class_id and c.school_id = actor.school_id))
            from public.students s where s.id = u.student_id and s.school_id = actor.school_id),
          -- The UI needs only acknowledgement existence, not the guardian roster.
          'acknowledgements', case when p.acknowledged then jsonb_build_array(jsonb_build_object(
            'acknowledged_at', (select min(a.acknowledged_at) from public.acknowledgements a where a.update_id = u.id)))
            else '[]'::jsonb end
        ) order by p.sent_at desc, p.id desc)
        from page p join public.student_updates u on u.id = p.id
      ), '[]'::jsonb),
      'has_more', (select count(*) > p_limit from candidates)
    ) from summary
  );
end;
$$;
revoke all on function public.principal_communication_page(text,timestamptz,uuid,integer) from public, anon;
grant execute on function public.principal_communication_page(text,timestamptz,uuid,integer) to authenticated;
comment on function public.principal_communication_page(text,timestamptz,uuid,integer) is
  'Active Principal/session only; derives school from current_profile; SECURITY DEFINER with explicit tenant checks on every relationship. Exact correction-effective totals and keyset feed, one snapshot. No tenant argument; existing table RLS unchanged.';
