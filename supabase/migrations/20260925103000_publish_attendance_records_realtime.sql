-- Student Profile subscribes to attendance alongside updates, acknowledgements,
-- and assignments. Keep the table in the existing Realtime publication so one
-- unavailable table cannot invalidate the whole authorized profile channel.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_records'
  ) then
    alter publication supabase_realtime add table public.attendance_records;
  end if;
end
$$;
