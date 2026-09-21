-- One normal teacher-send operation may be retried safely without creating a second update.
-- Historical rows and Task 22 correction rows intentionally retain a NULL request identifier.
alter table public.student_updates
  add column if not exists client_request_id uuid;

create unique index if not exists student_updates_teacher_request_id_idx
  on public.student_updates(teacher_id, client_request_id)
  where client_request_id is not null;
