# Task 32R — International software finalization

## Baseline and initial gap analysis (2026-10-21)

Initial branch `test/task32p-final-software-audit`, HEAD `af61329db694cf49533047fc4823d5a87b3b0546`; tracked state clean. Protected untracked instructions/logs/review and the ignored private credential guide are preserved. Task 32P is an ancestor. No Task 32Q branch, matching commit or implementation was found locally; its safe local preparation/online isolation design is included here, **not cloud deployment**. Branch: `feat/task32r-international-software-finalization`.

This matrix is the **initial source audit**, not a claim of new passing tests. Final evidence is added below as checks execute.

| Requirement | Initial classification | Source / test evidence to rerun | Task 32R action |
|---|---|---|---|
| Role dashboards, navigation, session/logout | Fully implemented with previous verification | scho vera shared shell; role-navigation/reconnect | Fresh connected/browser verification |
| School/class/linked-child security | Fully implemented with previous verification | RLS migrations; phase1/v2/translation/fallback/insights integration | Rerun denial cases, preserve policies |
| Student records/profile | Fully implemented with previous verification | Student overview; verify:student-profile | 20-person roster and browser checks |
| Attendance/corrections/insights | Fully implemented with previous verification | Attendance RPC; rules; verify:attendance/test:attendance-insights | Coherent fictional patterns, correction regression |
| Homework | Implemented, edit capability requires audit | Assignment RPC/UI; verify:assignments | Browser create/edit capability truthfully recorded |
| Timetable | Fully implemented with previous verification | Timetable RPC/conflicts; verify:timetable | Two-class weekly schedule; browser management |
| Important updates/corrections/acknowledgements | Fully implemented with previous verification | Immutable-update RPCs; verify:corrections/idempotency | Full three-role flow |
| Teacher draft/Principal translation approval | Fully implemented with previous verification | communication_translations RLS/version checks | Hindi/Marathi fixture workflows; original preserved |
| Fully localized entire UI | Implemented but requiring correction / partial legacy copy | i18n dictionaries versus hardcoded staff/profile strings | Record exact scope; no blanket full-localization claim |
| Browser voice | Implemented; audible output blocked by device/voice availability | parent-speech controller and mocked/browser tests | Inspect stalled/error transitions; AUDIO NOT VERIFIED unless actually heard |
| Automatic translation | Missing; local model suitability unverified | Installed Ollama model inventory; no translation endpoint | Synthetic local investigation only; block if unsuitable |
| Teacher AI / spreadsheet | Implemented with local-service dependency | Teacher-only API; lazy workbook import; verify:teacher-ai | Live local model where available; export checks |
| SMS/IVR | Simulated | Fake provider, consent/delivery tables, test:fallback | Consent/retries/scope; no actual provider |
| Offline gateway / assignment-bound v2 | Implemented local software, synthetic observations | SQLite WAL, signed endpoint, gateway/RFID suites | Restart/sync/replay/revocation; no hardware |
| Entry panels / polling | Fully implemented with previous verification | RLS reads, foreground scheduler | Fictional scans and per-role isolation |
| Low-bandwidth web performance | Missing measurements | No Task 32P throttled evidence | Measure controlled slow-link initial load and navigation |
| Offline Parent/Teacher browser | Partial in-memory loaded state; no durable offline app | No service worker/private offline cache | Test disconnect/logout; no uncontrolled personal-data caching |
| Mobile / accessibility | Implemented with previous bounded checks | 22 routes × four widths; accessibility/i18n | Fresh screenshots/keyboard/labels; no certification claim |
| Demo data | Implemented but requiring correction | Two-child manual fixture | Idempotent owned 20-fictional-student provisioning |
| Isolated build/local launcher | Fully implemented with previous verification | build:isolated / dev:simulators-local | Preserve production-env exclusion; dedicated audit server |
| Separate online demo | Documentation only / authorization blocked | No Task 32Q found | Preflight/template/runbook; no resource creation or deployment |
| Dependency/API security | Production patch present; dev advisory previously open | Next16.3.8; npm audit; endpoint guards | Fresh audit, no blind major downgrade |
| Pilot/impact/business | Documentation only | Task32O explicitly hypothetical plan | Student-friendly explanation without invented outcomes |

## Execution plan

1. Local-only 20-student demo, owned journal/reset, explicit Demo Environment label.
2. Speech failure handling and deterministic tests; local translation suitability probe.
3. Measured slow-link/browser journeys and current regression suites, with failures classified.
4. START_HERE, student handbook, online approval/preflight materials, final evidence and isolated build.

No existing migration, production configuration, paid service, real student, hardware, push, merge or deployment is in scope. Tests are marked pending until executed. No repository removals are planned without actual usage evidence.
