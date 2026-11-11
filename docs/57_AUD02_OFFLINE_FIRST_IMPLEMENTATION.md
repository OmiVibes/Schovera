# AUD-02 — Durable offline school operations: approved local prototype

9 November 2026. **Status: PARTIALLY FIXED overall; the approved bounded, synthetic local prototype is implemented and verified.** Attendance and Teacher Important student updates now have genuine SQLite capture, process-restart recovery and authorized replay to local Supabase. A separately hosted cloud replica, physical network outage, school Wi-Fi, Raspberry Pi and real-school operation were not tested or enabled.

The first feasibility phase stopped for authorization/replay decisions. The owner then explicitly approved the bounded design: a 30-minute capture lease, fresh same-Teacher authorization at replay, attendance conflicts held for review, SQLite reuse, small local migrations and synthetic loopback testing. The earlier feasibility text is retained in ignored evidence as `feasibility.before.md`; its earlier BLOCKED verdict is superseded by this implementation record.

## What changed and why

Before this work, attendance called `save_class_attendance` directly and failed without a durable queue. A Teacher update had only one browser `sessionStorage` recovery request and required explicit retry. Neither was a school-to-cloud outbox. The RFID queue's device identity could not authorize Teacher writes.

The prototype keeps PostgreSQL authoritative and reuses the **existing gateway SQLite file and its WAL/FULL transaction infrastructure**. It adds separate `school_operations`, `school_operation_schema` and operator simulation-control tables; it never writes attendance into `gateway_events` or infers attendance from a scan. The gateway's own schema version remains 2, while the namespaced school-operation schema is version 1. Existing RFID queues and contracts remain intact.

Teacher attendance and Important student updates can opt in with **Enable offline saving**. Normal saving remains the existing path until opt-in; Normal updates, corrections, homework and Principal school announcements are not queued by this feature. The setting is remembered per Teacher so a browser reload after a development-server restart resumes the worker. Only this enable preference is newly persisted by the browser layer: the lease stays in memory, and the durable queue is on the server. Existing Supabase browser authentication and pre-existing pending-send `sessionStorage` remain separate; that temporary message recovery includes the draft/request identity until capture is acknowledged and is not the durable outbox. No new password, refresh credential or private key is persisted by this feature.

The UI uses the existing card/button styling and adds status/control copy in English, Hindi and Marathi. It shows a local simulation label, readiness, pending/review counts and Retry sync. Pending/failed work is never labelled sent, delivered or read. The new controls and endpoint require explicit local launcher flags; other server modes keep their previous behavior.

## Authorization and replay contract

1. While connected, a fresh authenticated Teacher requests a lease for an assigned class/date. The database verifies the active account/session, school, assignment and current roster. The lease contains opaque scope IDs, the roster, an attendance baseline, issuance/expiry and a server signature, valid for at most 30 minutes.
2. A purpose-specifigeneratedc Ed25519 private key is  once in the ignored school-server directory. It is separate from RFID keys and never sent to the browser. The signed lease is a bearer capture capability, not a private key or proof of a physical person/scan.
3. During an outage, the local API verifies the lease without an authority lookup, validates/canonicalizes the complete operation and commits it transactionally to SQLite **before acknowledging local capture**. Duplicate ID/content returns the existing row; changed content conflicts. Queue capacity is bounded at 10,000 retained operations. One pending register per actor/class/day prevents competing local drafts from being silently stacked.
4. Replay requires a fresh bearer session for the **same Teacher and school**. The new RPCs also check the current `auth.sessions` row and account ban state, including direct RPC calls. Logged-out, inactive or unauthorized users cannot replay. No service-role impersonation or stored refresh credential is used.
5. Attendance uses the same class/day advisory transaction lock as the existing online writer, an expected baseline, and an actor/operation-scoped immutable receipt. A newer register causes a review hold instead of last-write-wins. The attendance mutation and receipt commit atomically. Retry returns the same receipt without another mutation/audit entry.
6. Important updates reuse `send_student_update` idempotency under the original Teacher. Original text/request identity is preserved. Nothing creates an approved translation or a Parent acknowledgement automatically. Acknowledgement remains a separate Parent action.
7. Automatic replay runs while the authenticated Teacher website is open, approximately every five seconds; it also runs on reconnect and explicit retry. Temporary failures back off with a bounded delay and move to review after eight failures. Explicit Retry can resume transient failures; it cannot force a conflict/revocation hold. No pending/held record is silently deleted.

Capture is permission to retain a **pending intention**, not final school-record authorization. A revocation at an unreachable authority cannot be discovered immediately; replay rechecks current permission. Expired leases cannot capture new work, but previously captured rows survive expiry/restart/logout. Without an active same-Teacher session, they wait. A newly opened browser without a usable lease/roster is not promised offline startup. Held-work resolution is not a new Principal workflow in this prototype; it requires separate reviewed handling, and rows remain retained.

## Local storage, timestamps and destination confirmation

The SQLite file is `.local/schovera-rfid-gateway/gateway.sqlite`; the new server key is `school-operation-issuer.pem` in that directory. Both remain ignored. The queue stores synthetic student IDs, register statuses and original messages, a different data class from opaque gate events. There are no raw card UIDs or new production credentials in this workflow.

`authored_at` preserves the submitted timestamp as untrusted evidence, `local_received_at` records local durable capture, and the destination receipt records its own commit time. An update's normal `sent_at` remains server-generated on persistence; it is not rewritten to pretend delivery happened earlier. The shared attendance-date/baseline columns use fixed unused markers for update operations so lease renewal cannot change their immutable replay identity; those markers are not message timestamps and are not displayed as such.

Only a matching confirmed destination receipt with a valid timestamp produces `synced`. Lost-response and local receipt-write failures retain the same operation ID for safe retry. Checksums detect accidental stored-envelope corruption; they are not protection against an administrator who controls the filesystem. Full-disk/I/O failure returns no confirmed local save. Physical power-loss/storage-media behavior was not tested.

## Supported offline scenarios

| Scenario | Current bounded result |
|---|---|
| A. Internet unavailable; local app/network/database available | Local operation can continue. This laptop prototype uses loopback, not a tested school LAN. No WAN cable/radio was disconnected. |
| B. Destination/authority unavailable; local school service available | With a valid pre-issued lease, attendance/Important updates genuinely commit to local SQLite and wait. Verified with explicit adapter-level outage injection. |
| C. Local school service unavailable | New saves cannot be confirmed. Previously committed queue rows survive restart. A lost acknowledgement is reconciled/retried using the same identity. |
| D. Teacher disconnected from both internet and school network | Unsupported. This is not a browser/PWA outbox, and the school server cannot acknowledge a request it never receives. |
| E. Connectivity returns | The open authenticated Teacher website automatically replays; expired/logged-out/revoked access waits or is held. Unattended replay after logout is unsupported. |

**Simulation boundary:** the operator modes affect this operation adapter. `offline` pauses delivery; `authority-offline` also prevents new authority-backed lease/sync calls; `lose-response` loses one response after a real authorized RPC commit. Shared local Supabase stays running for independent verification. These modes are not an OS network sandbox, a physical internet disconnection, or proof of a separate cloud replica. The queue, process restarts, authorized HTTP/RPC writes and receipts are real. No fixture was inserted directly at the destination and called synchronization.

## Scope: Important update versus school announcement

The queued notice is a **Teacher Important student update** for an assigned student's authorized Parent. It contributes to AUD-01 communication totals. School-wide `announcements` remain Principal-only and are not part of this queue. No Teacher publication permission or RLS policy was broadened to change that distinction.

## Files and database changes

| File | Change |
|---|---|
| `scripts/school-operations/store.mjs` | Reuse gateway SQLite; signed lease validation; canonical intent capture, bounded queue, receipts/retry/review |
| `scripts/school-operations/store.test.ts` | Ten focused lease/validation/transaction/recovery/capacity/retry tests |
| `src/app/api/school/operations/route.ts` | Local-only lease/capture/status/sync endpoint, bounded body, Host/Origin checks, fresh Teacher identity, redirect refusal |
| `src/lib/use-school-operations.tsx` | Opt-in, class/date lease, durable capture adapter, authenticated automatic replay, persisted enable setting and mobile status |
| `src/lib/school-operation-copy.ts` | New interface-only English/Hindi/Marathi copy; authored data unchanged |
| `src/components/schovera-app.tsx` | Narrow Teacher attendance/Important-update adapters; retain authored timestamp/request identity across retries |
| `scripts/dev-rfid-local.mjs` | Two additional fixed local feature flags, preserving AUD-04's environment allowlist |
| `supabase/migrations/20261109120000_school_operation_receipts.sql` | Receipt table, authorized baseline/replay, common attendance lock and compatible online wrapper |
| `supabase/migrations/20261109121000_school_operation_session_scope.sql` | Mandatory live session/account check and private inner-function execution boundaries |
| `supabase/migrations/20261109122000_validate_school_operation_envelope.sql` | Strict direct-RPC envelope validation |
| `scripts/verify-school-operations.mjs` | Real local HTTP/browser/database acceptance, owned process restart, outage/lost-response/conflict tests and scoped cleanup |
| `scripts/school-operations/cli.mjs` | Guarded operator-only local simulation mode command |
| `scripts/school-operations/presentation.mjs` | Journaled synthetic rehearsal preparation and explicit owned reset |
| `scripts/build-isolated.mjs` | Require the new API route in the existing build verification; isolation checks unchanged |
| `package.json` | Three local verification/rehearsal commands; dependency specifications unchanged |
| `docs/57_AUD02_OFFLINE_FIRST_IMPLEMENTATION.md` | This implementation, evidence and rehearsal record |

The three migrations were reviewed and applied only with `npx --no-install supabase migration up --local` in the approved QA checkout. The local migration count changed from 35 to 38; `supabase db lint --local` reported no schema errors. There was no reset, backfill, production migration or base database replacement. The online attendance function retains its signature and original validation through an execute-restricted inner function. Browser roles cannot call that inner function or read the server-only receipt table; authorized wrappers recheck role/school/session. Receipt foreign-key cascades support explicit synthetic account/school cleanup, not browser deletion rights.

## Verification and preservation

Repository: `D:\Notes\Degree\Projects\Schovera`; branch `feat/simpler-demo-and-workspaces`; starting/final HEAD `aac3a7c77d11518dc0654e3f89381f472943b064`. Nothing was staged, committed, pushed or deployed. All prior migrations and AUD-01 aggregate implementation/tests remain intact. AUD-03 versions remain Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5; no dependencies were added/upgraded. The prior eight moderate lint-tool findings remain open.

All execution used the existing isolated QA checkout `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, approved local files, Supabase `127.0.0.1:54321`, and owned web ports 3104/3105. The developer `.env.local` was not opened, copied, hashed or modified. No protected school record/password was changed. Other existing installations were not silently upgraded or migrated. Node 22.18.0 was used; the local SQLite prototype requires Node 22.13+ and the API loads it only after local feature guards pass. The normal application engine declaration is unchanged; other runtimes were not certified here.

Evidence **E**: `.local/schovera-manual-demo/aud02-implementation-20261109/`. It retains logs, timestamps, original-source hashes, failure records, final summary and hashes. The feasibility phase has its separate earlier ledger. The focused verifier creates a unique `.local/school-operation-qa-<id>/` directory in QA with browser captures and a result file; failed iterations retain their own evidence. Known local test credentials are redacted in the runner. No private keys or passwords belong in this report or screenshot material.

**60 recorded executions: 49 PASS, 11 FAIL.** Failed attempts are retained below; the latest required checks pass. Times are UTC on 9 November 2026 (IST = UTC +05:30). The ledger retains end times and working directories. These repeated executions are not independent coverage totals.

| Acceptance area | Final result and evidence scope |
|---|---|
| Unit/component tests | **325 tests in 37 files passed**, including ten new queue/lease tests and the existing RFID/gateway/attribution subsets |
| TypeScript and ESLint | **PASS** after corrections; no rules or old test assertions weakened |
| School-operation acceptance | **PASS**: actual HTTP capture, online save, invalid/forged/expired scope, three pending operations through real server restart, real RPC receipts, duplicate/lost-response/concurrent retry, newer-attendance hold, revoked class/session, Parent reads and three-portal mobile UI |
| Normal operations | **PASS**: attendance/homework/announcements, communication/acknowledgements, translation approval and original preservation, role/tenant denial |
| AUD-01 | **PASS**: boundary counts through 2,005 updates, 2,007-row correction case, keyset traversal, exact SQL/oracle/UI agreement |
| Existing RFID | **PASS**: both v2 and durable gateway integration scenarios; gate events remain separate from attendance |
| Navigation/reconnect/localization/layout | **PASS**: three roles, reconnect/context isolation, 96 staff language/width combinations, 23 destinations at four widths and accessibility/i18n checks |
| Rehearsal prepare/reset | **PASS**: fresh owned school, actual durable pending HTTP capture, explicit scoped discard, SQL/queue/journal cleanup verified |
| Final isolated build | **PASS**, Next 16.4.1, TypeScript, all expected routes including school operations, generated environment file only, private sentinels absent, stable inputs and exact temporary-snapshot cleanup |
| Preservation | **PASS**, all 20 protected-school dataset hashes unchanged; no new protected-school receipts; owned operation queue empty; simulation mode restored online |

Final build fingerprint: `935b0b974de1fb2f680e645de652a8478580bddcc4605cafdf23403a617ab7ef` (183 approved files, uncommitted). Build egress observed only the two allowlisted Google Fonts hosts through the existing limited proxy, not an OS sandbox. The selected final acceptance captures/results are copied to **E/screenshots/**. Teacher pending and Parent/Principal mobile views were visually inspected. There is no new presentation video.

### Full implementation execution ledger

Tests use QA except the root isolated build wrapper. The focused verifier owns port 3105; ordinary browser checks use 3104. The extra rehearsal/integrity probes are ignored QA evidence helpers, not public APIs. Migration applications and schema lint are separately recorded above with exit 0.

| # | Exact command | UTC start | Exit | Result | Evidence log |
|---:|---|---|---:|---|---|
| 1 | `npm run typecheck` | 14:43:28.794 | 2 | FAIL | `01-typecheck.log` |
| 2 | `npm run lint` | 14:43:36.059 | 1 | FAIL | `02-lint.log` |
| 3 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 14:43:52.026 | 0 | PASS | `03-units.log` |
| 4 | `npm run typecheck` | 14:44:25.084 | 2 | FAIL | `04-typecheck.log` |
| 5 | `npm run lint` | 14:44:29.210 | 0 | PASS | `05-lint.log` |
| 6 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 14:45:28.666 | 0 | PASS | `06-preserve-school.log` |
| 7 | `npm run typecheck` | 14:45:29.396 | 0 | PASS | `07-typecheck.log` |
| 8 | `npm run verify:school-operations` | 14:51:07.886 | 1 | FAIL | `08-verify-school-operations.log` |
| 9 | `npm run verify:school-operations` | 14:51:23.013 | 1 | FAIL | `09-verify-school-operations.log` |
| 10 | `npm run verify:school-operations` | 14:52:12.680 | 1 | FAIL | `10-verify-school-operations.log` |
| 11 | `npm run verify:school-operations` | 14:54:45.802 | 1 | FAIL | `11-verify-school-operations.log` |
| 12 | `npm run verify:school-operations` | 14:57:06.691 | 1 | FAIL | `12-verify-school-operations.log` |
| 13 | `npm run verify:school-operations` | 14:58:52.351 | 1 | FAIL | `13-verify-school-operations.log` |
| 14 | `npm run typecheck` | 14:59:25.733 | 0 | PASS | `14-typecheck.log` |
| 15 | `npm run lint` | 14:59:34.754 | 0 | PASS | `15-lint.log` |
| 16 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 14:59:49.986 | 0 | PASS | `16-units.log` |
| 17 | `npm run verify:school-operations` | 15:00:53.385 | 0 | PASS | `17-verify-school-operations.log` |
| 18 | `npm run typecheck` | 15:01:31.530 | 0 | PASS | `18-typecheck.log` |
| 19 | `npm run lint` | 15:01:36.198 | 0 | PASS | `19-lint.log` |
| 20 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 15:01:50.979 | 0 | PASS | `20-units.log` |
| 21 | `npm run verify:school-operations` | 15:02:29.180 | 0 | PASS | `21-verify-school-operations.log` |
| 22 | `npm run typecheck` | 15:05:23.945 | 0 | PASS | `22-typecheck-1794236730469.log` |
| 23 | `npm run lint` | 15:05:30.481 | 0 | PASS | `23-lint-1794236745637.log` |
| 24 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 15:05:45.638 | 0 | PASS | `24-units-1794236778834.log` |
| 25 | `npm run verify:attendance` | 15:06:18.836 | 0 | PASS | `25-verify-attendance-1794236780647.log` |
| 26 | `npm run verify:assignments` | 15:06:20.738 | 0 | PASS | `26-verify-assignments-1794236781706.log` |
| 27 | `npm run verify:announcements` | 15:06:21.710 | 0 | PASS | `27-verify-announcements-1794236782686.log` |
| 28 | `npm run verify:phase1` | 15:06:22.688 | 1 | FAIL | `28-verify-phase1-1794236798862.log` |
| 29 | `npm run verify:principal-communication` | 15:06:38.883 | 0 | PASS | `29-verify-principal-communication-1794236822854.log` |
| 30 | `npm run verify:final-journeys` | 15:07:02.857 | 0 | PASS | `30-verify-final-journeys-1794236858687.log` |
| 31 | `npm run test:rfid:integration` | 15:07:38.761 | 0 | PASS | `31-test-rfid-integration-1794236862878.log` |
| 32 | `npm run test:gateway:local-integration` | 15:07:42.881 | 0 | PASS | `32-test-gateway-local-integration-1794236885337.log` |
| 33 | `npm run test:translations:db` | 15:08:05.355 | 0 | PASS | `33-test-translations-db-1794236887632.log` |
| 34 | `npm run verify:role-navigation` | 15:08:07.708 | 0 | PASS | `34-verify-role-navigation-1794236906828.log` |
| 35 | `npm run verify:reconnect` | 15:08:26.917 | 0 | PASS | `35-verify-reconnect-1794236933239.log` |
| 36 | `npm run verify:staff-localization` | 15:08:53.253 | 0 | PASS | `36-verify-staff-localization-1794236950389.log` |
| 37 | `npm run verify:role-visuals` | 15:09:10.540 | 0 | PASS | `37-verify-role-visuals-1794236969499.log` |
| 38 | `npm run verify:accessibility-i18n` | 15:09:29.500 | 0 | PASS | `38-verify-accessibility-i18n-1794236976530.log` |
| 39 | `npm run build:isolated -- --working-tree` | 15:09:36.644 | 1 | FAIL | `40-build-isolated-1794237046985.log` |
| 40 | `npm run verify:phase1` | 15:10:29.256 | 0 | PASS | `39-verify-phase1-1794237044242.log` |
| 41 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 15:10:47.086 | 0 | PASS | `41-preserve-school-1794237047684.log` |
| 42 | `npm run verify:school-operations` | 15:13:38.523 | 0 | PASS | `42-verify-school-operations-1794237253113.log` |
| 43 | `npm run typecheck` | 15:14:13.206 | 0 | PASS | `43-typecheck-1794237259998.log` |
| 44 | `npm run lint` | 15:14:20.096 | 0 | PASS | `44-lint-1794237275270.log` |
| 45 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 15:14:35.272 | 0 | PASS | `45-units-1794237309092.log` |
| 46 | `npm run typecheck` | 15:16:45.601 | 0 | PASS | `46-typecheck-1794237409735.log` |
| 47 | `npm run lint` | 15:16:49.736 | 0 | PASS | `47-lint-1794237423662.log` |
| 48 | `npm run verify:school-operations` | 15:17:03.663 | 0 | PASS | `48-verify-school-operations-1794237456581.log` |
| 49 | `npm run build:isolated -- --working-tree` | 15:17:36.584 | 0 | PASS | `49-build-isolated-1794237518020.log` |
| 50 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 15:18:38.023 | 0 | PASS | `50-preserve-school-1794237518713.log` |
| 51 | `npm run school:presentation -- prepare` | 15:20:36.603 | 0 | PASS | `51-presentation-prepare-1794237639399.log` |
| 52 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/pending.mjs` | 15:20:39.406 | 0 | PASS | `52-presentation-pending-1794237639933.log` |
| 53 | `npm run school:presentation -- clean --discard-pending` | 15:20:39.934 | 0 | PASS | `53-presentation-clean-1794237640733.log` |
| 54 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/verify-cleanup.mjs` | 15:20:40.735 | 0 | PASS | `54-presentation-verify-cleanup-1794237641003.log` |
| 55 | `npm run verify:staff-localization` | 15:20:41.004 | 0 | PASS | `55-verify-staff-localization-1794237659841.log` |
| 56 | `npm run verify:role-navigation` | 15:20:59.844 | 0 | PASS | `56-verify-role-navigation-1794237679403.log` |
| 57 | `npm run verify:phase1` | 15:21:19.409 | 0 | PASS | `57-verify-phase1-1794237692581.log` |
| 58 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 15:21:32.653 | 0 | PASS | `58-preserve-school-1794237693035.log` |
| 59 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/final-integrity.mjs` | 15:27:45.775 | 0 | PASS | `59-presentation-final-integrity-1794238066145.log` |
| 60 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 15:27:46.239 | 0 | PASS | `60-preserve-school-1794238066800.log` |

Known approved local service/key material was absent from the retained execution logs in the final scan; production secret values were never deliberately read or compared. All owned QA web process trees were identity-checked and stopped afterward. Docker was left running; Ollama was not started for this phase. The QA checkout, server key, database infrastructure and ignored evidence are intentionally retained, while owned synthetic fixtures/queued operations and build snapshots were cleaned.

## Failed attempts retained

1. Early typechecks found inferred JavaScript option/Supabase client types and an implicit row type; they were corrected. An effect-startup lint failure was fixed by deferred, cancellable initialization. No existing assertion or lint rule was removed.
2. The new verifier initially prepared a fixture before its owned web server and targeted the old port. The test lifecycle was corrected to start port 3105 first and explicitly select it; the owned fixture cleanup was verified.
3. Two new probe expectations were wrong: the translation table uses `student_update_id`, and private receipt reads are explicitly denied rather than returning an empty array. The probes now assert the actual schema and stronger denial. Original failures remain.
4. A real browser regression showed that a development-server reload reset the in-memory enable choice and stopped automatic replay. The fix persists only that per-Teacher choice, while preserving fresh authorization. The next probe's second Enable click was obsolete because the choice now persisted; it was replaced with an assertion that readiness restored automatically.
5. Logout correctly returned HTTP 401 where the new probe expected 403. The exact denial expectation was corrected; direct use of the revoked bearer token is independently rejected at the RPC boundary.
6. An evidence-runner log filename collided with an archived earlier filename. The ignored runner now uses unique timestamped filenames and preserves its earlier logs. The check was rerun and recorded.
7. One unchanged `verify:phase1` Realtime subscription preflight timed out. An unchanged rerun passed delivery and acknowledgement. The cause is unconfirmed; the failed execution remains evidence, not a claimed passing run.
8. One optimized build compiled but correctly failed the unchanged-source guard because implementation edits continued during verification. A frozen-source rerun passed. The failed snapshot was cleaned; no guard was weakened.

## Laptop demonstration — step by step

Use only this QA setup and a **new owned synthetic rehearsal**, not the normal school's records. A fresh rehearsal refuses to overwrite an existing fixture; do not clean an unfamiliar journal to get past that refusal.

1. Start Docker/local Supabase using the existing safe QA setup. In PowerShell terminal 1:

   ```powershell
   Set-Location "$env:TEMP\schovera-qa-41c404875fbe43209c457a7763419c3e"
   npm run dev:rfid-local -- --port 3104
   ```

2. In terminal 2, in the same QA directory:

   ```powershell
   $env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
   npm run school:sync-mode -- online
   npm run school:presentation -- prepare
   npm run demo:credentials
   ```

   Read these generated synthetic sign-ins privately. Do not paste or commit the output. These accounts do not replace existing fixed accounts.

3. Open `http://127.0.0.1:3104`. Use separate browser profiles: Teacher in Chrome, Parent in Edge, Principal in Chrome Incognito. Select **Grade 8A / Synthetic Child A** from this rehearsal.
4. In Teacher → Attendance, choose today's date. Click **Enable offline saving** and wait for **Offline saving ready (30-minute permission)**. This must happen while the authority is reachable.
5. In terminal 2, simulate interruption:

   ```powershell
   npm run school:sync-mode -- authority-offline
   ```

   Explain that this blocks the prototype's authority/delivery path; it does not disconnect the laptop's Wi-Fi or stop shared PostgreSQL.
6. Mark the synthetic student **Late** and save. Wait for **Saved locally — waiting to sync** and the pending count. Parent still shows the destination's earlier/no record; do not claim remote delivery.
7. Optionally prove process recovery: stop **only terminal 1's owned web server** with Ctrl+C, then run the same `dev:rfid-local` command again. Leave the authenticated Teacher browser open. The durable pending row survives; no database reset is involved.
8. Restore the connection simulation:

   ```powershell
   npm run school:sync-mode -- online
   ```

   With the Teacher website authenticated/open, wait for **All changes synced**. Then refresh Parent attendance and Principal attendance to see the committed Late record. Repeated Retry does not create another attendance row.
9. For an Important notice, open Teacher → Students, choose Synthetic Child A, ensure offline readiness, and select the Important checkbox. Pause the adapter with `offline`, type/send an original synthetic message, show the pending count, then restore `online`. Parent → Updates shows the original; acknowledge it there. Principal → Communication shows the updated important/acknowledged counts. This is a student update, not a Teacher school-wide announcement.
10. End rehearsal safely. Close its browser sessions, restore `online`, and explicitly discard **only the journaled synthetic rehearsal**:

    ```powershell
    npm run school:sync-mode -- online
    npm run school:presentation -- clean --discard-pending
    ```

    The marker must match the current fixture before any deletion. This intentionally discards that rehearsal's pending SQLite operations and removes only its generated accounts/records. An unrelated fixture is refused. Do not use a database reset or blanket cleanup.

For a fully automated rehearsal/acceptance run, stop terminal 1 first so the test can own the development-server lock, then run `npm run verify:school-operations`. It owns port 3105, creates its own fixture, performs actual capture/restart/replay and three-portal browser checks, and cleans only that fixture. Run it in isolated QA with the local stack already up. Its screenshots/results remain available after cleanup.

## Backup, explanation and limitations

The focused verifier retains Teacher pending/synced, Parent attendance and Principal communication screenshots. Stress-run images may show intentionally held review cases; explain them accurately. Use these captures if the live connection simulation fails. A new presentation recording was not created; record a rehearsed, genuinely successful flow before travel, excluding credentials and private journals.

Arohi can say: **“The laptop acts as our school server. Before the connection fails, it gets a short permission for the Teacher's class. It stores the work on disk first. When the connection returns and the Teacher is signed in, it sends the same saved operation and waits for a database receipt. If somebody has already corrected attendance, it keeps our older work for review instead of replacing that correction.”**

Known limits: this is a synthetic loopback destination and fault-injection prototype, not a separately hosted cloud replica. The school service must be reachable to capture. Browser offline boot/PWA behavior, unattended replay after logout, remote family delivery during an outage, physical LAN/WAN changes, Pi/power-loss/disk-full hardware behavior and public release are not certified. Capture leases cannot observe offline revocation; current authorization is mandatory at replay. Held-work resolution, production retention/encryption/key rotation/backup/restore, distributed limits and real-school onboarding require further review. The database file uses OS filesystem permissions; it is not encrypted and is not a production security boundary. Localization quality and actual audible voices remain human acceptance tasks; no new AI model or paid service was enabled.

Recommended next actions, maximum five: rehearse the owned local flow; review fluent interface wording/audio and capture a backup recording; decide the later hosted authority/replica design separately; review retention/key custody/held-work operations before real data; keep dependency, hardware and public deployment acceptance separate. No additional approval is needed to inspect or run the verified bounded local prototype within these guards.

## Final Git status

No staged changes; HEAD unchanged. The earlier AUD-01/AUD-03/AUD-04 changes below predate this task and remain preserved except for the approved Teacher adapters and two fixed launcher flags described above.

```text
 M package-lock.json
 M package.json
 M scripts/build-isolated.mjs
 M scripts/dev-rfid-local.mjs
 M src/components/schovera-app.tsx
 M src/lib/ui-copy-extra.mjs
?? CLAUDE.md
?? docs/54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md
?? docs/55_AUD03_DEPENDENCY_SECURITY_REMEDIATION.md
?? docs/56_AUD04_RFID_LAUNCHER_SECURITY.md
?? docs/57_AUD02_OFFLINE_FIRST_IMPLEMENTATION.md
?? local-dev.err
?? local-dev.out
?? review/
?? scripts/school-operations/
?? scripts/test/rfid-launcher.test.ts
?? scripts/verify-principal-communication.mjs
?? scripts/verify-school-operations.mjs
?? src/app/api/school/operations/
?? src/lib/principal-communication.test.ts
?? src/lib/principal-communication.ts
?? src/lib/school-operation-copy.ts
?? src/lib/use-principal-communication.test.tsx
?? src/lib/use-principal-communication.ts
?? src/lib/use-school-operations.tsx
?? supabase/migrations/20261109100000_principal_communication_summary.sql
?? supabase/migrations/20261109120000_school_operation_receipts.sql
?? supabase/migrations/20261109121000_school_operation_session_scope.sql
?? supabase/migrations/20261109122000_validate_school_operation_envelope.sql
```
