# M7D — Reliability, security and recovery

18 November 2026. **The narrow late-rejoin correction is implemented; M7D retains unresolved intermittent UI and development-dependency risks.** Actual selected COM7 synthetic acceptance passed after the owner reconnected the board. This is a fictional-school, laptop-local stabilization record, not physical RFID, Raspberry Pi or public-release acceptance. The RC522 remains disconnected.

## Baseline and preservation

Fetched `main` and `origin/main` matched `5063f855f4a85b8cfdc763cc6f0d8adcff10e62e` before editing. The M6–M7C reports, actual subscription/reconciliation code, installed Supabase channel implementation, USB framing/ownership, trusted capture, immutable signed v2 contract, WAL/FULL SQLite ingress, worker recovery and destination-receipt verification were inspected. The installed Next client-directive guide was read before changing the client hook.

The existing approved checkout is `%TEMP%\schovera-m7a-qa-b5bad848`, with its retained local-only configuration, local Supabase `127.0.0.1:54321` and QA web origin `http://127.0.0.1:3106`. The older competition checkout and its user-owned rehearsal are separate and are not cleaned or adopted. No developer `.env.local` content was opened, copied, renamed, modified, deleted or hashed. No migrations, firmware, dependency versions, attendance contracts, RFID contracts or authorization policies are changed by M7D.

Initial unrelated work is preserved and excluded: the edit to `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, untracked `CLAUDE.md` and `review/`. Tracked-file SHA-256 values were captured before edits; the fresh protected-school baseline covers 20 datasets. Checks use only newly owned fictional fixtures, never a blanket reset or school-data cleanup.

Private, Git-ignored evidence **E** is `.local/schovera-manual-demo/m7d-20261118/`. It retains the command ledger, redacted logs, before-file hashes, dependency metadata, diagnostic probe and integrity results. Known approved QA credentials are redacted; production secrets are never read for comparison. Evidence hashes establish identity, not correctness.

## Reconnect: confirmed narrow fix and remaining uncertainty

The hook's original `scheduleRecovery` returned immediately whenever its existing five-second recovery window was active. The last retry starts at 4,500ms. If that read finishes and a new successful channel join then occurs before 5,000ms, the join gets no new query, despite an intervening missed update. Clearing the window later does not itself read the database. This is a deterministic gap in successful-rejoin recovery.

`src/lib/use-realtime-resync.ts` now always requests the existing coalesced reconciliation on a recovery signal. Only creation of the finite retry timers is suppressed by an already active window. The 80ms coalescing delay, retry schedule, query authorization, current-context/stale-response guards and unsubscribe behavior are unchanged. This adds no periodic background polling, timeout increase, artificial delay or new endpoint.

The new test in `src/lib/use-realtime-resync.test.tsx` runs the shipped hook with a controlled clock: finish its four reads by 4,700ms; change persisted state during an interruption; deliver `CHANNEL_ERROR` followed by `SUBSCRIBED` while the first window remains active. **Before: FAIL, stale value 0 instead of 1, three existing tests pass. After: all four pass; the fifth read observes 1 and advancing another 60 seconds produces no further reads.** Existing assertions are unchanged.

This does **not establish the root cause of the historical second-tab timeout**. Four sequential baseline executions of the complete reconnect harness passed before the product edit. Each preserved all original assertions and per-action 15/20-second deadlines; an additional 150-second browser-close bound triggers the existing scoped cleanup. The probe records at most 800 non-sensitive frame/read/error metadata entries, not frame bodies, tokens, emails, student names or message text. It observes both Parent sessions rather than only the first. A passing stress sample is not proof of absence of an intermittent defect.

Four subsequent runs on the corrected hook also passed: **baseline 4/4, corrected 4/4; historical timeout reproduction 0/8**. Baseline durations were 40.5–46.2 seconds; corrected durations were 44.5–55.7 seconds. All completed inside the same 150-second bound, without page errors or deadline termination. These are local execution durations, not performance guarantees. The unchanged deterministic initial-query/subscription-gap browser check is separate from this stress sample and the new late-rejoin unit regression.

Channel-name reuse/removal and the harness's broad successful-WebSocket-reply readiness condition were reviewed as other hypotheses. The baseline traces show channel churn and successful joins without a callback-registration page error; neither hypothesis was established as the historical cause. No speculative channel rewrite or weaker readiness assertion was made. Historical failures in earlier reports remain failures.

## Dependency security: upstream blocker, unchanged lockfile

Fresh audits on the unchanged lockfile:

| Graph | Critical | High | Moderate | Total package entries | Exit |
|---|---:|---:|---:|---:|---:|
| Production (`--omit=dev`) | 0 | 0 | 0 | 0 | 0 |
| Full development/runtime | 0 | 18 | 0 | 18 | 1 |

The entries propagate from [picomatch GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), a repeated-extglob denial of service. The primary advisory, updated 17 November and checked 18 November, covers versions through 4.0.7 and lists no patched version. A fresh official npm registry query also lists 4.0.7 as latest and no later published release. The 18 entries are affected packages/dependants, not 18 distinct vulnerabilities or reproduced application exploits.

Inspected installed paths and supported ranges:

| Path | Installed matcher / range |
|---|---|
| `eslint-config-next@16.4.5 → @next/eslint-plugin-next@16.4.5 → fast-glob@3.3.1 → micromatch@4.0.8 → picomatch` | 2.3.2; micromatch requests `^2.3.1` |
| `vitest@4.1.12 → picomatch` | 4.0.7; Vitest requests `^4.0.3` |
| `vitest → tinyglobby@0.2.17 → picomatch` | 4.0.7 |
| `@vitejs/plugin-react@5.2.0 → vite@7.3.7 → picomatch` | 4.0.7; existing Vite override retained |
| `tinyglobby / vite → fdir@6.5.0 → picomatch` | 4.0.7; fdir accepts `^3 || ^4` |

The audit also propagates entries through TypeScript-ESLint, its import resolver, the Next lint configuration and Vitest mocker. Its suggested older Next lint/Vitest major versions do not establish a patched matcher or a compatible security upgrade. No `audit fix`, forced override, unsupported downgrade, suppression or speculative lockfile churn is used. **Full-audit remediation is blocked by the lack of a published patched matcher; the full audit remains failed.** Production-graph zero does not certify hosted security. No request-facing attacker-controlled glob was introduced, and no exploit was attempted.

Next/eslint-config-next 16.4.5, Zod 4.6.6 and sharp 0.35.5 remain the M6-reviewed versions. Node 22.18.0 satisfies the installed toolchain; the gateway still requires Node 22.13+. Existing ESLint 9 support status remains a separate migration consideration. No package installation is needed for this two-file correction.

## Gateway and USB verification boundary

The existing acquisition, queue and transport remain unchanged. Capture acknowledgement means a matching committed local SQLite row, destination confirmation requires independently matched v2 receipt and gate evidence, and classroom finalization requires the Teacher's separate authorized action. None implies physical presence or real recipient delivery.

Existing focused tests cover process termination before/after commit, reopen and exact receipt recovery, lost acknowledgements, concurrent duplicate/conflict handling, worker ownership, bounded capacity, expired authorization, revoked reader, malformed/foreign input, secret-safe diagnostics and safe explicit port reselection. These are host/software fault tests; simulated disconnect/renumbering is not physical unplug or board power-loss evidence.

The owner explicitly approved the selected COM7 synthetic test for M7D, confirming UNO R4 WiFi, closed Serial Monitor/Plotter and disconnected RC522. The acceptance rechecks the exact descriptor before opening. It may issue STATUS, ARM, RETRY and matching release **only after reading the committed receipt**. It must retain an uncertain pending observation rather than silently clear or replace it. No upload, wiring or physical disconnect is part of that approval.

The first physical attempt failed the descriptor-presence preflight because the UNO was absent. No port opened, fixture was created or command was issued. The owner chose to reconnect the same UNO. Fresh discovery through the shipped Windows serial worker then matched the approved COM7 descriptor, and the unchanged physical acceptance passed. An initial read-only discovery invocation in the private runner omitted the required synthetic-mode flag and was refused before discovery; supplying that flag fixed the runner invocation, not the product guard.

**Observed actual USB:** selected-port open, STATUS, host-authorized synthetic ARM bytes, committed local receipt, same-ID RETRY with the same receipt, competing-worker refusal, and explicit matching release after receipt verification. The same run then reopened the host queue in another process, injected destination outage and one lost response after actual authorized acceptance, replayed immutable bytes, verified one destination gate/receipt, tested signatures/revocation and drove all three mobile portals. Teacher review did not change attendance; draft remained hidden from Parent; separate Teacher finalization produced one traceable register revision and exact Principal totals. Its owned fixture was cleaned. No real RFID scan, upload or controlled physical unplug/power-loss test occurred.

The software-Serial acceptance passed separately. The existing M7C verifier is reused unchanged; its `M7C acceptance evidence` log prefix identifies the script, not an old M7D result. Fresh private captures/results are under QA `.local/m7c-acceptance-64b70c38-f160-4814-ae8a-8bf2e50ad9d4/` for actual USB and `.local/m7c-acceptance-2e7ae69b-2e54-4c74-b4e5-5f38ef286db9/` for simulated Serial. The actual-USB Parent capture was visually inspected; automated role/overflow assertions are separate evidence, not a review of every page/pixel.

### Additional intermittent Principal pagination failure

The first `verify:principal-communication` execution passed the SQL/JavaScript/UI count boundaries through 2,005 rows, the 2,007-row correction/acknowledgement dataset, translation-state invariance and school isolation. It then timed out at line 91 waiting for **80 cards after Load more**, after the initial 40-card assertion passed. The exact unchanged command subsequently passed the complete suite, including pagination, reconnect/error recovery and mobile assertions. No assertion, timeout, Principal implementation or database aggregate was changed.

Overlapping automatic refresh and append requests were inspected as a possible explanation: the hook's generation protection can discard an older append when a newer refresh starts. The failed run did not capture sufficient request ordering to establish that as its cause. **The pagination timing failure remains unresolved, not fixed by a successful rerun.** The correct aggregate counts do not prove pagination reliability. Both scoped fixture cleanups passed. The historical second-tab timeout is a separate unresolved observation.

## Safe Windows verification commands

Use the approved isolated checkout with its existing test configuration and running local Supabase. Never copy the developer environment file. Check for an already running server first; do not start a second Next development process in the same checkout or stop an unfamiliar process.

```powershell
Set-Location "$env:TEMP\schovera-m7a-qa-b5bad848"
# Only if this checkout's development server is stopped:
npm run dev:rfid-local -- --port 3106
```

In a second terminal, from the same QA checkout:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3106'
$env:SCHOVERA_ARDUINO_TEST_MODE = 'synthetic'
npm run verify:second-tab
npm run verify:reconnect
npm run verify:arduino-gateway
```

The last command uses explicitly simulated Serial with actual durable/local destination operations. For physical USB, first reconfirm the selected UNO, closed Serial Monitor/Plotter and disconnected RC522. List ports without opening one, then supply its **current exact** descriptor; do not assume a renumbered COM port is the same device:

```powershell
npm run arduino:gateway -- list
npm run verify:arduino-gateway -- --usb --port COM7 --confirm-pnp-id '<current exact PnP ID>'
```

These verifiers refuse an existing manual fixture rather than adopting it. If a previous test retains pending firmware/queue work, preserve its private ownership journal and original acquisition identity for reviewed recovery; do not run blanket cleanup, silently CLEAR, reassign or create a replacement ARM.

`npm run verify:school-operations` needs exclusive use of this checkout's Next development lock and owns port 3105, including its restart. Stop only a known/approved development server before running it, then restore the normal server. Root compilation uses `npm run build:isolated -- --working-tree` from the developer repository; do not run raw `next build` there. Full/production audit commands are separately listed in the execution ledger.

## Remaining boundaries and next action

The deterministic late-rejoin gap is corrected; the historical intermittent second-tab timeout is still unconfirmed. Continue a timed fictional rehearsal and retain bounded metadata if it recurs, rather than treating eight passing runs as a general reliability certificate. Full dependency remediation remains blocked on a supported patched picomatch release; recheck the advisory and compatible parent ranges before changing the lockfile.

Arduino pending acquisition is RAM-only. Host SQLite durability does not establish board power-loss safety, authentic physical card identity, RC522 scan quality or Pi storage behavior. Serial framing/port-conflict/disconnect/renumbering tests are labelled software simulations unless the execution record explicitly says actual selected USB. No firmware upload, RFID wiring, physical unplug, real notifications, hosted service or real-school enrollment belongs to this phase.

The recommended next competition action is a supervised local rehearsal with exact recovery explanations and human audio/language review, while tracking the unresolved dependency and intermittent-reconnect risks. M7D does not automatically start M8 or authorize physical RFID acceptance.

## Executed recovery and regression results

| Area | Actual result and limits |
|---|---|
| Hook regression and existing units | **425 tests in 51 files PASS**; one new late-rejoin regression, existing 424 retained. The earlier focused before-fix failure remains recorded. |
| Host capture crash/reopen | **PASS** in existing focused unit tests: separate child processes terminate before and after SQLite commit; reopen sees zero or one row respectively, then recovers the exact committed receipt. This is process failure, not physical power-loss acceptance. |
| Gateway outage/lost response/replay | **PASS** in simulated-Serial and actual-USB acceptance, connected journey and gateway integration: actual local persistence and authorized destination commit, adapter-injected outage/lost reply, unchanged identity/hash/time, one gate/receipt, no duplicate classroom record. |
| Ownership/backpressure/expired or revoked scope | **PASS**: competing-worker refusal, configured queue-capacity refusal, transaction/acknowledgement fault injection, expired/new-work denial, reader/assignment revocation and retained unresolved attention. No full physical disk was filled. |
| Serial operator recovery | **PASS** software simulations: malformed/oversize/foreign bytes, fake exclusive-port denial, disconnect, partial-buffer reset and renumbering require explicit selection; no silent CLEAR/new ARM. **Actual selected USB acceptance PASS** separately after owner reconnection. |
| M1 attendance integrity | **PASS**: drafts/finalization, parent final-only reads, corrections/reasons/history, concurrent revisions, legacy envelope/restart/replay and role/school/session denial. |
| M2/M3/M4 review and reconciliation | **PASS**: separate gate evidence, manual fallback, exact >1,000 totals, staff review without attendance mutation, stale-review race, revoked/unresolved evidence, immutable held-work resolutions and mobile role views. |
| AUD-01 communication | **FAIL then unchanged PASS**; totals through 2,007 were correct in both. First browser pagination timeout remains unresolved; see above. |
| Connected three-portal journey | **PASS**: Teacher send, Principal approval, Parent original/approved translation playback and acknowledgement, profile/homework/timetable, missed-event recovery and safe logout/context handling. Media progress does not certify fluent speech or physical speaker quality. |
| RFID v2 and gateway integration | **Two Vitest integration scenario tests PASS** in addition to the 425 non-integration tests, with scoped role/tenant denial and restart/replay. Their many assertions are not extra independent test totals. |
| Translation/announcements/homework | **PASS**: originals, approval/version/role protection, Principal-only school publication, create/retry/conflict/authorized visibility. No real SMS/call or live AI generation test is claimed here. |
| TypeScript / lint / database schema lint | **PASS**, unchanged rules; **48 migrations** remain recorded and migration files unchanged. |
| Isolated build | **PASS** with Next 16.4.5, TypeScript and all expected routes; generated `.env.production` only, private sentinels absent, stable inputs and exact temporary-snapshot cleanup. |
| Data and source preservation | **PASS**: all 20 protected-school dataset hashes unchanged; 298 executable/source/config QA copies match; package/lock, firmware, migrations and unrelated tracked values match their baseline hashes. Owned manual fixture absent after cleanup. |

Build source SHA-256: `10cc7ff0a7fd9745f277d7f64f8130329c9c6d5063765109d1ac22a5fdfde750`, **242 approved files**. Only `fonts.googleapis.com` and `fonts.gstatic.com` were observed through the limited build proxy; it is not an OS network sandbox. This verified the working tree later committed, not a hosted deployment.

The bounded competition smoke consists of fresh owned actual/simulated USB acceptance, connected role workflows and the school-operation restart/replay check. **`verify:competition` was not run:** it targets the different older checkout with a retained user-owned competition rehearsal. That rehearsal/backup was not adopted, discarded or certified anew. No new presentation video or complete screenshot ZIP was created.

### Server restoration and cleanup

The first M7D launcher was no longer the active server when ownership was checked: port 3106 was running from a VS Code terminal. The owner separately approved stopping/restarting only that QA web server. Its exact PID, command and creation time were checked before stopping its child tree; VS Code, Docker and other processes were left alone. `verify:school-operations` then owned port 3105 and performed real process restart with three durable pending operations, authorized automatic replay, conflict holds and scoped cleanup.

The guarded QA server was restored hidden on **`http://127.0.0.1:3106`**, returned HTTP 200, and the three-role navigation/session/context checks passed again after restart. It is intentionally left running for the owner. Docker remains running; no Ollama service/model was installed or started by M7D. The owned test fixtures, temporary queues and isolated build snapshot were cleaned; private evidence, existing QA configuration/key material, unrelated files and older user rehearsal remain retained.

### Failures retained

Five acceptance executions exited nonzero: the non-green full dependency audit; the intended before-fix late-rejoin regression; Principal Load more timeout; absent-board USB preflight; and the private discovery runner's missing synthetic flag. Only the deterministic late-rejoin defect was corrected in application code. The latter two setup conditions were corrected and rerun without changing product guards. The pagination rerun passed without a fix and does not close that risk.

Preliminary inspection errors were separate from acceptance: a guessed Next documentation suffix/path was absent; a PowerShell literal-glob source lookup failed; one server-log read used the QA-relative rather than root evidence path; and an assumed root `fdir/package.json` was absent because fdir is nested. Exact discovered paths were then used, metadata completed, and no application/test assertion was changed for those reads. They are not hidden product passes.

## Files and review status

M7D changes exactly three files:

- `src/lib/use-realtime-resync.ts`: reconcile each recovery signal while sharing only finite retry timers.
- `src/lib/use-realtime-resync.test.tsx`: deterministic failing-before/passing-after late-rejoin test.
- `docs/70_M7D_RELIABILITY_SECURITY_AND_RECOVERY.md`: this executed report and handoff.

**Ready for review as a scoped local stabilization checkpoint, with explicit open risks.** It is not an all-green release: the full development audit, historical second-tab uncertainty and observed pagination timing failure remain open. No M8, hardware wiring, Pi, public deployment or real-school operation was begun.

## Git scope

Only the three M7D files listed above belong to this checkpoint. The pre-existing doc 45 edit, `CLAUDE.md` and `review/` remain outside it. Private environment files, account/enrollment material, firmware/issuer keys, SQLite databases, raw serial captures, test logs and screenshots are excluded. The staged source receives a diff/credential/artifact review before normal commit/push to `origin/main`; no force-push, reset, stash, broad staging or branch-protection bypass is authorized. Publication evidence follows after remote verification.


## Full execution ledger

**44 recorded executions: 39 PASS, 5 FAIL.** All times below are UTC on 18 November 2026 (IST = UTC +05:30). The private ledger retains end times and working directories. Rows preserve completion order; independent metadata/schema reads overlapped other checks, while school-fixture mutations stayed sequential. Repeated runs are not independent coverage totals. All commands use QA except the root isolated build. USB rows abbreviate only the owner-confirmed Windows instance descriptor; the archived runner/native inventory retain the exact argument and the live guard requires an exact match.

| # | Command | UTC start | Exit | Result | Log relative to E |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m7d/preserve.mjs` | 07:41:06.345 | 0 | PASS | `01-m7d-preserve-1794987667317.log` |
| 2 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 07:41:07.429 | 0 | PASS | `02-audit-production-1794987670004.log` |
| 3 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 07:41:10.185 | 1 | FAIL | `03-audit-dependencies-1794987673674.log` |
| 4 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:33:29.986 | 0 | PASS | `04-reconnect-probe-1794998056023.log` |
| 5 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:34:16.252 | 0 | PASS | `05-reconnect-probe-1794998096805.log` |
| 6 | `node node_modules/vitest/vitest.mjs run src/lib/use-realtime-resync.test.tsx` | 10:35:18.529 | 1 | FAIL | `06-test-resync-1794998131617.log` |
| 7 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:34:56.992 | 0 | PASS | `07-reconnect-probe-1794998137812.log` |
| 8 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:35:37.902 | 0 | PASS | `08-reconnect-probe-1794998178264.log` |
| 9 | `node node_modules/vitest/vitest.mjs run src/lib/use-realtime-resync.test.tsx` | 10:36:39.087 | 0 | PASS | `09-test-resync-1794998207374.log` |
| 10 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 10:36:47.471 | 0 | PASS | `10-units-1794998306672.log` |
| 11 | `npm run typecheck` | 10:38:26.824 | 0 | PASS | `11-typecheck-1794998326955.log` |
| 12 | `npm explain picomatch --json` | 10:39:18.386 | 0 | PASS | `12-metadata-picomatch-1794998371761.log` |
| 13 | `npx --no-install supabase db lint --local` | 10:39:31.964 | 0 | PASS | `13-schema-lint-1794998381560.log` |
| 14 | `npm run lint` | 10:38:47.090 | 0 | PASS | `14-lint-1794998381805.log` |
| 15 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:39:41.905 | 0 | PASS | `15-reconnect-probe-1794998437360.log` |
| 16 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:40:37.611 | 0 | PASS | `16-reconnect-probe-1794998481918.log` |
| 17 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:41:22.114 | 0 | PASS | `17-reconnect-probe-1794998530225.log` |
| 18 | `node --env-file=.env.test.local scripts/.m7d-reconnect.mjs (unchanged assertions; 150-second bound; metadata only)` | 10:42:10.480 | 0 | PASS | `18-reconnect-probe-1794998579090.log` |
| 19 | `npm run verify:second-tab` | 10:42:59.233 | 0 | PASS | `19-verify-second-tab-1794998602153.log` |
| 20 | `npm run verify:attendance-integrity` | 10:43:22.377 | 0 | PASS | `20-verify-attendance-integrity-1794998631727.log` |
| 21 | `npm run verify:attendance-review` | 10:43:51.862 | 0 | PASS | `21-verify-attendance-review-1794998684777.log` |
| 22 | `npm run verify:attendance` | 10:44:44.991 | 0 | PASS | `22-verify-attendance-1794998693280.log` |
| 23 | `npm run verify:held-resolutions` | 10:44:53.441 | 0 | PASS | `23-verify-held-resolutions-1794998716016.log` |
| 24 | `npm run verify:reader-readiness` | 10:45:16.146 | 0 | PASS | `24-verify-reader-readiness-1794998763431.log` |
| 25 | `npm run verify:principal-communication` | 10:46:03.676 | 1 | FAIL | `25-verify-principal-communication-1794998855700.log` |
| 26 | `npm run verify:arduino-gateway` | 10:47:36.172 | 0 | PASS | `26-verify-arduino-gateway-1794998877701.log` |
| 27 | `npm run verify:arduino-gateway -- --usb --port COM7 --confirm-pnp-id <owner-confirmed descriptor, private ledger>` | 10:47:57.843 | 1 | FAIL | `27-verify-arduino-gateway-usb-1794998879664.log` |
| 28 | `npm run verify:principal-communication` | 10:48:25.015 | 0 | PASS | `28-verify-principal-communication-1794998936663.log` |
| 29 | `npm run verify:final-journeys` | 10:48:56.719 | 0 | PASS | `29-verify-final-journeys-1794998973380.log` |
| 30 | `npm run verify:role-navigation` | 10:49:33.439 | 0 | PASS | `30-verify-role-navigation-1794998992434.log` |
| 31 | `npm run test:rfid:integration` | 10:49:52.473 | 0 | PASS | `31-test-rfid-integration-1794998997137.log` |
| 32 | `npm run test:gateway:local-integration` | 10:49:57.171 | 0 | PASS | `32-test-gateway-local-integration-1794999019175.log` |
| 33 | `npm run test:translations:db` | 10:50:19.211 | 0 | PASS | `33-test-translations-db-1794999022051.log` |
| 34 | `npm run verify:announcements` | 10:50:22.088 | 0 | PASS | `34-verify-announcements-1794999023136.log` |
| 35 | `npm run verify:assignments` | 10:50:23.170 | 0 | PASS | `35-verify-assignments-1794999024182.log` |
| 36 | `node --env-file=.env.test.local .local/m7d/preserve.mjs` | 10:50:24.217 | 0 | PASS | `36-m7d-preserve-1794999024676.log` |
| 37 | `npm run arduino:gateway -- list (read-only descriptor discovery)` | 10:51:02.445 | 1 | FAIL | `37-metadata-serial-1794999063191.log` |
| 38 | `npm run arduino:gateway -- list (read-only descriptor discovery)` | 10:51:10.352 | 0 | PASS | `38-metadata-serial-1794999071542.log` |
| 39 | `npm run verify:arduino-gateway -- --usb --port COM7 --confirm-pnp-id <owner-confirmed descriptor, private ledger>` | 10:51:15.781 | 0 | PASS | `39-verify-arduino-gateway-usb-1794999097766.log` |
| 40 | `npm run verify:school-operations` | 10:52:07.716 | 0 | PASS | `40-verify-school-operations-1794999165111.log` |
| 41 | `npm run build:isolated -- --working-tree` | 10:52:45.183 | 0 | PASS | `41-build-isolated-1794999235345.log` |
| 42 | `node --env-file=.env.test.local .local/m7d/preserve.mjs` | 10:53:55.401 | 0 | PASS | `42-m7d-preserve-1794999236283.log` |
| 43 | `npm run verify:role-navigation` | 10:54:46.748 | 0 | PASS | `43-verify-role-navigation-1794999308967.log` |
| 44 | `node --env-file=.env.test.local .local/m7d/preserve.mjs` | 10:55:09.157 | 0 | PASS | `44-m7d-preserve-1794999309590.log` |

Additional read-only checks: Git status/fetch/remote SHA; native Windows descriptor inventory; `docker exec supabase_db_Schovera psql -U postgres -d postgres -At -c "SELECT count(*) FROM supabase_migrations.schema_migrations"` returned 48; official registry metadata/latest and `npm ls picomatch --all`; `node .local/schovera-manual-demo/m7d-20261118/integrity.mjs` exited 0 (298 QA matches); restored HTTP readiness returned 200; scoped process identity/stop/start, source diff and credential/artifact review. No compilation/upload or controlled physical unplug test was executed.
