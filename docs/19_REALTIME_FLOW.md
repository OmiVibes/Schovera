# Realtime Flow

## Mechanism

Use Supabase Realtime Postgres Changes with authenticated subscriptions on `student_updates` and `acknowledgements`. Realtime is a notification mechanism, not authorization. RLS applies to subscription/row visibility; after every event the client refetches authorized data through the normal query/RPC path. The write is complete only after the database transaction commits.

## Teacher sends update

1. Teacher selects an assigned class and student, enters category/title/message/importance, and submits.
2. Browser sends only the form data and selected IDs with the authenticated user JWT. It does not send trusted role/teacher/school data.
3. A secured server route or security-definer RPC derives the caller from `auth.uid()`, verifies teacher role, active class assignment, student-class-school match, validates input, inserts `student_updates`, writes `audit_events`, and commits atomically.
4. The server returns the persisted update ID/time. Only now does teacher UI display “Sent.”
5. The committed insert is published through Supabase Realtime to sessions whose authenticated RLS SELECT policy permits that update.

## Linked parent receives live update

1. Parent has an authenticated narrow subscription for their authorized student-update scope; no public/global channel is used.
2. Realtime signals an insert. Parent client refetches inbox/timeline using RLS.
3. The query succeeds only if active `parent_student_links.parent_id = auth.uid()` for the update’s student. The new card appears without refresh.
4. If socket delivery is interrupted, initial/refocus fetch still loads persisted data. Realtime improves immediacy; it is not the sole delivery guarantee.

## Parent acknowledges

1. Parent presses Acknowledge on one authorized sent update.
2. A secured RPC derives `parent_id = auth.uid()`, confirms active link to that update’s student, inserts acknowledgement, and writes audit event.
3. Unique `(update_id,parent_id)` makes repeat presses safe/idempotent. The database response updates the parent UI.
4. Commit emits Realtime acknowledgement change.

## Teacher and principal update live

1. Teacher subscribed to their authorized authored/assigned update status receives acknowledgement event, then refetches status; it becomes “Acknowledged” with stored time.
2. Principal subscribed only to own-school coverage-change signal receives event, then calls restricted aggregate function/view. Metrics are recalculated from committed rows—never incremented from browser events.
3. If either subscription fails, polling on page focus/manual retry provides truthful persisted status.

## Realtime safeguards and test criteria

- Subscribe after sign-in; unsubscribe on logout/role change.
- Do not put message contents, parent names, IDs, or tokens in broad broadcast payloads.
- Test parent A and School B subscriptions receive no event/data for unauthorized updates.
- Test update/acknowledgement with two browsers and confirm both server persistence and live UI changes.
- Show an unobtrusive connection/retry state; never claim “live” if only a local optimistic update exists.
