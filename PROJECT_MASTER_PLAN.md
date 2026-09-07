# EduBridge — Master Plan

## Status and authority

**Phase:** 0 documentation finalisation. Application implementation is blocked until the project owner explicitly approves Phase 1. This document is the authoritative V1 definition, aligned to `ROBOTEX_IMPLEMENTATION_PLAN.md`. Where the two plans differ, this master plan sets the current V1 scope and records the difference in `docs/15_DECISIONS.md`.

## Product in one sentence

EduBridge is a secure school-to-home communication platform: a teacher creates a structured update for a student, the linked parent receives and acknowledges it, and the principal sees whether important school communication is reaching families.

## Central problem

Important school/student communication is fragmented across verbal messages, notebooks, paper notices, calls, and group chats. Parents often receive information late or without context, while school leadership cannot easily see whether important communication reached families.

## V1 success definition

At one fictional or consented pilot school, a teacher can select an assigned class and student, create a structured update in under one minute, and persist it. The linked parent receives it live, acknowledges it, the teacher sees that acknowledgement live, and the principal sees a truthful school-level communication aggregate. The result survives refresh and respects role/school permissions.

## Active V1 roles

| Role | Main job |
|---|---|
| Teacher | Select an assigned student, send a structured parent update, and see acknowledgement status/history. |
| Parent | See only linked child/children, receive updates, and acknowledge important updates. |
| Principal / School Admin | View school-level communication coverage and, after core-loop approval, publish official announcements. |

**Student is not a V1 login role.** A student is a protected school entity connecting a teacher, class, and linked parent(s).

## Primary communication loop

`Teacher → structured student update → linked Parent → acknowledgement → Teacher status → Principal communication coverage`

Acknowledgement means “I have seen this update.” It does not prove attendance, homework completion, learning, parenting quality, or agreement with the content.

## Deliberate V1 boundary

EduBridge is not a generic school ERP, LMS, chat app, social feed, grade book, fee system, timetable, AI tutor, or teacher-ranking tool.

The **first complete vertical slice** is only:

`Teacher login → assigned class → student → persisted update → linked parent receives live update → parent acknowledgement → teacher sees status.`

Principal aggregate visibility follows once this slice passes its acceptance tests. Attendance, announcements, attachments, and other secondary items remain documented future V1 extensions; they must not delay or dilute the primary slice.

## Non-negotiable rules

- Every displayed status/statistic must be derived from stored, authorized data.
- A teacher may act only for assigned classes/students.
- A parent may access only explicitly linked children.
- A principal may access only their own school.
- Browser-submitted roles and school IDs are never trusted for authorization.
- The demonstration uses realistic fictional data, with a repeatable reset process.
- No fake live updates, fake acknowledgement, placeholder metric, decorative AI, or dead action is acceptable.

## Technology decision

When Phase 1 is approved, build a responsive website with Next.js and TypeScript; use Supabase for PostgreSQL, Auth, Row Level Security, and Realtime. This is one understandable product path: browser → authenticated application → permission-checked database → live authorised change.

## Approval gates

1. Owner approves this corrected role model and V1 boundary.
2. Owner approves final public product name and visual direction.
3. Owner approves Supabase/hosting account creation before implementation.
4. Owner approves demo data and any real-pilot privacy/consent plan.
5. Owner approves the completed vertical slice before attendance, announcements, or any secondary module begins.

Detailed specifications: `docs/16_DATABASE_SCHEMA.md` through `docs/22_VERTICAL_SLICE_PLAN.md`.
