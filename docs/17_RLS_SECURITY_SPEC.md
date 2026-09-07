# RLS Security Specification

## Security principle

Supabase Auth establishes identity; PostgreSQL RLS establishes data access. The browser is an untrusted display client. Hiding a menu, route, or button is never authorization.

## Trusted facts

- `auth.uid()` identifies the signed-in account.
- `profiles` is looked up by `auth.uid()` to get the server-stored role and school.
- Role and school supplied in URL, form body, local storage, or client state are ignored for permission decisions.
- The Supabase `anon` key is public by design but has RLS-limited access. The `service_role` key bypasses RLS and is server-only: it is never sent to the browser, never prefixed `NEXT_PUBLIC_`, never stored in client bundles, logs, or repository files.

## Required RLS policy matrix

| Table | Teacher | Parent | Principal |
|---|---|---|---|
| profiles | own profile only; minimal same-school directory only if required | own profile only | same-school profiles as needed for administration |
| classes | active assigned classes | classes containing linked active child | own-school classes |
| assignments | own assignments | none | own-school assignments |
| students | students in active assigned class | active linked children only | own-school students |
| parent links | only aggregate/link existence for assigned student if needed; not parent private profile | own active links | own-school links |
| student updates | author/assigned student updates; create only through secured RPC | sent updates for active linked child | own-school records/read aggregate |
| acknowledgements | read for own authorized update; never create for parent | create/read own acknowledgement only for linked child update | own-school aggregate/read if business need is approved |
| audit events | no direct client access | no direct client access | no direct client access; audited server report only if required |

## Mandatory proof cases

### Parent A cannot access Parent B’s child

`students` parent SELECT requires an `exists` row in `parent_student_links` where `parent_id = auth.uid()`, `student_id = students.id`, and link status is active. `student_updates` and `acknowledgements` repeat the same active-link existence condition through their update/student relationship. A guessed child UUID returns zero rows, not an authorization bypass. Parent A cannot insert an acknowledgement unless a matching active link exists.

### Teacher only accesses assigned classes/students

Teacher class/student/update SELECT and update/create policies require an active `teacher_class_assignments` row with `teacher_id = auth.uid()` and matching class. Creating an update additionally calls a database function that checks teacher role, assignment, student-class match, and same school in one transaction. A teacher changing `class_id` or `student_id` in a request cannot write to an unassigned class.

### Principal only accesses own school

Every principal policy uses the authenticated principal profile’s stored `school_id` and compares it to the row’s `school_id`. A principal from School A querying a School B UUID receives no rows and cannot create/update/delete School B rows. Principal metrics are a security-restricted function/view parameterized from their own profile school, not a browser-provided school ID.

### School A cannot access School B

All tenant tables include `school_id`; all policies compare it to the caller profile’s school. Linking tables and writes also validate both connected entities belong to that school. `schools` itself exposes only the caller’s school row. Cross-school foreign-key combinations are rejected by a constrained database function/trigger.

## Write controls

- Profiles/role/school assignments are created by a server-only admin workflow; users cannot promote themselves.
- Teacher sends updates via a `security definer` RPC or server route using the caller JWT, which derives `teacher_id` from `auth.uid()` and validates class/student assignment.
- Parent acknowledgement RPC derives `parent_id` from `auth.uid()` and verifies parent-child link. The unique constraint makes the action idempotent.
- Principal coverage is read-only derived data. Principal announcement write is deferred until after core-loop approval.
- Audit records are inserted by trusted database trigger/RPC only; no client policy permits alteration.

## Realtime controls

Enable Realtime only for `student_updates` and `acknowledgements` after their SELECT RLS policies are tested. Supabase Realtime must use the subscribing user’s authenticated JWT and RLS-authorized replication. Clients subscribe to a narrow, authorized channel/filter; they must refetch the row through RLS after an event rather than trusting event payload as authority. No public broadcast channel may contain child/update data.

## Verification tests before release

Run database/API tests with separate Teacher A, Parent A, Parent B, Principal A, and Principal B accounts. Attempt direct REST queries, RPC calls, and guessed IDs—not just UI navigation. Pass only if unauthorized SELECT, INSERT, UPDATE, DELETE, and Realtime subscription attempts produce no protected data/action.
