# Staged Implementation Roadmap

Implementation does not start until the owner approves the master plan.

## Stage 0 — Validate (before code)

- Approve name, central problem, MVP, and tech stack.
- Conduct short structured interviews with teachers/students/parents.
- Create a low-fidelity clickable flow and test comprehension.
- Define fictional demo data and data/privacy policy.

**Exit:** evidence that the core loop is understood and a scope-freeze decision.

## Stage 1 — Foundation

- Create separate EduBridge repository/project and documented environment setup.
- Configure Next.js, TypeScript, Supabase project, authentication, schema, and row-level policies.
- Establish design tokens, error handling, and demo seed/reset mechanism.

**Exit:** role sign-in works; no user can access an unauthorized class record.

## Stage 2 — Core loop

- Teacher create/draft/publish Learning Update flow.
- Parent linked-child update detail and acknowledgement.
- Teacher acknowledgement status.
- Principal read-only communication coverage.

**Exit:** end-to-end flow persists through refresh using demo data.

## Stage 3 — Quality and pilot readiness

- Responsive UI, empty/loading/error states, input validation, accessibility pass.
- Automated tests for permissions, validation, and core actions.
- Manual cross-role and presentation-day test script.
- Small controlled pilot using consented/non-sensitive data if approved.

**Exit:** no decorative buttons, known limitations documented, feedback reviewed.

## Stage 4 — Robotex readiness

- Freeze demo build; seed/backup/reset rehearsed.
- Create 90-second script, visual board, Q&A practice, and contingency plan.
- Conduct three timed run-throughs with a non-technical adult audience.

**Exit:** student can explain problem, inputs, process, outputs, limitations, business model, and future roadmap in her own words.

## Stage 5 — After competition (only if validated)

- Pilot expansion, reminders, selected multilingual support, mobile app assessment, and carefully chosen integrations.

No feature enters a stage merely because it is impressive; it must support the core learning-continuity promise.
