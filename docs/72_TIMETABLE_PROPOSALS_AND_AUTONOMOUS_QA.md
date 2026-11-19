# Timetable proposals and autonomous verification

19 November 2026. Baseline `b550331d1dff654d56575dc61ef1a3fcddb0a55e` (`origin/main`), including the verified role-audit implementation `be2bdf5`. This task explicitly approves the narrow proposal workflow deferred by report 71. Previous reports/evidence remain historical and unchanged. Results are recorded after execution; this plan is not a passing test record or production/competition certificate.

## Inspection, scope and preservation

AGENTS, README/START_HERE, M7B/C/D and report 71, actual role components, timetable save/delete/version/weekday locking and room-scope trigger, RLS/session helpers and existing test/fixture contracts were inspected. Approved QA remains `%TEMP%\schovera-m7a-qa-b5bad848`, Auth/API loopback 54321 and PostgreSQL loopback 54322, initially 50 migrations. Auth returned 200. Port 3106 belongs to the identity-checked server left by the previous task; it is reused and restored after exclusive-mode checks. An initial startup guard refused to assume that listener was owned; its prior PID/creation time/launcher chain were then verified.

Development is isolated in `%TEMP%\schovera-timetable-proposals-20261119`, branch `feat/timetable-proposals-20261119`. Original `.env.local` is not read, copied, renamed, deleted, hashed or modified. Existing protected school/account records, unrelated doc 45, CLAUDE.md, review/, older worktrees/rehearsals and installed dependencies are preserved. Fresh before/after checks cover 20 protected datasets. Test writes use owned disposable schools and scoped cleanup only.

## Additive design and impact review before migration

- Published `timetable_entries` and the current Principal direct-administrator RPC/UI remain intact. No base rows are rewritten, seeded or reset.
- A proposal is an online-only immutable intention: original Teacher, school/class snapshots, optional existing period/version, self as the proposed Teacher, subject/day/period/time/room and short reason. Ordinary Teachers may propose only their own periods in assigned active classes; no coordinator role or other-Teacher publishing permission is added.
- Separate proposal and event-history tables retain submitted/approved/rejected/withdrawn decisions. Logical actor/class IDs and name/class snapshots survive profile/class deletion; an explicit school deletion cascades its history, permitting existing owned-fixture cleanup without weakening normal browser permissions.
- New RPCs enforce fresh valid sessions, active same-school role and assignment, immutable request retry, author-only withdrawal and Principal-only decisions. Parents have no proposal access. Browser direct mutation grants are revoked; read RLS is Teacher-own/Principal-school only.
- Approval locks the proposal, then the same sorted weekday locks used by the existing publisher, then the target row. It checks the exact captured version even when proposed fields happen to match the current row, rechecks the Teacher's current authority and invokes the existing conflict-validating publisher as the real Principal. Publication, decision, receipt fields and history commit atomically. A failed conflict/stale check leaves the proposal pending/unpublished.
- Repeat matching decisions return the saved result without republishing or changing the original decision actor. A different action/reason cannot rewrite a terminal decision. Rejection/withdrawal do not touch published schedules. Source-period deletion or intervening edits make pending approval stale.
- History has bounded keyset pages. Immutable proposal fields plus append-only-by-RPC events retain the original intention, decision actor/time/reason and exact published snapshot. Trusted SQL/service operators remain privileged; this is not filesystem/DB-administrator tamper protection.

This is additive and backward compatible, not a new scheduler, automatic/AI generation, general offline outbox, hardware protocol, paid provider or production migration. Proposals require the local database connection; existing attendance/RFID offline envelopes/queues are not repurposed. Rehearsal, fluent audio/wording, physical wiring/card checks and hosting decisions remain separate.

## Hardware boundary

Read-only Windows inventory currently lists no USB serial UNO. RC522 wiring/soldering safety is unverified in this task and the owner is unavailable, so no port is opened, ARM/CLEAR sent, firmware uploaded or physical scan claimed. Existing software/mock-Serial tests can run. Owner physical checklist: verify UNO identity and RC522 wiring/power/header readiness separately; close Serial Monitor/Plotter; explicitly approve an exact current port/descriptor for bounded synthetic USB acceptance first; preserve any pending firmware/host receipt; only then undertake separately authorized real-card acceptance. Raspberry Pi architecture is untouched.

## Implemented behavior and files

Before: Principals published directly; Teachers could only read the schedule and were told to contact the administrator. After: the published timetable remains the first Teacher view; the Teacher can submit a proposed new self period or replacement of an existing self period in the selected assigned class. Submission does not change publication. Own history includes earlier classes, even after assignment removal, so pending intentions remain withdrawable. New proposals still require a current active assignment. Principal review is filtered to the selected class and does not remove direct administration. Parents retain their existing linked-child published view and have no proposal/history permissions.

Only five proposals load initially; explicit older-page loading uses a timestamp/UUID keyset. Refresh/reconnect reconciles persisted status. Class changes discard the previous class form; stale asynchronous loads cannot cross contexts. Failed loads show unavailable status rather than an authoritative empty list. Matching submission retries preserve their request identity, including after a decision; the UI then reports that the proposal was already decided rather than falsely claiming the published schedule is unchanged. Mutating responses are schema/scope validated before displaying confirmation. Proposals are online-only and do not change existing offline envelopes or queues.

| File | Change |
|---|---|
| `supabase/migrations/20261119120000_timetable_proposals.sql` | Two additive RLS tables, immutable request identity, fresh-session scope/read helpers, submit/withdraw/decide/keyset RPCs; existing publisher remains unchanged |
| `src/components/timetable-proposals.tsx` | Teacher proposal/own history, Principal review/decision/history, retry/error handling, explicit accessible select names and five-card initial page |
| `src/lib/timetable-proposals.ts` | Runtime response validation, scope/identity/decision/publication consistency |
| `src/lib/timetable-proposals.test.ts` | Six focused contract/localization tests |
| `src/components/schovera-app.tsx` | Narrow Teacher/Principal timetable integration; Parent untouched |
| `src/app/globals.css` | Scoped proposal card, form, wrapping and 44px button styles using existing palette |
| `src/lib/ui-copy-extra.mjs` | New interface copy in English/Hindi/Marathi; authored subjects/reasons remain original |
| `scripts/verify-timetable-proposals.mjs` | Owned real RPC/browser/database acceptance and independently verified cleanup |
| `scripts/verify-role-dashboards.mjs` | Replace obsolete contact-administrator expectation with the approved proposal-only responsibility; direct publication denial remains asserted |
| This report | Design/impact review, executed evidence, limitations and publication handoff |

No dependency, package script, prior migration, attendance/communication contract, firmware, gateway or historical report was changed. There is no AI timetable generation or new role. The migration applied only in approved local QA, increasing its recorded migrations from 50 to 51. Schema lint passed. No published base row was backfilled/replaced; changed timetable rows belong only to journaled test fixtures.

## Acceptance evidence

`scripts/verify-timetable-proposals.mjs` uses actual authorized RPCs, independent service-side SQL/PostgREST reads and real Chrome pages. Screenshots are supplementary, not authorization proof. Its latest passing execution is identified in the ledger below.

| Requirement | Executed evidence |
|---|---|
| Teacher role/class/self scope | Parent, Principal, anonymous and unassigned submission denied; wrong class/other Teacher source period refused; another assigned Teacher's real proposal/events cannot be read or withdrawn |
| No direct Teacher/Parent publication | Existing writer denial and revoked proposal-table mutation grants; submitted intentions leave the published baseline byte-for-byte unchanged |
| School isolation | Separate owned foreign Principal/school: list/direct row/guessed decision refused; same-school Principal sees authorized proposals |
| Current authorization | Assignment removal and inactive proposer block approval; logged-out bearer replay at direct RPC boundary rejected; failure leaves pending state |
| Retry and concurrency | Same submit key returns the same intention; changed payload conflicts; two simultaneous approvals publish once with one decision event and one publication audit under the actual Principal; matching retry preserves receipt/actor; changed action/reason cannot rewrite it |
| Current source version | Stale submission/approval rejected, including when desired fields already match the newer published fields; deleted source refused; fresh replacement succeeds |
| Conflicts | Class overlap, occupied period, Teacher overlap and room overlap (case/space normalized) refused; two competing proposals result in exactly one publication |
| Decision history | Rejected/withdrawn intentions remain unpublished; exact reason/actor/time/receipt retained; direct history mutation refused; same withdrawal/rejection retry succeeds without duplicate history |
| Parent visibility | No proposal/events visible through RLS; only the approved entry becomes readable/rendered; rejected browser proposal absent from published rows |
| Existing administration/data | Direct Principal edit/delete still work; untouched original fixture periods remain exact; prior historical/protected records separately hashed |
| Bounded history | Complete seven-row keyset traversal agrees with the own-Teacher database oracle, with no duplicates; UI begins with five cards and loads older rows explicitly |
| Browser | Actual Teacher submit → Principal approve/reject → Parent read; already-decided retry, wrong-time validation, keyboard Enter submission, query failure/recovery, empty class history, class-form reset and own withdrawal after revocation |
| Languages/layout | 27 new role/width/language combinations: three roles × 1440/390/320px × en/hi/mr; no page overflow/runtime errors. Existing staff 96-combination and all-23-route/four-width suites rerun |

Fresh proposal captures/results are private at QA `.local/timetable-proposals-<UUID>/`; failed attempts retain separate directories/results. The final proposal run also retains invalid-time, unavailable-query and empty-history captures. Representative Teacher/Principal mobile and Hindi views were inspected; no claim is made of a pixel review of every capture. Full-page screenshots can place the fixed mobile header at the capture's current scroll position; DOM overflow and actual control interaction were checked separately.

## Broader results and failed attempts

Existing attendance integrity/review, homework, notices, profiles, communication corrections/idempotency, exact Principal counts through 2,005/2,007-row cases, roles/tenant denial, three-portal connected journeys, reconnect/second-tab reconciliation and account management were executed. The separate guarded account server passed all 18 scenario groups, including actual mobile creation. It was stopped by verified PID/creation time/launcher identity; the normal RFID QA server was restored. Exclusive school-operation acceptance used its own port 3105 while 3106 was stopped, then verified actual SQLite capture/process restart/authorized replay/lost-response deduplication and cleanup. No unfamiliar process was terminated.

RFID v2 and durable gateway integration each passed their Vitest scenario. Simulated Serial → trusted ingress → existing SQLite → signed immutable v2 delivery passed, including duplicate/restart/lost-response/revocation/role boundaries, independent classroom finalization and no automatic attendance. Reader readiness and held-resolution acceptance passed. The native C++ serializer/state test compiled and executed through `g++`, and its actual JSON passed the host validator. These are software/simulated-Serial results; **no real serial test, physical card scan or Raspberry Pi deployment occurred in this task**. No firmware source changed or board upload was performed.

English/Hindi/Marathi/Korean native start/end/locale checks passed ten samples. Local automatic Hindi/Marathi/Korean translation preserved tested date/time/original identity. All four languages produced nonzero PCM WAVs, and translated browser media advanced with Pause/Resume/Stop. The separate Parent/Teacher speech-control suite passed its unchanged rerun, including keyboard, fixed geometry, three interface languages and navigation-stop. These checks do not certify actual speaker audibility, naturalness, pronunciation or fluent semantic approval. Korean remains a message/audio feature, not a fourth interface language.

Live local `gemma3:1b` drafting passed, including syllabus/exam/worksheet/lesson-plan forms, editable output and mobile workbook edit/export. Clipboard success/unavailable paths use a browser stub, not proof of the OS clipboard. No cloud model/provider or paid service was selected. The Ollama service started for this task was identity-checked and stopped afterward, restoring its initial stopped state; installed models/configuration were preserved.

Original failed executions remain failures:

1. The first new proposal test used default global logout for its revoked-session probe, unintentionally invalidating its other synthetic Teacher session. The new harness now logs out only that probe's session; the same direct revoked-token denial remains asserted. Scoped fixture cleanup passed.
2. The second new browser attempt could not resolve the new Day selector by its exact label. New selects now have explicit translated accessible names; the actual product accessibility issue was corrected and the complete acceptance passed. No locator assertion was relaxed.
3. `verify:corrections`, `verify:idempotency` and `verify:phase1` initially timed out waiting for raw Realtime events. Realtime/container/replication-slot health was inspected; no service/configuration or old assertions/timeouts were changed. All three exact commands passed later. The timing cause remains unconfirmed; passing persistence/reconnect is not substituted for the failed initial notifications.
4. The first `verify:simple-voice` timed out waiting for Pause. Native callbacks and generated WAV/translated media independently passed; its exact unchanged rerun passed. The initial cause is unconfirmed; actual acoustic acceptance is still manual.
5. The first live Teacher AI check returned HTTP 503. Ollama logs show a model memory-allocation assertion while the translation model was resident and Windows reported low free RAM. Unloading only this task's local translation model freed resources; the unchanged live check then passed all forms. This is a real resource limitation, not a claimed product-code fix or throughput guarantee. No model was downloaded and no timeout was increased.
6. One ESLint execution exited 2 on a Windows `UNKNOWN` file-read error in unchanged `verify-simple-blue-ui.mjs`; an unchanged rerun passed. Low memory was observed, but that I/O failure's root cause is unconfirmed. The first otherwise-passing lint also reported a new effect-cleanup ref warning; the callback was corrected and final lint is clean.

Preparation observations are separate from acceptance counts: an initial guard refused to assume ownership of the prior QA listener until its identity was verified; exploratory PowerShell literal-glob searches failed without changing files. No test assertion, security rule or protected dataset was weakened to obtain a pass.

Vector logging remains restarting/unhealthy as found; the edge-runtime service is not running. Core API/Auth/database and executed workflows worked. This task does not certify healthy operational logging, repairs to those auxiliary services, sustained concurrent AI throughput, full assistive-technology usability or public-release readiness.

## Evidence, reproducibility and remaining owner actions

Private Git-ignored evidence: `.local/schovera-manual-demo/proposals-20261119/` in the original repository. `results.json` retains exact commands, checkouts, UTC start/end times, exit codes and logs; `integrity.json` compares executable/configuration contents against QA with explicit CRLF normalization and verifies original milestone/firmware/gateway/dependency preservation. `stage-review.json` checks the exact staged scope/added content for credential patterns and known approved QA values. No original developer secret is read or compared.

Reproduce only in approved QA with its existing local files and running Docker/local Supabase. Start `npm run dev:rfid-local -- --port 3106`, wait for HTTP 200, set `SCHOVERA_TEST_URL=http://127.0.0.1:3106`, then run the proposal command in the ledger. Other ordinary browser/RPC commands use this server. Stop only the owned server before `verify:school-operations` so that it can own its port/Next lock. Account acceptance instead requires the unchanged guarded account launcher. Live AI additionally requires separately started loopback Ollama and `VERIFY_TEACHER_AI_LIVE=1`; keep memory headroom when switching models. Do not run unfiltered `verify:website`/seed/reset or copy the developer environment into QA.

On this isolated development worktree, only the safe `npm run build:isolated -- --working-tree` wrapper is used. Normal/hosted installations are not automatically migrated or restarted. This is an additive local QA implementation and review/publishing checkpoint, not a deployment or production certificate.

Owner-only actions remain physical wiring/descriptor/USB/card acceptance under the checklist above; actual presentation speaker/projector listening and fluent language/teacher-content review; and separate approval of real-school retention/operating procedures or hosted resources. Timetable proposal retention, privileged operator tamper protection, distributed quotas, public hosting and real-school rollout require their own acceptance. No additional owner interaction is required for the verified fictional local proposal workflow.

## Execution ledger and final checks

The following ledger is generated after final checks. All times are UTC on 19 November 2026 (IST = UTC +05:30). Repeated runs are retained, not extra independent feature coverage. Startup/identity checks and the local model unload described above are preparation/operating commands, not hidden passing application tests.

**Recorded acceptance executions: 70; PASS 62; FAIL 8.** All failed attempts above remain in this ledger.

| # | Command | UTC start | Exit | Result | Private log |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/proposals/preserve.mjs` | 06:50:18.068 | 0 | PASS | `01-proposals-preserve-1795071019080.log` |
| 2 | `npx --no-install supabase migration up --local` | 06:59:08.577 | 0 | PASS | `02-migrate-local-1795071552023.log` |
| 3 | `npx --no-install supabase db lint --local` | 06:59:12.081 | 0 | PASS | `03-schema-lint-1795071554791.log` |
| 4 | `npm run typecheck` | 06:59:44.652 | 0 | PASS | `04-typecheck-1795071593068.log` |
| 5 | `npm run lint` | 06:59:53.141 | 0 | PASS | `05-lint-1795071612037.log` |
| 6 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:02:36.330 | 1 | FAIL | `06-proposals-verify-1795071761368.log` |
| 7 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:03:01.163 | 1 | FAIL | `07-proposals-verify-1795071818786.log` |
| 8 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:04:08.542 | 0 | PASS | `08-proposals-verify-1795071874216.log` |
| 9 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 07:03:43.695 | 0 | PASS | `09-units-1795071879555.log` |
| 10 | `npm run typecheck` | 07:05:05.213 | 0 | PASS | `10-typecheck-1795071910012.log` |
| 11 | `npm run lint` | 07:05:10.145 | 0 | PASS | `11-lint-1795071926368.log` |
| 12 | `npm run verify:timetable` | 07:05:26.506 | 0 | PASS | `12-verify-timetable-1795071938379.log` |
| 13 | `npm run verify:reliability` | 07:05:38.496 | 0 | PASS | `13-verify-reliability-1795071949790.log` |
| 14 | `npm run verify:attendance-integrity` | 07:05:49.831 | 0 | PASS | `14-verify-attendance-integrity-1795071961426.log` |
| 15 | `npm run verify:attendance-review` | 07:06:01.476 | 0 | PASS | `15-verify-attendance-review-1795071982090.log` |
| 16 | `npm run verify:attendance` | 07:06:22.186 | 0 | PASS | `16-verify-attendance-1795071985483.log` |
| 17 | `npm run verify:assignments` | 07:06:25.524 | 0 | PASS | `17-verify-assignments-1795071986527.log` |
| 18 | `npm run verify:announcements` | 07:06:26.579 | 0 | PASS | `18-verify-announcements-1795071987561.log` |
| 19 | `npm run verify:corrections` | 07:06:27.606 | 1 | FAIL | `19-verify-corrections-1795072003871.log` |
| 20 | `npm run verify:student-profile` | 07:06:44.016 | 0 | PASS | `20-verify-student-profile-1795072005046.log` |
| 21 | `npm run verify:idempotency` | 07:06:45.084 | 1 | FAIL | `21-verify-idempotency-1795072018007.log` |
| 22 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 07:06:57.279 | 0 | PASS | `22-audit-dependencies-1795072020552.log` |
| 23 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 07:07:00.609 | 0 | PASS | `23-audit-production-1795072022704.log` |
| 24 | `npm run verify:arduino-protocol` | 07:07:02.759 | 0 | PASS | `24-verify-arduino-protocol-1795072028792.log` |
| 25 | `npm run verify:principal-communication` | 07:06:58.162 | 0 | PASS | `25-verify-principal-communication-1795072052658.log` |
| 26 | `npm run verify:phase1` | 07:07:32.710 | 1 | FAIL | `26-verify-phase1-1795072068878.log` |
| 27 | `npm run verify:final-journeys` | 07:07:48.917 | 0 | PASS | `27-verify-final-journeys-1795072107116.log` |
| 28 | `npm run verify:reconnect` | 07:08:27.176 | 0 | PASS | `28-verify-reconnect-1795072131525.log` |
| 29 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs` | 07:08:51.569 | 0 | PASS | `29-role-verify-1795072150112.log` |
| 30 | `npm run verify:role-navigation` | 07:09:10.168 | 0 | PASS | `30-verify-role-navigation-1795072169414.log` |
| 31 | `npm run verify:staff-localization` | 07:09:29.463 | 0 | PASS | `31-verify-staff-localization-1795072188760.log` |
| 32 | `npm run verify:role-visuals` | 07:09:48.807 | 0 | PASS | `32-verify-role-visuals-1795072211040.log` |
| 33 | `npm run verify:accessibility-i18n` | 07:10:11.236 | 0 | PASS | `33-verify-accessibility-i18n-1795072221179.log` |
| 34 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:11:07.599 | 0 | PASS | `34-proposals-verify-1795072291517.log` |
| 35 | `npm run verify:corrections` | 07:11:31.871 | 0 | PASS | `35-verify-corrections-1795072305225.log` |
| 36 | `npm run verify:idempotency` | 07:11:45.268 | 0 | PASS | `36-verify-idempotency-1795072317589.log` |
| 37 | `npm run verify:phase1` | 07:11:57.627 | 0 | PASS | `37-verify-phase1-1795072330800.log` |
| 38 | `npm run test:rfid:integration` | 07:12:10.943 | 0 | PASS | `38-test-rfid-integration-1795072335341.log` |
| 39 | `npm run test:gateway:local-integration` | 07:12:15.383 | 0 | PASS | `39-test-gateway-local-integration-1795072356785.log` |
| 40 | `npm run verify:arduino-gateway` | 07:12:36.831 | 0 | PASS | `40-verify-arduino-gateway-1795072373351.log` |
| 41 | `npm run verify:reader-readiness` | 07:12:53.399 | 0 | PASS | `41-verify-reader-readiness-1795072390642.log` |
| 42 | `npm run verify:held-resolutions` | 07:13:10.693 | 0 | PASS | `42-verify-held-resolutions-1795072400486.log` |
| 43 | `npm run test:translations:db` | 07:13:20.526 | 0 | PASS | `43-test-translations-db-1795072402885.log` |
| 44 | `npm run verify:simple-voice` | 07:13:22.979 | 1 | FAIL | `44-verify-simple-voice-1795072439480.log` |
| 45 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 07:13:59.975 | 0 | PASS | `45-voice-all-1795072495123.log` |
| 46 | `npm run verify:communication-local` | 07:14:55.494 | 0 | PASS | `46-verify-communication-local-1795072539057.log` |
| 47 | `npm run verify:teacher-ai` | 07:15:39.836 | 1 | FAIL | `47-verify-teacher-ai-1795072546868.log` |
| 48 | `node --env-file=.env.test.local .local/proposals/preserve.mjs` | 07:15:47.331 | 0 | PASS | `48-proposals-preserve-1795072548006.log` |
| 49 | `npm run typecheck` | 07:15:56.935 | 0 | PASS | `49-typecheck-1795072565160.log` |
| 50 | `npm run lint` | 07:16:05.235 | 2 | FAIL | `50-lint-1795072585805.log` |
| 51 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:17:14.105 | 0 | PASS | `51-proposals-verify-1795072661593.log` |
| 52 | `npm run verify:simple-voice` | 07:17:41.690 | 0 | PASS | `52-verify-simple-voice-1795072682281.log` |
| 53 | `npm run lint` | 07:18:02.740 | 0 | PASS | `53-lint-1795072702494.log` |
| 54 | `npm run verify:second-tab` | 07:18:23.054 | 0 | PASS | `54-verify-second-tab-1795072714987.log` |
| 55 | `npm run verify:teacher-ai` | 07:18:35.490 | 0 | PASS | `55-verify-teacher-ai-1795072823276.log` |
| 56 | `npm run verify:accounts` | 07:21:13.502 | 0 | PASS | `56-verify-accounts-1795072884089.log` |
| 57 | `npm run verify:school-operations` | 07:22:14.921 | 0 | PASS | `57-verify-school-operations-1795072981293.log` |
| 58 | `node --env-file=.env.test.local scripts/verify-timetable-proposals.mjs` | 07:23:08.507 | 0 | PASS | `58-proposals-verify-1795073012030.log` |
| 59 | `npm run verify:staff-localization` | 07:23:32.493 | 0 | PASS | `59-verify-staff-localization-1795073032644.log` |
| 60 | `npm run verify:role-visuals` | 07:23:52.685 | 0 | PASS | `60-verify-role-visuals-1795073054938.log` |
| 61 | `npm run verify:accessibility-i18n` | 07:24:15.120 | 0 | PASS | `61-verify-accessibility-i18n-1795073066043.log` |
| 62 | `npm run typecheck` | 07:24:26.128 | 0 | PASS | `62-typecheck-1795073074316.log` |
| 63 | `npm run lint` | 07:24:35.072 | 0 | PASS | `63-lint-1795073104866.log` |
| 64 | `node --env-file=.env.test.local .local/proposals/preserve.mjs` | 07:25:05.411 | 0 | PASS | `64-proposals-preserve-1795073106478.log` |
| 65 | `node <private evidence>/integrity.mjs` | 07:25:06.550 | 0 | PASS | `65-proposals-integrity-1795073108279.log` |
| 66 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 07:26:10.620 | 0 | PASS | `66-units-1795073225052.log` |
| 67 | `npm run build:isolated -- --working-tree` | 07:27:05.728 | 0 | PASS | `67-build-isolated-1795073313695.log` |
| 68 | `npx --no-install supabase db lint --local` | 07:28:33.812 | 0 | PASS | `68-schema-lint-1795073318716.log` |
| 69 | `node --env-file=.env.test.local .local/proposals/preserve.mjs` | 07:28:38.862 | 0 | PASS | `69-proposals-preserve-1795073319993.log` |
| 70 | `node <private evidence>/integrity.mjs` | 07:28:40.104 | 0 | PASS | `70-proposals-integrity-1795073321437.log` |

Final unique Vitest coverage: **431 passing non-integration tests in 52 files**, including the six new response/localization tests, plus **two passing integration scenario tests** (RFID v2 and gateway). Repeated unit runs are not counted again. Account acceptance is a separate 18-group script; proposal acceptance has eight grouped checkpoints and many assertions, not eight extra Vitest tests.

Both full and production dependency audits returned exit 0 with zero reported entries on 19 November 2026. Dependencies/lockfile are unchanged: Next/eslint-config-next 16.4.5, Zod 4.6.6, sharp 0.35.5. A green registry audit is not a public runtime/security certificate.

The frozen-source isolated build passed optimized compilation, TypeScript and every expected route; only generated `.env.production` was discoverable, private sentinels were absent, source inputs remained unchanged during verification and the exact owned snapshot was cleaned. Egress observed through the limited proxy was only `fonts.googleapis.com` and `fonts.gstatic.com`; this is not an OS network sandbox.

Verified uncommitted source fingerprint: `3e2a76c6e778029aaf365ced3a7958591cfaf5afc73da1d76be3bde485cc4bf5` (247 approved build files). Later report-only additions do not change application implementation. The separately measured 306-file QA comparison includes tests/scripts/migrations outside that build-input allowlist.

Final integrity: **306 executable/configuration contents match QA** (89 differences normalize CRLF only), **51 local migrations**, **all 20 protected dataset hashes unchanged**, and the owned manual fixture pointer absent. Owned proposal schools/history/events, account fixtures and operation queues were scoped-cleaned and verified by their suites. The QA website was restored on loopback port 3106; Ollama was returned to its initial stopped state, Docker left running, private evidence/QA/key infrastructure retained. No blanket cleanup occurred.

An initial report-generation helper stopped before modifying the report because Python's Windows console could not encode a build-log symbol. It was rerun with ASCII-safe metadata output; application source/tests/data were unaffected. This preparation error is separate from the 70 acceptance executions.

## Git review and publication workflow

The isolated branch is `feat/timetable-proposals-20261119`, based on `b550331d1dff654d56575dc61ef1a3fcddb0a55e`. `AGENTS.md` records the explicit standing owner instruction to test, make focused commits and push completed work to main; this covers the current brief's authorization exception. The original main checkout still contains only its pre-existing unrelated doc 45 edit, CLAUDE.md and review/ work. Only the ten scoped files listed above are admitted to staging; no private environment, credentials, student export, database, generated screenshot/log or unrelated artifact belongs in the commit.

## Verified publication receipt

The ten scoped files were committed as **[`4f79c7105bded14d47f721673653e9923693c078`](https://github.com/OmiVibes/Schovera/commit/4f79c7105bded14d47f721673653e9923693c078)**, `feat(timetable): add authorized proposals and Principal approval`. Staged review checked the exact allowlist, whitespace, credential patterns and known QA values; no private artifacts were admitted. The 70-execution ledger above records the pre-publication verification, including all eight failed attempts and successful reruns.

`git fetch origin main` confirmed the unchanged baseline; `git merge --ff-only feat/timetable-proposals-20261119` safely integrated the checkpoint into the original main checkout. The unrelated doc 45 SHA-256 was identical before/after integration. Normal `git push origin main` succeeded, `git ls-remote origin refs/heads/main` returned the exact implementation SHA, and the GitHub connector independently returned the same SHA and canonical commit URL.

Remaining original-checkout work was exactly:

```text
 M docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md
?? CLAUDE.md
?? review/
```

This publication receipt is a documentation-only follow-up; no executable source changed after the successful build/QA comparison. Its final main SHA is verified and supplied in the response. The isolated worktree and private evidence are retained. No force-push, reset, stash, destructive cleanup, branch-protection bypass, public deployment or production migration occurred. Other installations still require the additive migration in their own separately authorized environment before the proposal workflow is available; absent RPCs display unavailable status while existing published reads/direct administration retain their previous contracts.
