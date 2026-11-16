# M1 — Classroom attendance integrity

16 November 2026. Scope: explicit finalization, correction history, concurrency and compatibility with the existing local offline queue. M2–M5 are not implemented by this milestone. This is synthetic local software evidence, not production, physical RFID or Raspberry Pi certification.

## Baseline and preservation

Repository `OmiVibes/Schovera`, branch `main`, starting revision `0fefe9ce9c1a325d4d4c2969017c248f0188c75b`. `origin/main` matched before editing. The pre-existing modification to `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md` and untracked `CLAUDE.md`/`review/` are excluded from the milestone. No reset, stash, force-push, deployment or public service exposure is part of this work.

Implementation is tested in the existing isolated QA checkout, with its approved local environment files and loopback Supabase. The developer `.env.local` was not opened, copied, hashed or modified. Docker Desktop was started to restore the existing local services; no database reset or blanket seed was run. Existing account passwords are unchanged. Test accounts/records are fictional and scoped to newly owned schools.

Private execution evidence: `.local/schovera-manual-demo/m1-20261116/`. Its ledger records exact commands, working directories, UTC start/end times, exits and redacted logs. Additional scoped captures remain in QA `.local/attendance-integrity-<uuid>/` and `.local/school-operation-qa-<uuid>/`; they are not published source or database proof by themselves.

## Before and after

| Area | Before | M1 behavior |
|---|---|---|
| Unsaved register | Editable Present defaults without a formal register lifecycle | Virtual draft at revision 0; no published rows until explicit finalization |
| Save draft | Unavailable | Full-roster draft in staff-only register storage; no Parent attendance rows |
| Finalize | Three-argument save directly upserted records | Explicit Finalize action, expected revision and request ID; stores confirming Teacher/time |
| Correction | Repeated save could overwrite the register | Requires a reason when finalized statuses change; records each changed student's before/after status, actor, time, register and revision |
| Concurrent edits | Online writes lacked an expected revision | Common class/day lock plus revision check; stale edits fail without mutation |
| Retries | Offline receipts existed | Online and offline writes have atomic, immutable-intent receipts; exact retries do not repeat mutations/history |
| Parent view | Read persisted attendance | Continues reading published classroom rows; drafts never enter that projection; added explanation of final-only records |
| RFID | Separate gate evidence | Remains separate; no scan-to-attendance mutation was introduced |

The Teacher sees the register state/revision, a confirmation timestamp for saved attendance, an unsaved-edits warning, Save draft/Finalize/Save correction controls, a reason field and an explicitly labelled reload action. Pending local capture is not a claim that the Parent received a final record. New interface copy uses the existing English/Hindi/Marathi dictionary; no Korean interface or new dependency was added.

## Database migrations and rollout

Four additive migrations were applied **only in isolated local QA**, in order:

1. `20261116100000_attendance_register_integrity.sql`: creates `attendance_registers`, `attendance_changes` and `attendance_write_receipts`; adds authorized snapshot/write RPCs and a restricted legacy compatibility writer.
2. `20261116101000_attendance_replay_compatibility.sql`: extends the lease baseline with register revision, detects draft/final revision changes and routes versioned replay through the same writer. Existing operation IDs/envelopes/receipts are not rewritten.
3. `20261116102000_attendance_replay_envelope_guards.sql`: locks baseline reads consistently and validates direct replay payloads, including legacy versus version-2 shape.
4. `20261116103000_attendance_history_staff_scope.sql`: restricts correction reasons/history to authorized assigned Teachers and same-school Principals. Parents receive no new permission to staff notes.

There is no attendance backfill, historical-row rewrite, status-enum expansion or replacement of the base database. Existing 38 migrations remain unchanged; QA now records 42. Existing `attendance_records` stays the final published projection. Draft JSON is separate. Original unique student/date constraints remain, and the new register has a unique class/date constraint.

Apply the reviewed schema before rolling out the new application in any separately authorized environment. Do not copy private configuration or blindly migrate another checkout. The new client fails safely if the snapshot contract is absent. Version-2 offline capture requires a signed lease containing the upgraded register revision, preventing a new draft from being interpreted as a legacy final save by an older authority. No hosted migration was performed.

### Historical compatibility

Previously saved attendance remains readable as **legacy Teacher-saved history**, with revision 0 until an explicit write creates its register. Reads do not materialize registers or invent historical correction events. Legacy saved timestamps/markers are not proof that the old record went through the new Finalize button. Existing audit events are retained.

The old `save_class_attendance(class,date,records)` signature remains available for an explicit first save of an unmarked register and exact retries of an unchanged final register. It cannot change finalized attendance or bypass an existing draft; such callers must upgrade to the reason/revision contract. This intentional restriction prevents silent overwrites. Present/Absent/Late remain the only supported statuses. Future Excused support requires a separate enum, validation, aggregation, localization and queue-consumer review; no status is silently remapped.

### Authorization and transactions

The server checks a live session, active Teacher identity, assigned active class, same school, valid school-local date and complete current active roster. Parents, Principals, unassigned/inactive/foreign Teachers and revoked sessions cannot write. Browser roles cannot directly mutate registers, audit rows or receipts or invoke the restricted inner writer.

Register revision, final rows, per-student history, existing `attendance_saved` audit and write receipt commit in one transaction. A request ID reused with different intent is rejected. Concurrent Teachers using one expected revision cannot both win. Reconfirming unchanged final values with a new valid request advances the register revision/confirmation metadata without fabricating a status-change history row; an exact request retry returns its original receipt.

Audit history is append-only to browser roles. Trusted service-role fixture cleanup can remove exact owned synthetic schools and their dependent audit/receipt records. Production retention and privileged-administrator operations are separate acceptance work.

## Offline compatibility

Legacy `{records}` payloads retain their original canonical shape and identity. New payloads add `attendance_version: 2`, action, expected revision and optional correction reason. Important-update payloads and RFID queue contracts are unchanged. Both baseline and expected revision are checked at replay; current same-Teacher authorization is still mandatory.

A safe legacy initial save can replay. A legacy correction lacking a reason/revision is **retained for review**, not applied with an invented reason, silently deleted or labelled synced. A stale modern correction is also held. Explicit Retry cannot force these holds. M1 does not add an operator resolution screen; retained work requires a separately reviewed resolution process. Do not edit a stored canonical envelope to resolve it.

Receipts' existing `confirmed: true` means destination transaction committed; it does not turn a synced draft into finalized classroom attendance. The register state determines publication. Existing 30-minute capture leases, bounded storage, restart recovery, retry policy and local-service requirement remain. This is not a browser/PWA outbox, unattended post-logout sync or independently hosted cloud replica.

## Acceptance evidence

| Requirement | Evidence |
|---|---|
| 1. Gate and classroom evidence remain separate | Existing RFID v2 and gateway integration scenarios passed, including unchanged classroom attendance; no RFID implementation file changed |
| 2. Draft/final state, revision, Teacher/time | New snapshot/write acceptance verifies empty draft 0, persisted draft 1, final 2, confirming actor/time and correction revision |
| 3. Unsaved defaults are not confirmed | Empty snapshot has no rows; Save draft leaves published records empty; mobile UI displays draft/unsaved state |
| 4. Existing statuses/data; future Excused | Present/Absent/Late persist; Excused/invalid rosters are rejected; historical rows remain untouched until an authorized correction |
| 5. Reason and traceable corrections | Empty/whitespace reasons rejected; exact changed-student before/after/actor/time/reason/register/revision checked; staff-only history RLS checked |
| 6. Stale edits rejected | Two concurrent different writes at one revision produce one winner and one conflict; concurrent identical request retries return the same result |
| 7. Server permissions/isolation | Parent/Principal/unassigned/foreign/inactive/revoked-session denial; direct write/inner-RPC denial; assigned Teacher and Principal history reads checked |
| 8. Manual attendance without RFID | New bare synthetic school completes draft/finalize/correction without reader/device enrollment |
| 9. Offline envelopes and replay | Legacy canonical bytes retained; separate-process restart; matching receipts; lost-response retry; modern correction; legacy/stale holds; HTTP/browser restart acceptance |
| 10. Parent final-only records | Parent cannot read draft registers or staff notes; draft creates no Parent attendance row; finalized correction appears through existing authorized projection |
| 11. Focused and existing tests | Unit/schema tests plus new attendance-integrity, attendance, school-operations, reconnect and connected/RFID regression commands; exact ledger below |

The new mobile acceptance drives real Save draft, Finalize, missing-reason rejection and Save correction, then checks PostgreSQL and Parent/Principal views. Captures reset scrolling and place the sticky shell in document flow for full-page evidence; those capture styles do not change product CSS. Pronunciation, physical speaker output, hardware, real notifications and public hosting are not acceptance claims of M1.

## Failed attempts retained

- The first unit run found malformed new dictionary text: a PowerShell/Python pipeline replaced Unicode with question marks. The new rows were replaced with proper UTF-8 through a direct patch; original dictionary assertions were preserved.
- The first combined acceptance passed its SQL/queue sections but timed out at sign-in while the QA dev server repeatedly hot-reloaded after source synchronization. Diagnostic snapshots recorded Loading; they are not successful sign-in checks. Restarting only the owned QA server restored the form, and the complete acceptance passed.
- The first offline regression used hardcoded revision 0 for its prepared fixture. Fixture preparation now explicitly finalizes its registers through the compatibility writer, so its current revision was 1. The unchanged persisted-status assertion failed; a second diagnostic run retained the explicit conflict. The probe now uses the revision from its signed lease, supplies the required correction reason and retains all persistence/restart/idempotency assertions.
- A React lint run rejected reading a ref during render for the new dirty indicator. A state value now drives rendering while the existing ref still guards asynchronous response handling. No lint rule was disabled.
- The first final-integrity probe compared Windows working-tree bytes directly with Git's LF-normalized blobs and falsely flagged the unchanged lockfile. The corrected probe compares exact bytes with its pre-test snapshot and independently rejects protected-file Git diffs; it passed. No lockfile or product file was changed to satisfy it.
- Preliminary missing-path reads, one encoding error while editing a verifier and a rejected patch attempt changed no protected data or test expectations. Original execution failures remain in private evidence.

The attendance verifier was moved from an existing school's roster to a newly owned synthetic school while preserving save/update, mixed-roster, Parent/Principal visibility and authorization assertions. Existing correction browser probes now use the explicitly required reason/action; they do not retain obsolete permission to overwrite finalized attendance without a reason.

## Files belonging to M1

- The four new migrations listed above.
- `src/lib/attendance-register.ts` and `.test.ts`: snapshot contract and clear failure messages.
- `src/components/schovera-app.tsx`: snapshot/revision/request handling and minimal draft/final/correction controls and Parent explanation.
- `src/lib/ui-copy-extra.mjs`: interface translations only.
- `scripts/school-operations/store.mjs` and `.test.ts`: versioned capture validation and retained review holds, legacy canonical preservation.
- `src/app/api/school/operations/route.ts`: map attendance integrity failures to review rather than transient retry.
- `src/lib/use-school-operations.tsx`: refresh the register after confirmed sync.
- `scripts/verify-attendance-integrity.mjs`: owned synthetic SQL/queue/browser acceptance and cleanup.
- `scripts/verify-attendance.mjs`, `scripts/verify-school-operations.mjs`, `scripts/verify-final-journeys.mjs`: isolated fixtures and updated correction-contract acceptance.
- `package.json`: one verification command; dependency specifications and lockfile are unchanged.
- This report.

## Remaining limits

Held-work resolution UI, exception queues, Excused status, general UI redesign, Principal daily-attendance pagination at large scale, dependency remediation and presentation/business materials remain outside M1. No claim that those later milestones are complete is made. Existing development-tool advisories and auxiliary service issues are not repaired here. A passing local build is not public deployment acceptance. Rollout, retention, backup/restore and real-school operation require separate authorization/review.

## Final result and preservation

**M1 is ready for review within the tested synthetic local scope.** Final units passed: **335 tests in 39 files**, including the existing RFID/gateway subsets and six new M1 tests. The two separate RFID/gateway integration scenarios also passed. Required attendance-integrity, attendance, school-operations, reconnect, TypeScript and lint checks pass on the final implementation. Connected journeys, AUD-01 totals through 2,005 rows/2,007 correction rows, 96 staff localization combinations and 23 destinations at four widths also passed during this milestone. These are overlapping executions, not independent totals of feature coverage.

Final isolated Next 16.4.1 build passed compilation, TypeScript, expected routes, generated `.env.production` only, private sentinel checks, unchanged-source verification and exact temporary-snapshot cleanup. Source fingerprint: `5bcf286a82d98b320a5b967b25c099c12e98c72393b9c0b62ff957ff10d01bdb`, **193 approved files**. Only `fonts.googleapis.com` and `fonts.gstatic.com` were observed through the existing limited build proxy; this is not an OS network sandbox or public runtime assessment.

All **20 protected-school dataset hashes remain unchanged**. No protected-school register or change-history row was materialized. **62 protected existing files** match their exact before snapshots, all **228 source/script/migration inputs** match QA, and the pre-existing documentation edit is byte-for-byte preserved. QA Auth health is HTTP 200 and the effective database binding remains loopback. Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5 remain installed in QA; no dependency or lockfile change occurred.

Owned synthetic schools/accounts, operation queue rows and temporary test databases were cleaned and checked by the acceptance suites; captures and redacted evidence remain ignored. Owned QA web processes were stopped after verification, restoring the initially stopped web-server state. Docker was started for the work and left running; Ollama was not started. No hardware, public hosting, SMS/call provider or production configuration was accessed.

Only the M1 files listed above belong in the commit. The unrelated document, `CLAUDE.md`, `review/`, private state, logs, credentials, databases and captures stay out. Commit/push and exact remote SHA verification occur after finalizing this report and are supplied in the handoff; publication is a source checkpoint, not deployment or production certification.

## Exact execution ledger

The table records completed commands, including original failed attempts and reruns. Times are UTC on 16 November 2026; add 05:30 for IST. Diagnostic scripts with exit 0 merely completed inspection; their Loading snapshots are not successful login acceptance. Root isolated build is the exception to QA working directories. The private ledger retains full timestamps and log names.

**Completed executions: 49; exit 0: 43; nonzero: 6.**

| # | Command | UTC start | Exit | Log |
|---:|---|---|---:|---|
| 1 | `node --env-file=.env.test.local .local/m1/preserve.mjs` | 07:48:39.195 | 0 | `01-m1-preserve-1794815320601.log` |
| 2 | `npx --no-install supabase migration up --local` | 07:48:40.704 | 0 | `02-migrate-local-1794815326907.log` |
| 3 | `npx --no-install supabase db lint --local` | 07:48:46.912 | 0 | `03-schema-lint-1794815331521.log` |
| 4 | `npm run typecheck` | 07:48:51.526 | 0 | `04-typecheck-1794815346863.log` |
| 5 | `npm run lint` | 07:49:06.866 | 0 | `05-lint-1794815380066.log` |
| 6 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 07:53:48.593 | 1 | `06-units-1794815703278.log` |
| 7 | `npm run typecheck` | 07:55:03.451 | 0 | `07-typecheck-1794815719704.log` |
| 8 | `npm run lint` | 07:55:19.707 | 0 | `08-lint-1794815754972.log` |
| 9 | `npm run verify:attendance` | 07:55:54.975 | 0 | `09-verify-attendance-1794815764997.log` |
| 10 | `npm run verify:attendance-integrity` | 07:56:35.546 | 1 | `10-verify-attendance-integrity-1794815829773.log` |
| 11 | `node --env-file=.env.test.local .local/m1/signin-debug.mjs` | 07:58:05.031 | 0 | `11-m1-signin-debug-1794815892570.log` |
| 12 | `node --env-file=.env.test.local .local/m1/signin-debug.mjs` | 07:58:35.516 | 0 | `12-m1-signin-debug-1794815922467.log` |
| 13 | `node --env-file=.env.test.local .local/m1/signin-debug.mjs` | 07:59:05.923 | 0 | `13-m1-signin-debug-1794815958923.log` |
| 14 | `node --env-file=.env.test.local .local/m1/signin-debug.mjs` | 08:00:49.224 | 0 | `14-m1-signin-debug-1794816065231.log` |
| 15 | `npx --no-install supabase migration up --local` | 08:01:20.270 | 0 | `15-migrate-local-1794816087079.log` |
| 16 | `npm run verify:attendance-integrity` | 08:01:27.082 | 0 | `16-verify-attendance-integrity-1794816112877.log` |
| 17 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 08:01:52.880 | 0 | `17-units-1794816189632.log` |
| 18 | `npm run verify:school-operations` | 08:04:48.748 | 1 | `18-verify-school-operations-1794816314711.log` |
| 19 | `npm run typecheck` | 08:05:14.829 | 0 | `19-typecheck-1794816329480.log` |
| 20 | `npm run lint` | 08:05:29.483 | 1 | `20-lint-1794816364479.log` |
| 21 | `npm run verify:school-operations` | 08:07:15.882 | 1 | `21-verify-school-operations-1794816460911.log` |
| 22 | `npm run verify:school-operations` | 08:08:23.004 | 0 | `22-verify-school-operations-1794816589407.log` |
| 23 | `npm run typecheck` | 08:09:49.410 | 0 | `23-typecheck-1794816603980.log` |
| 24 | `npm run lint` | 08:10:03.983 | 0 | `24-lint-1794816638499.log` |
| 25 | `npm run verify:attendance-integrity` | 08:11:34.767 | 0 | `25-verify-attendance-integrity-1794816728391.log` |
| 26 | `npm run verify:attendance` | 08:12:08.446 | 0 | `26-verify-attendance-1794816735598.log` |
| 27 | `npm run verify:reconnect` | 08:12:15.600 | 0 | `27-verify-reconnect-1794816775205.log` |
| 28 | `npm run verify:final-journeys` | 08:12:55.209 | 0 | `28-verify-final-journeys-1794816840493.log` |
| 29 | `npm run verify:principal-communication` | 08:14:00.511 | 0 | `29-verify-principal-communication-1794816883130.log` |
| 30 | `npm run test:rfid:integration` | 08:14:43.132 | 0 | `30-test-rfid-integration-1794816888323.log` |
| 31 | `npm run test:gateway:local-integration` | 08:14:48.326 | 0 | `31-test-gateway-local-integration-1794816908831.log` |
| 32 | `npm run verify:staff-localization` | 08:15:08.833 | 0 | `32-verify-staff-localization-1794816926063.log` |
| 33 | `npm run verify:role-visuals` | 08:15:26.065 | 0 | `33-verify-role-visuals-1794816944781.log` |
| 34 | `node --env-file=.env.test.local .local/m1/preserve.mjs` | 08:15:44.782 | 0 | `34-m1-preserve-1794816945145.log` |
| 35 | `npx --no-install supabase migration up --local` | 08:18:53.669 | 0 | `35-migrate-local-1794817138276.log` |
| 36 | `npx --no-install supabase db lint --local` | 08:18:58.276 | 0 | `36-schema-lint-1794817140686.log` |
| 37 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 08:19:00.776 | 0 | `37-units-1794817175282.log` |
| 38 | `npm run typecheck` | 08:19:35.284 | 0 | `38-typecheck-1794817181870.log` |
| 39 | `npm run lint` | 08:19:41.871 | 0 | `39-lint-1794817202702.log` |
| 40 | `npm run verify:school-operations` | 08:20:02.704 | 0 | `40-verify-school-operations-1794817248005.log` |
| 41 | `npm run verify:attendance-integrity` | 08:21:55.586 | 0 | `41-verify-attendance-integrity-1794817335572.log` |
| 42 | `npm run verify:attendance` | 08:22:15.970 | 0 | `42-verify-attendance-1794817339371.log` |
| 43 | `npm run verify:reconnect` | 08:22:19.381 | 0 | `43-verify-reconnect-1794817367613.log` |
| 44 | `node --env-file=.env.test.local .local/m1/preserve.mjs` | 08:22:47.614 | 0 | `44-m1-preserve-1794817368023.log` |
| 45 | `node --env-file=.env.test.local .local/m1/integrity.mjs` | 08:27:45.638 | 1 | `45-m1-integrity-1794817666418.log` |
| 46 | `npx --no-install supabase db lint --local` | 08:27:46.458 | 0 | `46-schema-lint-1794817670616.log` |
| 47 | `npm run build:isolated -- --working-tree` | 08:27:50.617 | 0 | `47-build-isolated-1794817738815.log` |
| 48 | `node --env-file=.env.test.local .local/m1/preserve.mjs` | 08:28:58.874 | 0 | `48-m1-preserve-1794817739814.log` |
| 49 | `node --env-file=.env.test.local .local/m1/integrity.mjs` | 08:30:22.220 | 0 | `49-m1-integrity-1794817824111.log` |
