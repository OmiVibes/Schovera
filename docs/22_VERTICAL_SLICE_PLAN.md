# First Vertical Slice Plan

## Goal

Prove the complete, real Teacher → Parent communication loop before building attendance, announcements, attachments, analytics, broad admin tools, or visual polish beyond the required core screens.

## Exact scope

`Teacher login → assigned class → select student → create persisted update → linked parent receives live update → parent acknowledges → teacher sees acknowledgement.`

Principal aggregate visibility is the immediate verification extension after this exact loop passes; it does not introduce administration CRUD.

## Implementation order after Phase 1 approval

1. Create project foundation, environment template, formatting/lint/test baseline; no feature screens yet.
2. Configure Supabase Auth and database migration for only schools/profiles/classes/assignments/students/parent links/student updates/acknowledgements/audit events.
3. Implement and test RLS/RPC policies with Teacher A, Parent A, Parent B, Principal A/B identities before UI receives real data.
4. Seed fictional Greenfield demo dataset and create a guarded reset process.
5. Build teacher sign-in, protected route, assigned class list, roster, student detail, and structured send form.
6. Implement secure persisted update transaction and teacher confirmation/history.
7. Build parent sign-in, linked-child dashboard/timeline, detail, and idempotent acknowledgement transaction.
8. Add authenticated Supabase Realtime subscriptions plus refetch/recovery path for parent receipt and teacher acknowledgement.
9. Add minimal principal coverage read-only aggregate and live/refetch update.
10. Run all Core/Security tests in `20_COMPETITION_ACCEPTANCE_TESTS.md`; fix failures before any secondary feature.

## Slice acceptance gate

The slice is complete only when C01–C07, S01–S05, R01–R02, and D01 from the competition test plan pass. It must use real Auth, PostgreSQL persistence, RLS, and Realtime—not mock state, browser storage, simulated notifications, or hard-coded counts.

## Explicitly prohibited until gate passes

Attendance, announcements, resource uploads, parent search/filter extras, bulk import, charts, translation, PWA/push, principal management CRUD, and mobile work.

## Why this order

It proves the product’s business promise and security model at the smallest meaningful scale. Every later module can reuse the verified identity, school isolation, parent-child links, audit pattern, data persistence, and realtime approach without distracting from the presentation’s central story.
