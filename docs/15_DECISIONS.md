# Decisions Register

## Locked

| Decision | Choice |
|---|---|
| Product scope | School-to-Home Communication Loop |
| Active roles | Teacher, Parent, Principal only |
| Student | Protected domain entity; no V1 login |
| Primary record | Structured student update |
| Core proof | Teacher send → Parent live receipt/acknowledgement → Teacher status → Principal coverage |
| Platform/stack | Responsive web; Next.js, TypeScript, Supabase/PostgreSQL/Auth/RLS/Realtime |
| AI | Excluded |
| Source reuse | Reuse lessons only; do not import old project code |
| Demo data | Fictional, seeded, resettable |

## Scope decision from implementation-plan review

Attendance and announcements are sensible future school functions but are secondary to the communication loop. They are documented, schema-ready, and explicitly deferred until the first slice passes `20_COMPETITION_ACCEPTANCE_TESTS.md`. This avoids a scope conflict with the requested vertical-slice-first approach.

## Still needs owner approval

1. Final public product name (EduBridge remains working name).
2. Whether acknowledgement is required only for updates marked Important (recommended) or all updates.
3. Pilot geography/policy and consent route for any real data.
4. Permission/budget for Supabase and hosting accounts after Phase 1 approval.
