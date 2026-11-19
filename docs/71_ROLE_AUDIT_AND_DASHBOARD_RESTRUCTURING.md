# Role audit and dashboard restructuring

19 November 2026. Baseline `f3df6ba3bec7d8ab0bc63bf7b1cb32b442659d85` (`origin/main`). This records an incremental role audit, not a rewrite or production/competition certificate. Runtime results are appended after execution; source inspection alone is not a PASS.

## Phase 1: inspected inventory

README, START_HERE, AGENTS, M1–M7D contracts/reports, routed workspace, shared components, API authorizers, current migrations and verification scripts were inspected. Historical setup statements in README/START_HERE (including translation availability) are not current runtime evidence. The approved QA is `%TEMP%\schovera-m7a-qa-b5bad848`, Supabase loopback API 54321/database 54322. Docker was initially stopped; starting installed Docker Desktop restored the existing containers without reset/seed. Auth then returned 200. The edge runtime remains stopped; full auxiliary-service health is not claimed.

Changes are isolated in `%TEMP%\schovera-role-audit-20261119`, branch `feat/role-dashboard-audit-20261119`. Unrelated main-checkout doc 45, CLAUDE.md and review/ remain untouched. Original developer `.env.local` is never opened/copied/renamed/modified/deleted/hashed. A fresh 20-dataset protected-school baseline is taken before fixture work. All test writes must use disposable owned schools/accounts and scoped cleanup.

### All routed role destinations and actions

| Role / destination | Actual source behavior and ownership decision | Permission / persistence contract; verification target |
|---|---|---|
| All: sign-in/header/navigation | Password sign-in, en/hi/mr preference, role badge, profile menu, sign-out and protected routes. Keep shared. | Supabase session/profile role; route mismatch denied. Navigation/accessibility tests. |
| Teacher home | Assigned-class picker, roster context and shortcuts. Keep daily classroom focus. | Teacher assignments and school-scoped RLS; role navigation. |
| Teacher students | Select/search assigned student; original academic/general/achievement/behaviour update, Important flag, safe retry, correction/history and acknowledgement state. Keep. | `send_student_update`, correction/idempotency RPCs; no Principal-wide publishing rights. |
| Teacher profile | Selected student's saved attendance, homework, communication and timetable aggregates. Keep shared read component, role-scoped. | Authorized profile queries/RPCs, context generation guards. |
| Teacher attendance | Present/Absent/Late edits, draft/save/finalize, reasoned revision/history, review exceptions and retained offline operations. Keep. | M1 register/replay/session/assignment checks; M2 evidence review never marks presence. |
| Teacher homework | Create/edit own authorized class assignment, subject/instructions/due date; Parent publication occurs on saved assignment. Keep. | Assignment RPC author/class checks, expected versions/idempotency; no Principal author impersonation. |
| Teacher timetable | Assigned class's today/week schedule; currently read-only. Keep, clarify how to request a change manually. | Timetable RLS; ordinary Teacher save/delete RPC denied. No proposal storage exists. |
| Teacher AI | Lesson, syllabus, worksheet/exam drafts, editable results, copy/download; separate local workbook upload/edit/export. Keep. | Teacher-only API; local Ollama default; no automatic academic publication. |
| Teacher notices | Read official notices; original/approved/automatic read-language and speech controls where supported. Keep read-only. | Announcement RLS, reauthorized translation/speech API; no notice composer. |
| Parent home | Linked child selector, important update, acknowledge, saved attendance/homework/notices summaries. Keep simple. | Parent link/RLS and separate acknowledgement action. |
| Parent profile | Linked child's authorized history/aggregates. Keep. | Profile scope and stale-context guards. |
| Parent updates | Read original, select available translation/language, listen/pause/resume/stop, acknowledge Important updates. Keep. | Original immutable identity, reviewed translation safeguards; no Parent write/approval. |
| Parent attendance | Finalized/saved history, date/year windows, graphs/calendar; current classroom confirmation separate from gate evidence. Keep. | Parent draft denial, authorized history; missing scan/date is not an absence. |
| Parent homework | Saved assignments for linked child's current class, due dates and history. Keep read-only. | Class/link RLS; no create/edit rights. |
| Parent timetable | Linked child's published weekly/today periods. Keep read-only. | Class/link RLS; no schedule mutation. |
| Parent notices | Official school messages, translation/speech, separate from teacher child updates. Keep. | Same-school/link visibility; no Principal publishing authority. |
| Principal home | Currently communication totals/coverage, shortcuts, six recent cards and optional gate panel. Simplify into genuine school overview plus communication. | Communication exact aggregate/keyset RPC; reuse existing attendance summary, exact RLS count queries. |
| Principal students | School-wide authorized search, selected profile; no arbitrary student editor. Keep. | School scope, profile RPC; no new edit privileges. |
| Principal users | Guarded local create/account lifecycle, role/class/child associations, duplicate/retry states. Keep administrative. | Loopback/Host/Origin/session/active same-school Principal authorizer; unavailable in simulator-only mode. |
| Principal communication | Exact Important/acknowledged/awaiting totals, filter, Load more, history/correction markers and optional translation review/approval. Keep detailed page. | `principal_communication_page`, approval RPC; original acknowledgement remains separate. |
| Principal attendance | Exact classroom school/class totals, exception drill-down, human review, trends/insights. Keep; home should summarize/link here. | Principal attendance RPC, class keyset pagination, fresh school/session checks. |
| Principal homework | Same-school assignment oversight. Keep read-only; do not duplicate Teacher composer or infer missing required work without a policy. | Assignment RLS; no Teacher author-edit authority. |
| Principal timetable | Manual administrator add/edit/remove; edits immediately visible to authorized readers. Keep working small-school path, label immediate publication explicitly. | Principal-only save/delete RPC, active assigned Teacher/class, weekday lock, class/Teacher overlap, period constraints, expected edit version. Room overlap gap below. |
| Principal notices | Create/publish official notices; list recent originals. Keep here, show read-only preview on home. | Principal publication RPC and RLS. **Editing/withdrawing a published notice is not implemented**; do not invent such buttons. |

Shared profile, timetable, assignment-card, speech, translation and attendance-review components are useful reuse, not redundant permission grants. Detailed attendance/AI/account forms already live on management pages. No useful role destination is removed. Principal home gate activity is optional evidence monitoring, not a requirement to operate a scanner.

### API and database boundary inventory

| API family | Existing authority and role meaning |
|---|---|
| `/api/teacher-ai` | Authenticated Teacher; bounded inputs, local provider/draft review. Parent/Principal denied. |
| `/api/communication/{translate,speech}` | Authorized source lookup and current record access; cache authorization retained; language support does not grant source access. |
| `/api/school/accounts` | Guarded local account server, active same-school Principal; server-only service key. Separate launcher required. |
| `/api/school/operations` | Local feature guards, signed capture lease, fresh same-Teacher replay/session; retained SQLite operations. |
| `/api/device/v1/events` | Legacy local signed device boundary; not delayed named-child v2 evidence. Retain historical limits. |
| `/api/device/v2/{events,capability-keys,capabilities}` | Immutable signed device event/assignment/capability checks and Principal-authorized fictional provisioning; not a browser Teacher attendance writer. |
| `/api/fallback-simulator` | Local simulated-notification boundary only; not real SMS/IVR delivery. |

Inspected database groups: profile/current-role/school/assignment/link RLS helpers; student-update send/correction/idempotency; acknowledgement; assignment create/edit; timetable save/delete; announcement publication; communication translation approval/cache; attendance snapshot/write/history/receipts/exception review; Principal communication/attendance aggregates; credential issue/revoke, device/capability issuance and v2 receipt ingestion. Their existing browser/API/RPC tests provide the denial matrix; this is not a formal proof of every possible query, form state or session interleaving.

## Phase 2: justified changes and impact, before implementation

| Priority / finding | Evidence and plan | Affected objects / risk |
|---|---|---|
| P0: shared-room overlaps accepted | Latest `save_timetable_entry` checks class and Teacher time overlap but not two different classes/Teachers in one room. Reproduce with owned fixture. Add a write-time trigger using the same weekday transaction lock, normalized nonempty room label, same-school/day/time overlap; no old-row rewrite. | One additive migration/trigger, no new role or approval tables. Existing published rows remain intact; unrelated edits of a grandfathered collision should not silently rewrite it. Test insert/move/race/adjacency, role denial. |
| P1: Principal home lacks attendance/enrollment context | Home currently starts with communication health, with attendance on a different route. Add compact current-day existing-RPC summary and exact active student/Teacher count queries, clear unavailable states and links to management. | UI/labels only, no new aggregate SQL or fake live metrics. Count queries must request exact server counts, not count capped returned arrays. |
| P1: notice preview absent on home | Notices only on separate page. Reuse read-only Announcements preview on home, keeping publication on Notices. | Existing source authorization/translation/speech preserved; avoid duplicate composers. |
| P1: timetable responsibility unclear | Teacher schedule has no change-request path; Principal form silently publishes. Explain manual contact/administrator role and immediate publication. | Text only, en/hi/mr. No fake request action or auto-generation claim. |
| P1/P2 deferred: approvals/coordinator delegation | No proposal/draft/published-version or coordinator permission model exists. | **Requires explicit approval** for separate scoped migration/architecture design; keep existing working published schedules until accepted. |
| P2 deferred: expanded notice lifecycle and analytics | Withdraw/edit notices, required homework cadence, richer staff dashboard require new domain decisions. | No invented missing-homework counts, automation, punitive discrepancy inference or decorative metrics. |

No major schema change, destructive migration or timetable approval architecture is part of this bounded plan. Teacher, Parent and Principal authority stays unchanged. Adding an integrity trigger does not grant Teacher write rights. The trigger's function execution must be revoked from browser roles; it runs only as part of an already authorized mutation. Empty room means unknown; a label-based overlap check is not a physical room-availability system.

## Phased timetable workflow requiring future approval

1. Retain the current Principal-as-administrator immediate-publish path and read-only Teacher/Parent schedules, with accurate wording.
2. Separately approve a school-scoped coordinator grant, teacher-owned proposals limited to assigned classes, proposal version/conflict checks, immutable review decisions and published revision semantics. Define whether small-school administrators may self-publish without a second approval.
3. Test draft invisibility, denied unrelated-class edits, concurrent proposal approval, revocation and publication before exposing the new workflow. Do not relabel manual period entry as AI/automatic generation.

M7C firmware/Serial/acquisition, signed v2 envelopes, SQLite queues, recovery and M7D's hook fix are preserved. No hardware port is opened in this task. Implementation and executed results follow below; proposals above are not claims of shipped functionality.

## Implemented changes and definitions

- Principal home now starts with a school overview: exact server-side active student/profile-Teacher counts, current school-day saved classroom statuses, finalized/not-finalized register totals and students with review flags. It links to existing attendance/exception management. There are no inferred locations or automatic Present defaults.
- Enrollment counts use authenticated `HEAD` queries with `count: exact`, school/active filters and existing RLS, rather than counting capped arrays. Active Teachers includes an active unassigned Teacher; it is not a count of current class assignments or a guarantee about Auth ban state. Attendance totals reuse `principal_attendance_review`'s current active-class scope, which can differ from all active school enrollments. Count errors display an unavailable marker and error, not a fabricated zero. Counts refresh on the card's explicit refresh; existing attendance recovery/focus/poll behavior is retained.
- Home has a bounded three-notice preview with original title/body excerpt, published date and links to the full notice page. Detail translation/speech/review tools and the Principal publisher remain on that page. No notice publication, translation approval or acknowledgement occurs automatically. No original notice/history was changed to make the preview look current.
- Teacher timetable states that it is published/read-only and directs change requests to the school's timetable administrator. Principal management explicitly states the administrator role and immediate publication. The ordinary Teacher remains denied at the RPC layer. This is a manual-contact instruction, **not an implemented proposal queue**.
- Existing palette/fonts/navigation and all 23 destinations remain. CSS is limited to the new overview/compact notice preview; no unrelated animation/dependency or site rewrite was added. New interface copy is in English/Hindi/Marathi. Korean remains within existing message translation/speech only.

### Additive migration

`20261119060000_timetable_room_conflicts.sql` adds `private.check_timetable_room_conflict()` and one `BEFORE INSERT OR UPDATE` trigger on `timetable_entries`. It uses the existing weekday advisory-lock namespace and rejects same-school/day overlapping nonempty room labels after case/edge-whitespace normalization. Adjacent periods and different rooms remain valid. Subject-only edits preserve a grandfathered room/time footprint; old rows are never backfilled or rewritten. Existing conflicting rows are not retroactively certified conflict-free; that grandfathered branch was source-reviewed, not separately created by disabling a security trigger in tests.

An additional reviewed migration, `20261119061000_timetable_room_request_scope.sql`, replaces that trigger function to check request authority **before** reading room availability. Existing table DML grants rely on RLS; a BEFORE trigger can run before the eventual INSERT denial. A deliberately unauthorized raw insert against the unpublished first guard was denied, but its error revealed a room collision. The new guard requires an authorized same-school Principal for request roles before any privileged room query, with existing trusted SQL administrators/server service writes preserved. A regression exercises occupied and unused room labels through unassigned-Teacher and Parent direct inserts; neither can publish or distinguish occupancy. No successful unauthorized write occurred in the probe.

Both additive migrations were applied **only** through `npx --no-install supabase migration up --local` in QA: migration count **48 → 50**. The first applied migration is retained rather than silently rewriting its local history. Schema lint found no errors. The function grants no new browser authority; `has_function_privilege` was false for anon, authenticated and service_role. Existing Principal save/delete RPC grants, timetable RLS, assignment checks, expected edit version and class/Teacher/period rules are unchanged. No major proposal architecture, coordinator role, destructive migration or hosted SQL action was introduced.

### Tests added/repaired

`scripts/verify-role-dashboards.mjs` owns a disposable fictional school plus one extra Teacher. It tests room insert/move/concurrency/adjacency, Teacher/Parent mutation denial, published row reads, exact overview counts, network-error recovery, new localized wording, bounded preview/navigation, read-only Teacher/Parent timetable UI and overflow. All generated accounts/schedules/audits are scoped and cleaned; credentials are not printed. The new room assertion failed before the migration and passed afterward.

The first new dashboard check wrongly expected two Teachers: the standard fixture also includes an active unassigned Teacher, giving three with the extra Teacher. The test now derives the expected count from the owned fixture's declared roles and independently checks the authenticated count before comparing UI. The application query was already correct; no count was hardcoded to satisfy the test. Additional private probe `.local/role-audit/raw-write.mjs` failed before the request-scope guard with `bothDenied=true, roomExistenceRevealed=true`; afterward both were denied and room existence was not revealed. The same requirement is retained in the public regression script.

The existing `verify:reliability` first failed because it matched only the older spaced error `invalid attendance date`; M1 returns `invalid_attendance_date`. The matcher now recognizes both formats and additionally compares persisted future-date rows before/after the denied request. The subsequent complete run passed. No attendance implementation or allowed date was changed, no old denial was removed and the original failure remains recorded.

## Current security check

Fresh full and production-only npm audits on 19 November both returned **zero findings, exit 0**, against the unchanged package/lockfile. The [picomatch advisory previously recorded by M7D](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) is now marked withdrawn on 18 November. This is updated advisory metadata, not a dependency patch performed here. M7D's historical non-green result is retained unchanged; a green npm snapshot is not public hosting or penetration-test certification.

## Executed verification and limits

| Area | Actual outcome |
|---|---|
| Unit/component suites | **425 tests in 51 files PASS**, including M7D late-rejoin and existing RFID/gateway/attribution subsets. Repeated runs are not extra independent coverage. |
| New role/room regression | **PASS after fixes**: room insert/move/concurrency/adjacency, ordinary-role RPC and direct-table denial before occupancy lookup, published Teacher/Parent reads, exact school counts, count-error recovery, new en/hi/mr text, preview/detail links and mobile layout. |
| Teacher attendance and review | **PASS**: draft/finalized separation, reasoned corrections/history, concurrent revisions, authorized exceptions, unassigned/cross-school/session denial and Parent final-only visibility. |
| Homework/student records | **PASS**: authorized creation/retry/conflict/visibility, aggregate profile inputs and role/class/school isolation. |
| Communication and notices | **PASS**: correction chains/immutability, acknowledgement identity, Principal-only publication, translation approval/version protection, exact aggregate boundaries through 2,007 and pagination/error recovery. |
| Connected roles/reconnect | **PASS**: Teacher send → Principal review → Parent acknowledgement/playback, multi-child/stale-context isolation, missed events, refresh/logout and homework/timetable/profile recovery. Prior M7D intermittent second-tab/pagination risks are not claimed resolved by these passes. |
| Timetable/reliability | **PASS**: Principal-only administration, conflict/validation, idempotent create/edit/delete, expected edit version, concurrency, authorized Realtime visibility and future-date denial with unchanged persisted rows. |
| Accounts | **PASS: 18 scenario groups** in the separate guarded account-server mode, including mobile creation, scopes, duplicate/retry/lifecycle and logged-out denial. Simulator mode still does not enable account administration. Existing passwords were not rotated. |
| AI studio | **PASS**: actual local `Ollama · gemma3:1b` editable draft and four live forms; workbook edit/export, validation and role denial. Clipboard branches use a stub. Successful requests took approximately 42–94s here; no speed, factual correctness or fluent-voice acceptance is certified. No model downloaded or cloud provider selected. |
| RFID software and durable gateway | **Two integration scenario tests PASS**, immutable v2 attribution/revocation/replay, real local SQLite restart/synchronization and role visibility. No physical USB/RFID/Pi test in this task. |
| School operations | **PASS**: three durable pending intentions through real web-process restart, fresh authorized replay, lost-response/concurrent retry, conflict holds, three-portal mobile state and scoped cleanup. |
| Localization/layout/accessibility | **PASS**: 96 staff language/width combinations; all 23 destinations at 1440/1024/768/390px; existing accessibility/i18n and role-navigation checks. Final Principal home desktop/mobile captures were inspected; not every possible expanded state or assistive technology was manually tested. |
| TypeScript / lint / schema | **PASS**, existing rules retained, 50 local migrations. |
| Final isolated build | **PASS**, Next 16.4.5 and all expected routes, generated `.env.production` only, private sentinel scan, unchanged inputs and exact snapshot cleanup. |
| Preservation | **PASS**, all 20 protected-school dataset hashes unchanged; owned fixtures absent; 301 executable/config contents match QA (87 differ only by Windows CRLF endings). Package/lock, old migrations, firmware, gateway/offline implementation, M7D hook/tests/report and unrelated main work are unchanged. |

Final current-source fingerprint: `1ebe35901289d62eb8e47b703b98feda153bf7ee8ed2db434136fd8f80bd09f1` (**243 build-approved files**). Database migrations are separately verified; a successful Next build does not apply/certify them. Only the two allowlisted Google Fonts hosts were observed through the existing limited proxy, not an OS network sandbox. The earlier passing build preceded the extra scope regression/migration; the final frozen-source rerun covers the completed code.

Private evidence **E**: `.local/schovera-manual-demo/role-audit-20261119/` in the original developer repository. The ledger retains commands, UTC start/end, exit status, checkout and redacted logs. New regression results/captures are under QA `.local/role-audit-*/`; final representative role captures use run `87bc9ba3-9846-4cca-b9a4-a1cca3b03b4b`. Visual-audit captures remain in `%TEMP%\schovera-role-visuals-2026-11-19T05-46-35.634Z`. Private account journals/keys/databases/raw evidence are excluded from Git.

Four nonzero acceptance runs are retained: pre-fix room collision accepted; incorrect new test Teacher-count expectation; stale legacy future-date error matcher; and the unpublished first room guard's unauthorized error side channel. Later passing checks do not erase them. Preliminary inspection/runner issues were separate: guessed paths/globs, an HTTP readiness check that incorrectly inspected PowerShell's native-command exit variable, and a private integrity helper syntax/CRLF/type-extension mismatch. Those probes were corrected without altering product data or weakening permission/date assertions. Text comparison normalizes CRLF only for known source formats; binary comparisons remain exact.

Docker was started from its initial stopped state without resetting containers. All owned web/model processes were identity-checked before stopping. Ollama was temporarily started on loopback for live verification and stopped afterward, restoring its initial stopped state. The normal guarded QA server is left running at **http://127.0.0.1:3106** for review; Docker/local Supabase remain available. The existing older competition rehearsal and all unrelated worktrees/files are preserved.

## Review steps and outstanding work

1. Open `http://127.0.0.1:3106` on this laptop with existing private QA sign-ins. Principal → Overview now shows school-day attendance and actual counts; use **Review attendance and exceptions** and **View school notices** to reach detailed actions. Switch en/hi/mr. No new permanent account/password is published or needed.
2. Teacher → Timetable and Parent → Timetable remain published read-only views. Principal → Timetable is the explicit manual administrator path; saving publishes immediately. Use only an owned disposable school to exercise writes/room conflicts.
3. For repeatable synthetic acceptance, in PowerShell:

   ```powershell
   Set-Location "$env:TEMP\schovera-m7a-qa-b5bad848"
   $env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3106'
   node --env-file=.env.test.local scripts/verify-role-dashboards.mjs
   ```

   The verifier refuses an existing manual fixture; never discard an unfamiliar journal to force it to run. It creates/cleans its own fixture and retains screenshots/results privately.
4. Start only one development server in this checkout. Normal mode is `npm run dev:rfid-local -- --port 3106`. To review account administration, stop only that known owned server and use `npm run dev:accounts-local -- --port 3106`; `verify:accounts` requires that mode. `verify:school-operations` needs exclusive development-lock ownership and owns port 3105, including restart. Never copy the developer `.env.local`, seed/reset the database or use someone else's school as a test fixture.
5. Root/worktree builds use `npm run build:isolated -- --working-tree`. Other checkouts are not automatically migrated/restarted by Git; the two additive migrations need explicit local/hosted-environment review before use there. No hosted migration/deployment was performed.

**Intentionally unimplemented/requiring further approval:** coordinator grants and versioned timetable proposals/review/publish architecture; automatic timetable generation; editing/withdrawing published notices; policy-based missing-homework analytics; hosted account/speech/AI/RFID operation; real notifications/hardware enrollment. No user feature is removed to imply these exist. Human language/audio, screen-reader/usability review and rehearsal remain necessary; generated academic facts/marks need teacher review.

Completed P0/low-risk P1 work is ready for code/local review within the tested fictional scope. This is not a public launch or international competition readiness certificate. Repository AGENTS already authorizes focused tested commits and publication to main; implementation uses the isolated branch, explicit file staging and fast-forward-only integration, preserving unrelated main work and all previous milestones.


## Command ledger

**58 acceptance executions: 54 PASS, 4 FAIL**, including the retained failed-before assertions/harness attempts described above. Times are UTC on 19 November 2026 (IST = UTC +05:30). E/results.json retains end times/checkout/revision. All checks use the approved QA checkout except isolated builds, which run from the isolated development worktree. Independent read-only audits overlapped other checks; owned fixture mutations were sequential. Repeated passes are not independent feature totals.

| # | Command | UTC start | Exit | Result | Evidence log relative to E |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 05:32:15.626 | 0 | PASS | `01-role-preserve-1795066337198.log` |
| 2 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs --rooms-only` | 05:37:10.116 | 1 | FAIL | `02-role-rooms-1795066635307.log` |
| 3 | `npx --no-install supabase migration up --local` | 05:37:47.952 | 0 | PASS | `03-migrate-local-1795066678649.log` |
| 4 | `npx --no-install supabase db lint --local` | 05:37:59.216 | 0 | PASS | `04-schema-lint-1795066683382.log` |
| 5 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs --rooms-only` | 05:38:03.452 | 0 | PASS | `05-role-rooms-1795066688811.log` |
| 6 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs` | 05:38:08.968 | 1 | FAIL | `06-role-verify-1795066716865.log` |
| 7 | `npm run typecheck` | 05:38:36.953 | 0 | PASS | `07-typecheck-1795066729894.log` |
| 8 | `npm run lint` | 05:38:49.953 | 0 | PASS | `08-lint-1795066761297.log` |
| 9 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 05:39:21.350 | 0 | PASS | `09-units-1795066825751.log` |
| 10 | `npm run verify:timetable` | 05:40:26.193 | 0 | PASS | `10-verify-timetable-1795066839268.log` |
| 11 | `npm run verify:reliability` | 05:40:39.342 | 1 | FAIL | `11-verify-reliability-1795066841245.log` |
| 12 | `npm run verify:attendance-integrity` | 05:40:41.403 | 0 | PASS | `12-verify-attendance-integrity-1795066859207.log` |
| 13 | `npm run verify:attendance-review` | 05:40:59.473 | 0 | PASS | `13-verify-attendance-review-1795066885166.log` |
| 14 | `npm run verify:principal-communication` | 05:41:25.490 | 0 | PASS | `14-verify-principal-communication-1795066919825.log` |
| 15 | `npm run verify:final-journeys` | 05:41:59.897 | 0 | PASS | `15-verify-final-journeys-1795066964479.log` |
| 16 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 05:42:45.497 | 0 | PASS | `16-audit-production-1795066968895.log` |
| 17 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 05:42:48.948 | 0 | PASS | `17-audit-dependencies-1795066972860.log` |
| 18 | `npm run verify:reconnect` | 05:42:44.669 | 0 | PASS | `18-verify-reconnect-1795066993879.log` |
| 19 | `npm run verify:staff-localization` | 05:43:13.959 | 0 | PASS | `19-verify-staff-localization-1795067017153.log` |
| 20 | `npm run verify:role-visuals` | 05:43:37.206 | 0 | PASS | `20-verify-role-visuals-1795067039798.log` |
| 21 | `npm run verify:accessibility-i18n` | 05:43:59.948 | 0 | PASS | `21-verify-accessibility-i18n-1795067049119.log` |
| 22 | `npm run test:rfid:integration` | 05:44:09.255 | 0 | PASS | `22-test-rfid-integration-1795067054315.log` |
| 23 | `npm run test:gateway:local-integration` | 05:44:14.363 | 0 | PASS | `23-test-gateway-local-integration-1795067081315.log` |
| 24 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 05:44:41.521 | 0 | PASS | `24-role-preserve-1795067082126.log` |
| 25 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs` | 05:45:22.430 | 0 | PASS | `25-role-verify-1795067147015.log` |
| 26 | `npm run verify:reliability` | 05:45:47.178 | 0 | PASS | `26-verify-reliability-1795067159013.log` |
| 27 | `npm run typecheck` | 05:45:59.092 | 0 | PASS | `27-typecheck-1795067170061.log` |
| 28 | `npm run lint` | 05:46:10.112 | 0 | PASS | `28-lint-1795067194379.log` |
| 29 | `npm run verify:role-visuals` | 05:46:34.460 | 0 | PASS | `29-verify-role-visuals-1795067218451.log` |
| 30 | `npm run verify:staff-localization` | 05:46:58.510 | 0 | PASS | `30-verify-staff-localization-1795067239367.log` |
| 31 | `npm run verify:teacher-ai` | 05:47:19.437 | 0 | PASS | `31-verify-teacher-ai-1795067547729.log` |
| 32 | `npm run verify:announcements` | 05:52:27.853 | 0 | PASS | `32-verify-announcements-1795067549898.log` |
| 33 | `npm run verify:assignments` | 05:52:29.957 | 0 | PASS | `33-verify-assignments-1795067551501.log` |
| 34 | `npm run test:translations:db` | 05:52:31.553 | 0 | PASS | `34-test-translations-db-1795067554735.log` |
| 35 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 05:52:34.797 | 0 | PASS | `35-role-preserve-1795067555314.log` |
| 36 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs` | 05:53:08.357 | 0 | PASS | `36-role-verify-1795067613242.log` |
| 37 | `npm run verify:corrections` | 05:53:33.306 | 0 | PASS | `37-verify-corrections-1795067627428.log` |
| 38 | `npm run verify:student-profile` | 05:53:47.494 | 0 | PASS | `38-verify-student-profile-1795067629198.log` |
| 39 | `npm run lint` | 05:53:49.263 | 0 | PASS | `39-lint-1795067653768.log` |
| 40 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 05:54:13.832 | 0 | PASS | `40-role-preserve-1795067654388.log` |
| 41 | `npm run verify:accounts` | 05:55:40.832 | 0 | PASS | `41-verify-accounts-1795067758508.log` |
| 42 | `npm run verify:school-operations` | 05:57:17.560 | 0 | PASS | `42-verify-school-operations-1795067889459.log` |
| 43 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 05:58:09.561 | 0 | PASS | `43-units-1795067955738.log` |
| 44 | `npm run build:isolated -- --working-tree` | 05:59:15.797 | 0 | PASS | `44-build-isolated-1795068032380.log` |
| 45 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 06:00:32.472 | 0 | PASS | `45-role-preserve-1795068033620.log` |
| 46 | `node --env-file=.env.test.local .local/role-audit/raw-write.mjs` | 06:00:46.829 | 1 | FAIL | `46-role-raw-1795068050989.log` |
| 47 | `npx --no-install supabase migration up --local` | 06:07:42.303 | 0 | PASS | `47-migrate-local-1795068465533.log` |
| 48 | `npx --no-install supabase db lint --local` | 06:07:46.179 | 0 | PASS | `48-schema-lint-1795068468793.log` |
| 49 | `node --env-file=.env.test.local .local/role-audit/raw-write.mjs` | 06:07:48.836 | 0 | PASS | `49-role-raw-1795068471705.log` |
| 50 | `node --env-file=.env.test.local scripts/verify-role-dashboards.mjs` | 06:07:51.750 | 0 | PASS | `50-role-verify-1795068493062.log` |
| 51 | `npm run verify:timetable` | 06:08:13.480 | 0 | PASS | `51-verify-timetable-1795068505149.log` |
| 52 | `npm run verify:reliability` | 06:08:25.187 | 0 | PASS | `52-verify-reliability-1795068516485.log` |
| 53 | `npm run lint` | 06:08:36.532 | 0 | PASS | `53-lint-1795068538395.log` |
| 54 | `npm run typecheck` | 06:08:58.756 | 0 | PASS | `54-typecheck-1795068543010.log` |
| 55 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 06:09:03.056 | 0 | PASS | `55-role-preserve-1795068543781.log` |
| 56 | `npm run build:isolated -- --working-tree` | 06:09:03.826 | 0 | PASS | `56-build-isolated-1795068609159.log` |
| 57 | `npm run verify:role-navigation` | 06:11:12.666 | 0 | PASS | `57-verify-role-navigation-1795068694576.log` |
| 58 | `node --env-file=.env.test.local .local/role-audit/preserve.mjs` | 06:11:34.642 | 0 | PASS | `58-role-preserve-1795068695194.log` |

Additional read-only evidence: Git fetch/status/scope checks; Docker effective loopback bindings and Auth HTTP 200; migration count 50; private trigger function EXECUTE denied to anon/authenticated/service_role; source integrity (301 contents matched, 87 CRLF-only differences); final role/overflow screenshots and staged diff/secret review. No firmware build/upload, COM port access, RC522 scan, Pi, public hosting or production SQL was executed.
