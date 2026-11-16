# M4 — Software reliability and remaining gaps

16 November 2026. Baseline `fd54eb3533e093c588ecc6e7490b3893efb80be6`, verified on `main` and `origin/main` before editing. **M4 implements local held-work resolution, bounded subscription recovery and gateway worker safety.** Excused and the remaining unsupported lint dependency patch are deferred explicitly. This is synthetic local software evidence, not a production/hardware certificate. M5 is not implemented.

## Baseline, boundaries and files

The M1–M3 reports, register lifecycle/revision/history contracts, v2 signatures and immutable gateway events, pending/retry/review/synced school-operation state machine, browser subscriptions, diagnostics, tests and dependency metadata were inspected. Existing `.env.local` was never opened, copied, moved, renamed, printed, hashed or modified. Work used the existing approved isolated QA checkout and its retained local configuration. No database reset, protected record rewrite, existing account/password change, hosted service, paid provider or physical device operation was performed.

The pre-existing edit to `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, untracked `CLAUDE.md` and `review/` remain untouched and excluded. No stash, reset, force-push or unrelated cleanup is used. No dependencies were upgraded, and `package-lock.json` is unchanged. Two actual supported scripts are added: `verify:held-resolutions` and `verify:second-tab`.

- `package.json`
- `scripts/dev-rfid-local.mjs`
- `scripts/rfid-gateway/diagnostics.mjs`
- `scripts/rfid-gateway/local-v2-transport.mjs`
- `scripts/rfid-gateway/storage.mjs`
- `scripts/rfid-gateway/transport.mjs`
- `scripts/school-operations/store.mjs`
- `scripts/school-operations/store.test.ts`
- `scripts/test/rfid-launcher.test.ts`
- `src/app/api/school/operations/route.ts`
- `src/components/schovera-app.tsx`
- `src/lib/attendance-review-copy.mjs`
- `src/lib/attendance-review.ts`
- `src/lib/use-realtime-resync.ts`
- `src/lib/use-school-operations.tsx`
- `docs/64_M4_SOFTWARE_RELIABILITY_AND_COMPLETION.md`
- `scripts/rfid-gateway/runtime-guard.mjs`
- `scripts/rfid-gateway/worker.test.mjs`
- `scripts/school-operations/held-review.mjs`
- `scripts/school-operations/held-review.test.mjs`
- `scripts/verify-held-resolutions.mjs`
- `scripts/verify-second-tab.mjs`
- `src/components/held-operation-review.tsx`
- `src/lib/use-realtime-resync.test.tsx`
- `supabase/migrations/20261116130000_held_operation_resolution.sql`
- `supabase/migrations/20261116131000_closed_operation_replay_guard.sql`

## Held-work review and resolution

Before M4, `pending` work retried with backoff, `synced` meant a matching confirmed destination receipt, and `review` retained a conflict/revocation/validation failure. Only transient `retry_needed` holds could be explicitly retried. Staff could see minimal identifiers/advice but could not inspect a safe comparison or record a durable disposition.

That state machine and original canonical envelope/hash/receipt remain intact. M4 adds a separate durable resolution record rather than relabelling a held intention as delivered:

1. The original Teacher signs in and selects **Review held operation**. The guarded local API rechecks live Teacher identity, school, current assignment and class/date, verifies the retained envelope checksum/ownership and loads an authorized current register/roster.
2. The response contains only operation kind/date/error, current revision/state and current authorized student names/IDs with saved versus intended status. Original correction notes, canonical JSON, message title/body, credentials and unauthorized/transferred student details are not returned. Newly enrolled students have no invented intended mark. The review is bounded at 500 current students.
3. For attendance, staff deliberately choose the reviewed statuses and enter a meaningful reason. **Save new reviewed attendance** uses a NEW request ID, the loaded current revision and the normal M1/M2 finalized writer. The database rechecks current session/account/class/school/roster, requires a meaningful reason and atomically records the new write and resolution receipt. Stale revisions are rejected, never forced.
4. Alternatively, **Close without applying original** records an explicit private reason/disposition without changing attendance. Important-update holds support this non-resend closure; any replacement message must be composed separately in the existing Students workflow with a new identity. Its private original text is not exposed or automatically resent by this review.
5. A matching repeated resolution request returns the original resolution result. A different intent/request competing for the same held item conflicts. The original held row remains `review` with its original canonical bytes/hash/receipt; a separate disposition explains closure or the new write. The UI says the original was not applied, and never labels closure “sent” or “synced”. Resolved holds no longer mark the current register as conflicting.
6. A lost local disposition cache can be recovered from the authorized destination resolution receipt during another review. The cache rejects changing an already recorded result. Abandoning a comparison before confirmation does not write a resolution; abandoning a submitted HTTP request may leave a committed receipt, which must be recovered/retried with the same identity.

Only the original currently authorized Teacher can resolve that Teacher's held work. A Principal does not acquire Teacher impersonation rights. Revoked/inactive/logged-out actors must recover legitimate authorization first; this workflow does not bypass a revocation. A transferred/changed roster may require deliberately choosing the complete current register; unauthorized old children are not displayed or automatically transferred into a new write. Damaged envelopes remain held for trusted operator investigation.

The local API verifies actual SQLite ownership/hash. Destination resolution provenance records the supplied original ID/hash; it is not independent certification of the local filesystem against an administrator. Private reasons/intent remain inaccessible through browser table reads. Trusted service-role fixture cleanup remains distinct from browser permissions.

### Closure and replay races

The resolution and original replay functions share an actor/original-operation advisory lock. A closed original is rejected at the destination as `operation_resolved`, even if the local disposition cache is missing or an older client retries it. Locally, Retry sync excludes disposition-bearing transient holds. An original with an existing confirmed school-operation receipt cannot be falsely closed as unapplied. Existing matching replay receipts remain authoritative; the workflow never rewrites an envelope, receipt or expected revision to make a conflict pass.

Two additive local migrations were reviewed/applied, bringing QA from **46 to 48** migrations:

| Migration | Change |
|---|---|
| `20261116130000_held_operation_resolution.sql` | Private append-only destination resolution records, fresh-authorized idempotent new-write/closure RPC and minimized receipt lookup |
| `20261116131000_closed_operation_replay_guard.sql` | Serialize resolution against replay, reject closure of an already confirmed original, reject replay of a resolved original and restrict the renamed inner replay function |

SQLite adds `school_operation_dispositions`, referencing the existing operation row. No second event queue, canonical payload copy or status rewrite is introduced. Gateway schema version remains 2; school-operation envelope/schema contracts remain version 1 storage with M1's existing version-2 attendance payload. Old clients cannot force a closed operation through the destination. No prior SQL migration was edited/backfilled, and no production migration was attempted.

### Failure explanations

Stale revision and missing correction reason remain distinct held error codes with different advice. Current permission refusal directs staff to assignment/account review. A signed-out/expired session directs staff to sign in again; an expired 30-minute capture permission requires reconnecting/preparing that class. Service/authority unavailability retains work and does not claim a new save or final delivery. A successful comparison is not authorization to write later: every resolution rechecks current authority. New interface controls/messages use existing English/Hindi/Marathi localization; fluent wording acceptance remains manual.

## Excused — deliberately deferred

The SQL enum, attendance rows/audit history, M1 snapshots/writer, M2 reconciliation/count schemas, Teacher controls, Parent/Principal views, profile/report aggregation, charts, translations and offline validators were inspected. All currently agree on Present/Absent/Late. Existing reporting counts Present/Late over recorded entries; no policy has been approved for Excused's denominator or effect on absence/history reporting.

Adding a fourth enum alone would let older consumers produce missing counters, reject snapshots or mishandle queued records. A safe implementation needs an explicitly versioned end-to-end rollout and old-client/queue compatibility gates, plus an agreed reporting policy. M4 therefore retains all three statuses. No historical Absent becomes Excused; no Excused input is mapped to Present/Absent/Late. Existing invalid-status denial tests remain. This is a documented remaining contract decision, not partial Excused support.

## Second-tab investigation and bounded fix

M3 retained an intermittent online second-Parent-tab delivery timeout. Source inspection identified a real query-to-subscription gap: `useRealtimeResync` reconciled only a *re*-subscription. If an authorized query completed, a message committed, and the initial channel joined afterward, neither that query nor the stream necessarily included the message.

M4 now reconciles the **first** successful subscription as well. The existing finite recovery window performs coalesced reads at startup and bounded follow-ups (650/1,800/4,500ms), then stops; focus/visibility/reconnect and actual events can initiate fresh scoped reconciliation. There is no continuous polling, arbitrary test sleep or increased test timeout. Refresh failures are handled without an unhandled rejection/false successful refresh. Cleanup resets scheduled/recovery flags so Strict Mode effect replay cannot freeze recovery.

Parent INSERT/acknowledgement callbacks use the same coalescer. Independent latest-read sequence guards stop older same-child update/attendance reads overwriting a newer response; existing child-context guards remain. Queries still use current authorized clients/RLS. Logout/unmount removes listeners/channels, and role/tenant/privacy tests remain separate from visible delivery.

`verify:second-tab` deliberately holds only the second Parent's actual `parent-updates` channel join, waits for the initial authorized read to render, commits a real Important message, verifies it is absent before release, releases the join and requires both sessions to show exactly one timeline card. It records only sanitized event/topic/status timing and visibility state—no WebSocket tokens, headers or message payloads. The previous verifier accepted any successful socket reply as readiness; that is not proof the relevant child/channel has joined. The controlled test targets that gap directly.

**Executed repetitions:** controlled initial-join gap 4/4 PASS; complete existing reconnect 6/6 PASS. None failed in this phase. Every run used owned fictional fixtures with cleanup; no readiness assertion or timeout was relaxed. The final repetitions include the Strict Mode cleanup change.

This demonstrates and closes an application recovery gap; it does not prove that every historical AUD-03/M3 timeout had exactly the same cause or certify delivery under every browser/network/server failure. Existing M3 probe-selection/atomic-snapshot repairs are retained unchanged. A finite local repetition is confidence evidence, not a load/SLA guarantee.

## Gateway operating safety and runtime

Previously, opening SQLite reset every `syncing` event to pending, even if another delivery worker was still running. M4 adds a single SQLite `gateway_delivery_worker` owner row with PID, unique ownership token and start time. Acquisition/release uses a short SQLite transaction, not a network-duration database lock. Real and fake gateway senders acquire the same lease; a competitor fails closed with `gateway_worker_busy`. Diagnostics expose owner PID/start/state without the ownership token or device secrets.

A concurrent database open can still perform safe reads/capture but cannot reset a live worker's syncing rows. Once an owner process is dead, a new owner recovers interrupted syncing as pending with the same canonical event/ID. Release requires the matching token and PID. A reused/inaccessible PID is treated conservatively as live; there is no clock-expiring lease that can silently create two owners. Diagnose/stop only the identified owned process; do not delete a lock or reset a queue to override an unknown worker.

All gateway workers/tools must be upgraded together and stopped before rolling back. Older binaries do not honor the new worker row. This is local single-host coordination on a trusted local filesystem, not distributed locking, resistance to malicious local code, network-filesystem support or production multi-worker certification. Pending/attention records and the existing WAL/FULL durability infrastructure are preserved. Actual Pi storage, physical power loss, reader wiring and disk-full media behavior remain untested.

Full local QA/gateway use requires **Node 22.13+**; this milestone used **Node 22.18.0 on Windows**. The RFID launcher now fails clearly before starting Next on unsupported runtimes. Storage checks runtime before dynamically loading SQLite. Launcher tests copy this new runtime-guard dependency while retaining every existing environment/security assertion. The standalone web engine declaration remains its existing Next requirement; it does not certify SQLite operation on Node 20. No ARM/Pi runtime was installed or tested.

## Fresh dependency/security audit

| Graph | Critical | High | Moderate | Audit exit |
|---|---:|---:|---:|---:|
| Production (`npm audit --omit=dev`) | 0 | 0 | 0 | 0 |
| All dependencies | 0 | 0 | 8 | 1 |

The eight entries remain propagated development/lint-tool findings, not eight independent application exploits. The [reviewed minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects >=7 <11.0.1 and identifies 11.0.1 as patched. The installed path is still Next lint config → TypeScript-ESLint → typescript-estree → minimatch 10.2.6. Official registry queries on 16 November returned latest typescript-estree/typescript-eslint **8.72.2**; estree still requests minimatch `^10.2.2`, while eslint-config-next 16.4.1 requests typescript-eslint `^8.56.0`.

No supported parent patch removing the affected major was established. npm's suggested Next lint-config downgrade to 15.5.29 is not a compatible remediation for this selected framework. No downgrade, unsupported minimatch major override, blind audit-fix, warning suppression or lockfile churn was applied. A compatible upstream fix or separately reviewed lint migration remains necessary. This keeps all-dependency audit acceptance open; zero production entries is not proof of hosted security. Existing Next 16.4.1/Zod 4.6.6/sharp 0.35.5 are retained.

Metadata commands: `npm view @typescript-eslint/typescript-estree@latest version dependencies.minimatch engines --json`; `npm view typescript-eslint@latest version peerDependencies --json`; `npm view eslint-config-next@16.4.1 dependencies.typescript-eslint --json`. These read registry metadata only and changed no dependency files.

## Execution, evidence and preservation

QA: `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`; Supabase `127.0.0.1:54321`, PostgreSQL `127.0.0.1:54322`; owned web ports 3104/3105. Only retained approved QA configuration was loaded. The guarded launcher still uses its OS/configuration allowlist and loopback/Host/Origin restrictions. No service was exposed publicly and Ollama was not required/started by M4.

Private ignored evidence: `.local/schovera-manual-demo/m4-20261116/`, containing exact command/start/end/exit logs, before hashes, integrity and publication receipts. QA `.local/held-resolution-<id>/` retains synthetic UI/result captures; `.local/second-tab-<id>/` retains sanitized timing. Known local test credentials are redacted from retained runner logs. Private environment/key/account files, databases, captures and generated logs are excluded from Git.

- **361 non-integration tests in 46 files passed**, including new held-projection/disposition, finite initial-subscription/Strict Mode cleanup, competing-worker/dead-worker recovery and runtime-guard tests. Existing RFID/gateway/attribution subsets are included, not extra totals. Final TypeScript and lint passed.
- **Held-work acceptance passed** with real HTTP/RPC/UI: sanitized saved/intended comparison, new reviewed correction, meaningful reason, stale revision refusal, duplicate/concurrent resolution, private-table denial, non-delivery closure, closed-original replay refusal, lost local disposition-cache recovery, held update closure without resending private text, revoked class/session, abandoned review and original canonical/receipt preservation. New form controls passed en/hi/mr checks at 390px without overflow or translating the authored reason.
- **Existing suites passed:** M1 integrity/attendance, M2 review and role privacy, M3 signed reader readiness, connected three-role journeys, RFID v2/gateway local integrations, offline school-operation capture/restart/replay, localization (96 role/page/language/width combinations), accessibility/i18n, reconnect and schema lint. Two separate Vitest integration scenarios passed; they are not part of the 361 unit/component count.
- **Protected data/source passed:** all 20 protected-school dataset hashes unchanged; 324 existing tracked files outside the intentional M4 edits unchanged; 257 executable source/script/migration files matched QA. The protected school has no new register/change/review/resolution rows; old migrations, lockfile, dependency specs/overrides and unrelated documentation were preserved. Scoped synthetic SQL/account/SQLite fixtures were cleaned.
- **Final isolated build passed:** Next 16.4.1 compilation, TypeScript, expected routes, generated production environment only, private sentinels absent, frozen input check and exact snapshot cleanup. Uncommitted source snapshot SHA-256: 344f7788517b9eda954ea467637549c57548fc2e2d80bb313ab38a40e889f2fa; 216 approved files. This is not a committed release. Only fonts.googleapis.com/fonts.gstatic.com were observed through the limited build proxy, not an OS sandbox. No hosted build/runtime or production acceptance is claimed.
- Owned QA web processes were stopped after verification; Docker retained and Ollama not started. Node 22.18.0/Windows was used. Existing passwords/configuration and protected records were not changed.

Failed attempts remain failures: the fresh all-dependency audit exits 1 with the eight findings above. The first lint run rejected recursive callback memoization after refresh error handling was added; a stable reconciliation ref replaced the recursive callback reference, and lint passed without suppressing a rule. Original assertions/timeouts were not weakened. Any further failed executions appear in the complete ledger below rather than being silently erased by reruns.

### Exact execution ledger

UTC on 16 November 2026; IST = UTC +05:30. Commands use QA except the root isolated build. Repeated executions overlap in coverage and are not independent test totals. Registry inspections above are separate read-only metadata commands.

**52 executions: 50 PASS, 2 FAIL.**

| # | Command | UTC start | Exit | Result | Log |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m4/preserve.mjs` | 11:33:49.446 | 0 | PASS | `01-m4-preserve-1794828830227.log` |
| 2 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 11:33:50.228 | 0 | PASS | `02-audit-production-1794828832781.log` |
| 3 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 11:33:52.782 | 1 | FAIL | `03-audit-dependencies-1794828835763.log` |
| 4 | `npm run typecheck` | 11:40:04.956 | 0 | PASS | `04-typecheck-1794829213258.log` |
| 5 | `npm run lint` | 11:40:13.363 | 1 | FAIL | `05-lint-1794829229766.log` |
| 6 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:40:29.767 | 0 | PASS | `06-units-1794829270022.log` |
| 7 | `npx --no-install supabase migration up --local` | 11:41:10.023 | 0 | PASS | `07-migrate-local-1794829273181.log` |
| 8 | `npx --no-install supabase db lint --local` | 11:41:13.182 | 0 | PASS | `08-schema-lint-1794829275494.log` |
| 9 | `npm run typecheck` | 11:42:25.558 | 0 | PASS | `09-typecheck-1794829353609.log` |
| 10 | `npm run lint` | 11:42:33.622 | 0 | PASS | `10-lint-1794829372504.log` |
| 11 | `npm run verify:held-resolutions` | 11:43:44.660 | 0 | PASS | `11-verify-held-resolutions-1794829440360.log` |
| 12 | `npm run verify:second-tab` | 11:45:40.655 | 0 | PASS | `12-verify-second-tab-1794829550265.log` |
| 13 | `npm run verify:second-tab` | 11:45:50.282 | 0 | PASS | `13-verify-second-tab-1794829557466.log` |
| 14 | `npm run verify:second-tab` | 11:45:57.467 | 0 | PASS | `14-verify-second-tab-1794829565054.log` |
| 15 | `npm run verify:reconnect` | 11:46:05.140 | 0 | PASS | `15-verify-reconnect-1794829593294.log` |
| 16 | `npm run verify:reconnect` | 11:46:33.379 | 0 | PASS | `16-verify-reconnect-1794829621505.log` |
| 17 | `npm run verify:reconnect` | 11:47:01.532 | 0 | PASS | `17-verify-reconnect-1794829648472.log` |
| 18 | `npm run verify:reconnect` | 11:47:28.487 | 0 | PASS | `18-verify-reconnect-1794829674898.log` |
| 19 | `npm run verify:reconnect` | 11:47:54.899 | 0 | PASS | `19-verify-reconnect-1794829703209.log` |
| 20 | `npm run typecheck` | 11:48:23.210 | 0 | PASS | `20-typecheck-1794829707430.log` |
| 21 | `npm run lint` | 11:48:27.432 | 0 | PASS | `21-lint-1794829724028.log` |
| 22 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:48:44.029 | 0 | PASS | `22-units-1794829764868.log` |
| 23 | `node --env-file=.env.test.local .local/m4/preserve.mjs` | 11:49:24.870 | 0 | PASS | `23-m4-preserve-1794829765472.log` |
| 24 | `npx --no-install supabase migration up --local` | 11:51:08.641 | 0 | PASS | `24-migrate-local-1794829871986.log` |
| 25 | `npx --no-install supabase db lint --local` | 11:51:11.987 | 0 | PASS | `25-schema-lint-1794829874384.log` |
| 26 | `npm run typecheck` | 11:51:14.494 | 0 | PASS | `26-typecheck-1794829879325.log` |
| 27 | `npm run lint` | 11:51:19.326 | 0 | PASS | `27-lint-1794829896412.log` |
| 28 | `npm run verify:held-resolutions` | 11:51:36.413 | 0 | PASS | `28-verify-held-resolutions-1794829913291.log` |
| 29 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:51:53.299 | 0 | PASS | `29-units-1794829954514.log` |
| 30 | `npm run verify:attendance-integrity` | 11:52:34.516 | 0 | PASS | `30-verify-attendance-integrity-1794829967202.log` |
| 31 | `npm run verify:attendance-review` | 11:52:47.203 | 0 | PASS | `31-verify-attendance-review-1794829986955.log` |
| 32 | `npm run verify:reader-readiness` | 11:53:06.957 | 0 | PASS | `32-verify-reader-readiness-1794830003878.log` |
| 33 | `npm run verify:final-journeys` | 11:53:23.880 | 0 | PASS | `33-verify-final-journeys-1794830039415.log` |
| 34 | `npm run test:rfid:integration` | 11:53:59.417 | 0 | PASS | `34-test-rfid-integration-1794830043542.log` |
| 35 | `npm run test:gateway:local-integration` | 11:54:03.543 | 0 | PASS | `35-test-gateway-local-integration-1794830064563.log` |
| 36 | `npm run verify:staff-localization` | 11:54:24.564 | 0 | PASS | `36-verify-staff-localization-1794830082910.log` |
| 37 | `npm run verify:accessibility-i18n` | 11:54:42.911 | 0 | PASS | `37-verify-accessibility-i18n-1794830090223.log` |
| 38 | `node --env-file=.env.test.local .local/m4/preserve.mjs` | 11:54:50.224 | 0 | PASS | `38-m4-preserve-1794830090575.log` |
| 39 | `npm run typecheck` | 11:56:05.548 | 0 | PASS | `39-typecheck-1794830173237.log` |
| 40 | `npm run lint` | 11:56:13.244 | 0 | PASS | `40-lint-1794830190891.log` |
| 41 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:56:30.892 | 0 | PASS | `41-units-1794830231264.log` |
| 42 | `npm run verify:second-tab` | 11:57:11.609 | 0 | PASS | `42-verify-second-tab-1794830241055.log` |
| 43 | `npm run verify:reconnect` | 11:57:21.056 | 0 | PASS | `43-verify-reconnect-1794830270500.log` |
| 44 | `npm run verify:held-resolutions` | 11:57:50.591 | 0 | PASS | `44-verify-held-resolutions-1794830285868.log` |
| 45 | `node --env-file=.env.test.local .local/m4/integrity.mjs` | 11:58:05.965 | 0 | PASS | `45-m4-integrity-1794830290251.log` |
| 46 | `node --env-file=.env.test.local .local/m4/preserve.mjs` | 11:58:10.261 | 0 | PASS | `46-m4-preserve-1794830290608.log` |
| 47 | `npm run verify:held-resolutions` | 11:59:57.522 | 0 | PASS | `47-verify-held-resolutions-1794830416021.log` |
| 48 | `node --env-file=.env.test.local .local/m4/integrity.mjs` | 12:00:16.023 | 0 | PASS | `48-m4-integrity-1794830419414.log` |
| 49 | `npm run verify:school-operations` | 12:00:28.587 | 0 | PASS | `49-verify-school-operations-1794830473573.log` |
| 50 | `npx --no-install supabase db lint --local` | 12:01:13.628 | 0 | PASS | `50-schema-lint-1794830477093.log` |
| 51 | `npm run build:isolated -- --working-tree` | 12:01:17.121 | 0 | PASS | `51-build-isolated-1794830536354.log` |
| 52 | `node --env-file=.env.test.local .local/m4/preserve.mjs` | 12:02:16.363 | 0 | PASS | `52-m4-preserve-1794830537138.log` |

## Local review and operational handoff

Run only in approved QA with Docker/local Supabase and the guarded server:

```powershell
Set-Location "$env:TEMP\schovera-qa-41c404875fbe43209c457a7763419c3e"
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run dev:rfid-local -- --port 3104
```

For automated held-work review use `npm run verify:held-resolutions`; for the controlled channel gap use `npm run verify:second-tab`. Each owns fictional fixtures and verifies scoped cleanup. Stop the owned 3104 process before `npm run verify:school-operations`, which owns the Next lock/3105. Do not seed/reset the normal school or copy developer environment files.

For a real retained intention, inspect its error, sign in as its original authorized Teacher, load its current comparison, choose a new reviewed register/reason or explicitly close without applying. Never edit SQLite canonical JSON, overwrite a receipt, restore an old revision, force a stale operation or discard an unfamiliar queue. If permission is revoked, request legitimate administrator review. Preserve a consistent database/WAL backup and known-good commit before any separate operational maintenance; no production backup/restore acceptance was performed here.

## Publication and M5 preparation

Implementation commit: **`40704b89b6098c01ae839db84bd84ac6f8368b51`** ? [verified GitHub commit](https://github.com/OmiVibes/Schovera/commit/40704b89b6098c01ae839db84bd84ac6f8368b51). All 25 M4 implementation/test/migration files were pushed to `origin/main`; `git ls-remote origin refs/heads/main` matched that SHA and the independent GitHub connector returned the same commit.

This completion report is published as a separate documentation commit after the verified implementation. Its final remote-main SHA is provided in the completion response/private publication receipt. Only this report is staged for that final commit; the pre-existing documentation edit, `CLAUDE.md` and `review/` remain excluded. No M4 source, migration or test is left local-only. No force-push, empty/fake commit or backdated authorship was used.

M4 is ready for **local software review within these limits**. Remaining gaps: coordinated Excused/reporting/client rollout; compatible lint advisory remediation; authorized delegation when an original Teacher cannot return; operational retention/encryption/backup/restore/key rotation; broader reliability/load/usability and fluent-language acceptance; physical reader/Pi/power/network tests; reviewed hosted architecture/limits/monitoring. No real SMS/calls, public hosting, live student pilot or hardware operation was tested.

Recommended M5 preparation: decide reporting/status/delegation policies, rehearse the tested fictional flow and backup evidence, review the deployment/security/retention plan separately, and plan actual hardware acceptance after the correct components arrive. No M5 code or public deployment is included.
