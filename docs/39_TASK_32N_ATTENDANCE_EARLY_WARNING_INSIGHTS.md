# Task 32N — Explainable classroom attendance insights

Baseline: `5e6a18323bb33b969ecd9a69450b216ddb2ebae5`; branch `feat/task32n-attendance-insights`. Local synthetic development only. **Explainable rule-based attendance support, not validated dropout prediction.** No risk scores, ranking, assumed reasons, disciplinary decisions, safety claims or automatic family contact.

## Observations and exact rules

Use existing `attendance_records` (`present`, `absent`, `late`) only. Never read RFID observations, communication preferences, translations or family characteristics. The school `timezone` determines today. Search the previous 60 calendar dates ending yesterday; today is excluded because its register may still be in progress. Per class select the latest **10 distinct dates with authorized records for current active roster students**. Do not synthesize a school date, holiday, weekend or absence.

| Indicator | Exact prerequisite and rule |
|---|---|
| Attendance Follow-up Suggested — repeated recorded absences | At least 5 recorded class dates; every current active student has exactly one valid record on each latest 5. Student has at least 3 `absent` records in those 5. |
| Attendance Follow-up Suggested — consecutive recorded observations | Same complete five-date prerequisite; latest 3 recorded class dates all say `absent`. This is **not** three consecutive school days. |
| Recent improvement | 10 fully recorded dates for the current roster; at least 3 absences in earlier 5, at most 1 in latest 5. Advisory observation, not a validated intervention effect. |
| Data review | Any missing or duplicate/conflicting cell against the current roster on the displayed dates, or malformed values. Missing never becomes absent. Incomplete latest five suppress all pattern conclusions; incomplete earlier five suppress improvement. |

`late` is not absent. One absence and fewer than five dates produce no follow-up pattern. A student matching both follow-up rules counts once in the class's follow-up total. Students are shown in authorized roster order, never sorted by a risk score. Improvement and follow-up counts are counts, not attendance performance rates.

## Prerequisites and limitations

The database enforces one student/date row and the current attendance-save RPC requires the complete active class register; defensive pure logic still detects duplicate/conflicting input. Corrections use the existing Teacher register/RPC; calculations recompute from persisted data after save, manual refresh, focus or reconnect. Insights cannot alter a record to clear an indicator.

There is no authoritative holiday calendar, expected school-day table, historical enrollment interval or excused-absence status. A completely unrecorded class date is unknowable here. Recorded Sunday/holiday entries, if present, are observations, not a claim that the school was open. Historic rows for students no longer in the active roster are excluded. New enrollment or class transfers can make the current-roster comparison incomplete: staff must inspect enrollment context rather than interpret this as a Teacher/student failure. A date-recording gap is not a recorded absence or evidence of consecutive school-day absence.

Coverage means single valid recorded entries divided by the current active roster, **on each recorded date only**. It is not expected-calendar coverage. Class summaries show exact date counts, completeness warnings and advisory counts; no class ranking or misleading cross-class percentages. No conclusion about whether help is needed follows from a missing indicator.

Reads are bounded (100 active classes, 5,000 roster rows, 5,000 attendance rows in 500-row pages). Exceeding a bound fails closed with no partial insights. Principal data collection is bounded schoolwide; this is suitable for the small local demonstration, not an untested large-school analytics service. Reads are not a cross-query transactional snapshot; staff must refresh and review original records before action, particularly during concurrent register edits. The school-date cutoff uses the browser clock converted to the stored school timezone; correct device time is a prerequisite, not a trusted hardware/server-time guarantee. No scheduled polling or automatic push is added.

## UI, privacy and access

Teacher Attendance includes a separate panel for the workspace's currently assigned class; changing account, role, school or class remounts the panel, aborts prior queries and hides stale results. Principal Attendance includes same-school per-class summaries and a class inspector. Both show the search interval, actual recorded dates, explicit thresholds, completeness disclosure, student date/status evidence and read-only advisory explanations. Detail lists paginate 30 students. Teachers must review context and choose any supportive follow-up themselves.

The new loader uses the existing authenticated browser client, verifies the signed-in profile/role/school, restricts Teachers to active assignments and queries only RLS-authorized classes/students/attendance. No service key, privileged reader, API route, new policy, table or migration is added. A forged role argument cannot grant database access. Parents retain the existing linked-child attendance experience; the staff panel is not mounted for Parents and the staff loader rejects Parent profiles. The rule code is not secret: a Parent may still reason about their own authorized records; there is no stored internal indicator dataset newly exposed to them.

The SMS/IVR simulator and communication flows are untouched. Viewing insights cannot queue a message, acknowledge a notice, insert a gate event or write attendance. No follow-up narrative/status storage is introduced; schools must not record medical/family/disciplinary narratives in this feature.

All new visible copy has English/Hindi/Marathi labels, including warnings and states. Native labelled selects, headings, keyboard-operable details, visible focus, text rather than color-only signals, 44px controls and responsive cards are used. Loading and error states withhold prior results; offline hides insights until authorized refetch. Tests of programmatic labels and keyboard behavior are not a real screen-reader user study.

## Local demonstration and checks

Use the same clean disposable worktree procedure as [Task 32M](38_TASK_32M_SMS_IVR_FALLBACK_SIMULATOR.md). Never copy/load `.env.local`. Generate ignored local env files from validated local CLI status; never paste the status output or credentials. From that temporary checkout:

```powershell
npm ci --offline
node scripts/configure-local-supabase-env.mjs
npm run rfid:capability-key:init # only for existing local v2 regression suites
npm run dev:simulators-local
```

In another window at that checkout:

```powershell
npm run test:attendance-insights
npm run test:attendance-insights:integration
```

The integration harness provisions only uniquely scoped synthetic schools/accounts/classes/students. It records synthetic history through the existing attendance RPC, verifies role/RLS scope, opens Teacher/Principal/Parent views, tests language/keyboard/mobile/error/offline/loading behavior, checks read-only invariants and explicit corrections, and removes its own controlled fixtures in `finally`. Existing seeded local demo classes can also be inspected interactively under Attendance. No persistent test login or real child data is created by this task.

For database-only execution before a server is available:

```powershell
$env:SCHOVERA_INSIGHTS_DATABASE_ONLY='1'
npm run test:attendance-insights:integration
Remove-Item Env:SCHOVERA_INSIGHTS_DATABASE_ONLY
```

Run existing attendance, fallback, translations, voice, polling, RFID, gateway, attribution, profile, reconnect, navigation, accessibility and visual checks with their guarded local env. `npm run build:isolated` builds a sanitized committed snapshot without private environment discovery. Stop the test server and remove only the exact generated temporary worktree after path validation; do not delete user-owned directories or protected untracked files.

## Verification record

Local synthetic acceptance was run on 2026-10-20. The initial rule suite had 14 passing tests; subsequent additions cover late status, earlier-period completeness and input immutability. The initial lint run rejected synchronous effect-driven state updates; the component now keys asynchronous results and derives loading state, hiding prior results while a new request is pending. A test-helper TypeScript inference error for nullable Auth user results was corrected with an explicit null check and correct generic response typing. Both issues were found before final verification; neither was bypassed or suppressed.

The local integration test passed its complete browser run on the first attempt: assigned/unassigned Teacher, same/cross-school Principal, Parent staff-loader denial and preserved linked-child attendance, anonymous denial, keyboard record disclosure, English/Hindi/Marathi headings, 390px overflow, offline hiding/reconnect, injected loading/error states, Principal empty-class detail and correction recomputation in an already-open Teacher panel. It compares before/after attendance rows for read-only viewing, then explicitly changes its synthetic history through the existing authorized save RPC and verifies follow-up disappears and improvement appears. Synthetic school rows were checked for zero RFID observations, fallback preferences/deliveries and school communications. Cleanup removed the controlled attendance rows, audits, relationships, accounts, classes and schools and verified absence.

Expanded Teacher mobile and Principal desktop screenshots were inspected. Browser destinations were intercepted and restricted to loopback, with no external attempts. The existing fallback browser regression additionally checks downloaded shared-app JavaScript for the **local** service credential without printing it. Audible speech and real screen-reader user testing were not performed; existing browser voice tests use controlled speech behavior, and the real browser reported zero voice locales. No holidays/enrollment history, real-student pilot, intervention efficacy, dropout prediction or hardware behavior is claimed validated.

| Check | Result |
|---|---|
| `test:attendance-insights` | 21 passed: 17 rule/date/quality tests and 4 account/role/school/class stale-result tests. |
| `test:attendance-insights:integration` | Passed, database-only preflight and full synthetic browser acceptance. |
| `verify:attendance` | Passed roster save/update, Parent history, Principal overview and access isolation. |
| `test:fallback`, `test:fallback:integration` | 10 unit tests and full DB/HTTP/browser suite passed. |
| `test:translations`, `test:translations:integration` | 2 unit tests and complete database/browser approval workflow passed. |
| `test:parent-voice`, `verify:parent-voice` | 13 unit/control tests and 390px browser checks passed; no audible-playback claim. |
| `test:entry-polling` | 4 passed. |
| `test:rfid`, `test:rfid:integration` | 22 unit/helper tests and local v2 integration passed. |
| `test:gateway`, `test:gateway:local-integration` | 43 unit/fault tests and durable-outbox/local-Supabase acceptance passed; existing Node SQLite experimental warning remains. |
| `test:credential-attribution` | 20 passed. |
| `verify:student-profile`, `verify:role-navigation`, `verify:accessibility-i18n` | Passed. |
| `verify:reconnect` | Complete run passed on its first Task 32N attempt, including final timetable recovery. |
| `verify:role-visuals` | All 22 destinations × 1440/1024/768/390px passed, including Teacher and Principal Attendance. |
| `typecheck`, `lint`, `git diff --check` | Passed after the initial development fixes described above; final context-isolation test source was included in typecheck/lint. |
| `build:isolated` | Passed at `0d46ad0a32df201e8bbed50ea90561e1b087c586`, then repeated successfully at final application-code commit `0066d2d071c6a38698d41e37c2b5355b35206b89` after scope-key hardening. Later changes add only tests, a test script and this evidence. |

Total focused unit/control/rule checks: **135 passed** (21 new plus 114 existing). Plain-script and local DB/browser acceptance suites above are additional checks, not inflated unit counts. The final request-isolation tests prove old results disappear immediately while a new authorization-context read remains pending.

Both isolated builds loaded only generated `.env.production` with loopback placeholders; compilation, TypeScript, static generation, expected route manifests and synthetic private-sentinel absence checks passed. Only the existing public Google Fonts hosts were observed through the build's allowlisted proxy; that proxy is not an OS network sandbox. No Supabase production, Vercel, AI or communications provider was contacted. This is compilation/security-isolation evidence, not hosted deployment or model validation.

The owned local test server was stopped and the exact generated disposable worktree was removed after temp-path validation, including its ignored local env files and synthetic issuer key. Both build snapshots were also cleaned. Privacy-safe synthetic screenshots remain only in the OS temporary directory. The original `.env.local` was never opened, copied, loaded or modified. No new dependencies, migration, schema/RLS changes, production data/configuration changes, push, merge to main or deployment occurred. Pre-existing untracked `AGENTS.md`, `CLAUDE.md`, `local-dev.err`, `local-dev.out` and `review/` were preserved.

### Files changed

- `src/lib/attendance-insights.ts`: deterministic records-only rules and school-date range.
- `src/lib/attendance-insights-data.ts`: bounded authenticated/RLS-scoped read loader.
- `src/lib/attendance-insights.test.ts`: pure rule, quality and date tests.
- `src/components/attendance-insights.tsx`: staff-only read-only panel and request isolation.
- `src/components/attendance-insights.test.tsx`: authorization-context stale-result tests.
- `scripts/verify-attendance-insights.integration.test.ts`: guarded synthetic DB/browser acceptance and cleanup.
- `src/components/schovera-app.tsx`, `src/app/globals.css`, `src/lib/i18n.ts`: scoped integration, styles and English/Hindi/Marathi copy.
- `package.json`: two test commands; dependency/lockfile contents unchanged.
- `docs/39_TASK_32N_ATTENDANCE_EARLY_WARNING_INSIGHTS.md`: evidence, demonstration and limits.

## Pilot gates and interpretation risks

Thresholds are transparent **demonstration defaults**, not clinically/statistically validated or approved school policy. Before a pilot, staff must agree the observation window and minimum evidence, establish calendar/enrollment and correction quality, review false positives/negatives with privacy-safe synthetic/consented evidence, and test accessibility with actual staff. Measure recording completeness, reviewed advisory counts, disputed/corrected records and helpfulness of voluntary supportive follow-up, never a claimed dropout probability. Require human decision ownership, access/retention review, consent/communication procedures and an appropriate stop/rollback process. No real-student pilot, external service, deployment or Task 32O is authorized here.

Task 32N: **complete within the local synthetic support boundary**. Task 32O: **READY for review and a separately scoped local follow-up**, not started. Real-student pilot/production acceptance remains blocked on the policy, data-quality, privacy and measurement gates above.
