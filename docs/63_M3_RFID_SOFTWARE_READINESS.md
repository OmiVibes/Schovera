# M3 — RFID software integration and reconciliation readiness

16 November 2026. Baseline: M2 `fc76b387db11f6536fe70d606135aa9682070170`, verified against `origin/main` before editing. **Software mock-to-gateway integration is implemented; physical RFID/Pi integration remains unverified.** This is local synthetic acceptance, not a school pilot, public deployment or hardware certificate. M4 is not implemented.

## Baseline audit and scope

M1 and M2 reports, v2 envelopes/capabilities, local device routes, enrollment, gateway ingress/storage/transport, school-operation queues, reconciliation migrations, rehearsal CLI and existing tests were inspected. The existing stack already authenticated ingress, retained canonical events in SQLite and delivered signed v2 requests. The identified gap was that M2's attendance rehearsal bypassed the durable gateway and sent directly to the local API. It also lacked a shared acquisition boundary and useful rehearsal-specific operator diagnostics.

M3 reuses those working contracts. There is no competing queue, new dependency, schema migration, attendance-status expansion, classroom write rule, UI redesign or browser telemetry endpoint. The 46 existing migrations, M1/M2 application implementation, school-operation canonical envelopes, gateway storage/signature/delivery implementation, privileged launchers and dependency lockfile remain unchanged. The existing unrelated edit to `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, `CLAUDE.md` and `review/` are preserved and excluded.

## Before and after architecture

Before: `attendance:demo` generated/cached a v2 event and called the API transport directly. General gateway tests separately exercised the durable path.

After: `MockReaderAdapter.read()` → acquisition mapping → existing authenticated reader ingress → existing SQLite WAL/FULL transaction → separate-process reopen/retry → existing Ed25519 v2 transport → local API verification → PostgreSQL event/receipt → existing Teacher evidence review → **separate explicit Teacher classroom finalization** → authorized Parent confirmation. No gate step creates classroom attendance.

The reusable boundary also defines an unconfigured physical-driver placeholder. It explicitly reports `reader_not_configured` and refuses reads. No GPIO pins, voltage, RC522 wiring, Arduino/Pi bus, serial protocol, device path or board compatibility is assumed.

## Adapter and event contract

`read()` returns exactly `{acquisitionId, sequence, observedAt, eventType}` or a typed unavailable error. The source must retain a stable UUID acquisition ID, positive monotonic sequence, original explicit ISO timestamp with offset and event type until durable local acknowledgement. Retrying a physical observation must retain **all** fields. Assigning a new UUID means a separate event; it is not retry deduplication. A future source must persist its sequence across restart and never reset it under an existing enrollment.

Reviewed enrollment supplies reader/device identity, reader authentication material and the exact credential assignment evidence. The adapter does not translate raw card UIDs into guessed student identities. Missing/unrecognized enrollment must not produce a named event. Secure acquisition-to-enrollment mapping is part of future driver/provisioning acceptance.

| Concept | Source and behavior |
|---|---|
| Event identity | Acquisition UUID becomes the unchanged v2 `event_id`; exact event/hash replay returns the existing receipt |
| Reader identity | Existing registered gateway `reader_id`, matched to device ID; existing HMAC authenticates capture |
| Assignment evidence | Existing opaque credential reference, assignment ID/version and signed capability; server revalidates binding/current authorization |
| Sequence | Acquisition's device sequence; existing reader/device uniqueness, gap/out-of-order and replay checks remain |
| Scan time | Original `observed_at`, preserved exactly; missing/invalid time is rejected, never replaced with now/receipt time |
| Gateway time | Actual durable local `local_received_at`, local receipt ID, clock-skew/quality metadata |
| Delivery | Existing pending/syncing/delivered/attention states and bounded retry; local capture is not destination delivery |
| Destination time | Server `received_at` and matching remote receipt retained separately from scan/local time |

Existing canonical serialization, signatures, nonce handling and immutable hashes are unchanged. First adoption of a dated M2 rehearsal's cached event reuses its exact original event/time; it does not reuse an old ID with a new timestamp. The old cache is not overwritten. The optional v2 gateway-receipt field is not retroactively injected into an already canonical event.

Clock skew beyond the existing five-minute ingress/server tolerance produces uncertainty; M2's ten-minute delayed-receipt flag is a review prompt, not a bell-time/lateness policy. Unknown/invalid timestamps cannot fabricate a school-day mark. Diagnostics additionally flag a server receipt earlier than local capture without rewriting either timestamp. A clock disagreement alone does not establish which clock is correct. A prior destination receipt can also legitimately predate first adoption of an already-delivered M2 cache into the queue; the diagnostic is a review signal, not proof that either timestamp is false. A valid unresolved receipt is retained in attention; it is never silently attributed to a replacement student. Unsupported schemas/signatures are rejected or retained for attention by existing boundaries; no insecure fallback was added.

SQLite still uses schema version 2 and the existing restart recovery for interrupted syncing. Existing maximum retained capacity (10,000), bounded delivery batch (10), retry/backoff and attention behavior are retained. The operator must not run competing delivery/open-recovery workers against one live database: existing open-time interrupted-sync recovery is not a distributed multi-worker lease. The rehearsal's commands are sequential, short-lived processes. Physical power-loss, flash wear, disk-full and Pi storage behavior remain untested.

## Operator diagnostics

`attendance:demo inspect` reports only minimized local diagnostics: reader configuration/revocation, mock configured but not running, web reachability, pending/syncing/delivered/attention counts, oldest pending age, last capture, last successful local sync, last server receipt, unresolved receipts, inconsistent receipt-time count and error classes. It does not print canonical payloads, card references, capabilities, reader secrets or signing keys. These operator diagnostics are not exposed to browser roles.

An active mock is labelled only while its command is running. `reader-offline` is an **explicit mock fault**, not a physical disconnect test. An absent physical implementation is `reader_not_configured`; there is no hardware heartbeat from which to infer a physical connection/offline state. An unavailable web origin is `service_unavailable`; HTTP reachability alone does not prove database, device authorization or delivery health. Pending work older than 60 seconds is labelled sync delayed. Accepted delivery and unresolved attention remain distinct.

## Supported rehearsal commands

Run only in the approved isolated QA checkout, with its retained local test configuration and loopback Supabase. The owned fictional rehearsal has its own `reader-gateway.sqlite` under its guarded run directory, using the existing gateway implementation. It does not touch another gateway database or school-operation queue. Preparation refuses an unfamiliar existing rehearsal journal; no automatic replacement/seed/reset occurs.

```powershell
Set-Location "$env:TEMP\schovera-qa-41c404875fbe43209c457a7763419c3e"
# Docker/local Supabase must already be running.
npm run dev:rfid-local -- --port 3104
```

In another QA terminal:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run attendance:demo -- prepare
npm run demo:credentials   # Read privately; never publish this output.
npm run attendance:demo -- inspect
npm run attendance:demo -- scan
npm run attendance:demo -- duplicate
npm run attendance:demo -- offline
npm run attendance:demo -- inspect
npm run attendance:demo -- sync
```

`offline` captures through real SQLite and injects a transport outage without making a destination request. The next `sync` is a separate process and genuinely delivers pending work to local Supabase. Neither command disconnects Wi-Fi/WAN or proves remote-cloud replication. The local app and database must remain reachable; this is not an offline browser/PWA or physical LAN test.

Optional commands: `separate`, `delayed`, `gap`, `out_of_order`, `reader-offline`, `unknown`, `revoke-card`, `revoked`, `revoke-device`, `device_revoked`, `revoke-reader`. Order matters: perform normal/manual classroom demonstration before revocation. Repeating a scenario reuses its cached acquisition. Deliberate gap/out-of-order scenarios can flag earlier sequence choices; they do not reorder evidence. The normal delayed scenario retains an original time twenty minutes earlier.

`unknown` deliberately supplies a mismatched opaque credential reference with the original capability, so binding validation rejects it into local attention. It does **not** pretend that arbitrary unknown cards can create authenticated named events. `revoke-card` followed by `revoked` demonstrates a genuine server unresolved receipt with no new named gate event; `revoke-device` blocks remote delivery; `revoke-reader` blocks new local ingress. These affect only the owned synthetic enrollment. Already committed work is not erased or falsely reassigned.

Clean only the owned journaled rehearsal:

```powershell
npm run attendance:demo -- clean
# If pending/attention remains, inspect it first. To deliberately discard ONLY
# this fictional rehearsal and its retained evidence:
npm run attendance:demo -- clean --discard-pending
```

The first command refuses to discard pending/attention evidence. The explicit second command is for this owned fictional fixture only; never use it to discard real operational evidence or an unfamiliar journal.

For Arohi: use separate Teacher/Parent sessions at `http://127.0.0.1:3104`, Grade 8A and today's date. Show the scan flag, explicitly finalize the classroom register, select **Synthetic Child A** in Parent attendance and show the saved status. **Synthetic Manual Fallback** has no card scan and remains manually markable. Existing M2 staff review can document that check without exposing the private explanation to Parent.

Approximately 30–45 seconds:

> Our reader is simulated today. It gives each scan a fixed identity and records the original time. The school gateway saves it on disk before confirming receipt. If the connection fails, the same saved event waits and retries after restart, so one replay does not become another scan. Schovera shows the teacher evidence that needs checking. The teacher separately confirms classroom attendance; a scan alone never marks a child Present. A forgotten card still allows manual attendance. Physical reader wiring, power and Raspberry Pi tests are the next hardware step.

Backup without hardware/external internet: rehearse with the running laptop-local app/Supabase and these mock commands; no cloud AI is required. Retain private synthetic captures from the acceptance verifier if live startup fails, and explain they are recorded software evidence. Offline capture still requires the local school/gateway service; a stopped local service cannot acknowledge a new save. Do not present screenshots as a live hardware tap or recorded delivery as current recipient receipt.

## Future Raspberry Pi handoff checklist

1. **Prerequisites, not yet verified:** exact Pi model/64-bit OS, suitable rated power supply, storage quality/free space, reader/board/firmware model, logic voltage and isolation, wiring, communications bus/protocol and trusted time source. Confirm electrical details against the actual components before connecting them. No RC522-to-Pi or Arduino-to-Pi method has been certified here.
2. **Process responsibilities:** physical acquisition driver owns durable acquisition identity/sequence and explicit timestamp; reviewed enrollment resolves assignment evidence; the gateway authenticates capture, commits SQLite and signs delivery; destination validates signatures/capabilities and persists receipts; Teacher retains classroom finalization authority. Keep acquisition, queue delivery and classroom write responsibilities separate.
3. **Install only after hardware/OS approval:** clone the verified commit, install the unchanged lockfile with the reviewed local installation procedure (`npm ci` in the authorized setup), and verify `node --version`. Gateway use requires Node 22.13+ with SQLite; this run used Node 22.18.0 on Windows. ARM/native dependency installation and a complete Pi app/database runtime were **not tested**. Do not copy the laptop developer `.env.local` or a live database into a new device.
4. **Provision identities through reviewed administration:** establish device public key and a separate private Ed25519 device key, register the reader HMAC identity/device binding, issue assignment-specific capabilities with the correct scope/version/expiry, restrict filesystem access and plan revocation/rotation. The gateway must not receive a Supabase service key or capability issuer private key. The fictional enrollment file is not a production provisioning method. Never paste keys into CLI arguments, browser code, logs or reports.
5. **Implement the real driver boundary:** implement the documented `read()`/`status()` interface, reject unknown acquisitions safely, persist sequence/identity until acknowledgement, use the existing `captureAcquisition` ingress and v2 transport. Supply no guessed student identity, default scan timestamp or insecure UID HTTP request. Bench-test reader absence, malformed/truncated input, duplicate hardware reads and driver reconnect before claiming connected health.
6. **Network/startup constraint:** shipped transport and privileged routes deliberately permit loopback only. Current QA startup is `npm run dev:rfid-local -- --port 3104`; it is a guarded laptop test launcher, **not** a Pi service installer. A Pi gateway sending to a different laptop/host requires a separately reviewed HTTPS/authenticated transport and ingress boundary; do not remove Host/Origin/loopback checks, tunnel the dev server or expose Ollama. An all-on-Pi local stack also requires new capacity/runtime acceptance. Production startup/service manager, least privilege and restart ordering are unimplemented until that architecture is selected.
7. **Acceptance on actual hardware:** prove a tap maps to the intended enrollment, signed immutable event and database receipt; verify separate taps versus one replay, reboot/process crash, cable/Wi-Fi loss, blocked destination, time drift/no clock, sequence continuity, expired/revoked/changed credentials, reader unplug/replug, power loss before/after SQLite commit, disk-full/corruption, sustained queue/backpressure, privacy, school isolation and manual attendance with no reader. Confirm a gate event never finalizes classroom attendance. Record exact model/wiring/configuration and measured results.
8. **Diagnostics/rollback:** inspect queue/error classes before retry; stop the owned worker, preserve a consistent SQLite backup including WAL using reviewed SQLite backup/checkpoint procedures, and retain immutable pending/attention evidence. Do not copy a live database file without WAL consistency. Keep the known-good commit/lockfile and encrypted/permissioned enrollment backup under operator custody. Roll back code only to a queue-compatible version after review; never downgrade a newer schema, edit canonical JSON, reset sequence, delete unresolved receipts or rotate identities silently to make a test pass.

Physical driver, reliable hardware heartbeat, ARM deployment/service installation, remote HTTPS ingestion, long-lived credential renewal/rotation, operational retention/encryption/backup/restore and real-school acceptance remain deferred. This task makes the software boundary reviewable; it does not eliminate those prerequisites.

## Verification and preserved failures

All writes/tests used approved isolated QA `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, loopback Supabase and owned fictional schools. No developer `.env.local` was read/moved/copied/hashed/modified. Existing credentials, protected records, unrelated files and database migrations were not changed. Test logs redact known approved synthetic values; no account/key files or screenshots belong in Git.

Private ignored evidence: `.local/schovera-manual-demo/m3-20261116/`, with exact command/start/end/exit ledger, original-file hashes and redacted logs. QA `.local/reader-readiness-<id>/` retains focused captures/results; `.local/m3-timing-<id>/` retains private timing diagnostics containing paths/statuses and synthetic rendered text, not request headers, credentials or response bodies.

- **354 non-integration tests in 43 files passed**, including nine new adapter/diagnostic tests. They verify mapping, missing/raw input refusal, lost-local-ack recovery, reopen/replay, changed-ID-content conflict, separate scans, sequence gaps/order, clock drift, revoked ingress, invalid authentication/schema, outage retry and receipt-time diagnostics. Existing RFID/gateway/attribution subsets are included, not counted again. TypeScript and lint passed.
- **Final reader readiness acceptance passed:** actual CLI processes, durable SQLite, signed v2 API and PostgreSQL receipts, exact replay versus separate scans, explicit transport-outage recovery, old M2-cache canonical preservation, delayed/sequence evidence, bad signature/binding refusal, unresolved revoked card, device/reader revocation, no classroom writes from scans, cleanup refusal, Teacher explicit finalize, Parent selected-child confirmation and Principal mobile view. The scan-only phase had six named gate events and zero current-day classroom records; Teacher finalization then published two classroom records. Revoked-card delivery retained one unresolved receipt without another named event or classroom mutation.
- **Existing acceptance passed:** M1 integrity, attendance, M2 exception review, connected role journeys, durable school operations, RFID v2 and gateway-local integrations, and reconnect. The two Vitest integration scenario passes are separate from the 354 unit/component tests. No physical reader or public destination was used.
- **Preservation passed:** all 20 protected-school dataset hashes unchanged; 170 protected tracked files unchanged; 247 executable source/script/migration inputs matched QA; 46 migrations retained. Existing dependency specs and old scripts preserved; QA remains Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5. No fresh dependency audit or advisory closure is claimed. Owned fixtures were cleaned; unrelated files were excluded.
- **Final isolated build passed:** Next 16.4.1 compilation, TypeScript, expected routes, generated production environment only, private sentinel scan, unchanged input check and exact snapshot cleanup. Uncommitted source snapshot SHA-256: f8f9c7ef413af7b45a2ef7e8f2561ef6f6023eb92ad358074808309443f17390; 208 approved files. This is not a committed release. Only the two allowlisted Google Fonts hosts were observed through the limited proxy; it is not an OS network sandbox. This is local working-tree build evidence, not hosted acceptance.
- Owned QA web servers were stopped after checks; Docker retained, Ollama not started. No existing password, student record, production environment, deployment or hardware configuration changed.

### M2 timing investigation

Three original repetitions of each suite reproduced **one reconnect failure and one Parent-confirmation failure**, with two passes each. The failures remain in the execution ledger.

- Parent failure: the private capture showed **Synthetic Child B selected**, whose current register was correctly unconfirmed, while the probe expected Child A's new finalized mark. Both confirmation RPC requests returned HTTP 200. The probe now explicitly selects Child A before the **same exact** Parent assertion; this corrects a fixture-selection assumption, not application privacy or attendance behavior.
- Timetable failure: the original heading/readiness checks succeeded, then a separate `innerText()` snapshot caught the loading-only panel during background refresh. The trace recorded successful timetable HTTP 200s and the final captured page contained the heading/class hint without the grid. The probe now checks readiness and captures the text in one browser task. Its original final content assertion is retained, with the existing 15-second readiness budget; no arbitrary sleep or timeout increase was added. This repairs the non-atomic probe; the application may still show a brief background-loading panel.

After the atomic timetable repair, three instrumented reconnect repetitions passed, followed by a final direct `verify:reconnect` pass. After correcting the inspected child selector, three complete instrumented M2 repetitions passed. Assertions and readiness time limits were retained. This resolves the reproduced probe assumptions, not a guarantee that every future timing/data state is tested. Original M2 failures remain historical evidence; the new repeated failures and passing reruns are retained here.

The first explicit child-selection repair used an exact nested-label locator that did not match the live select. That attempt failed in the new reader verifier and three queued M2 repetitions; the existing `.child-switcher select` was then inspected and targeted explicitly. All failures remain in the ledger; no Parent content assertion or timeout was relaxed.

A later direct reconnect run also timed out at online second-tab update delivery after Parent missed-update and Teacher missed-ack recovery had passed. This matches the separately recorded AUD-03 second-tab risk. An unchanged, instrumented full rerun passed; its subscription/timing cause remains unconfirmed. This is an open reliability risk, not claimed repaired by the two probe corrections.

Initial read-only inspection also encountered a mistaken integration-file path and a local console Unicode-print encoding error; corrected inspections changed no data. Neither a schema reset nor weakened signature/authorization assertion was used to obtain a pass.

### Exact execution ledger

UTC on 16 November 2026; IST = UTC +05:30. Commands use QA except the root isolated build. Repeated executions overlap in coverage; they are not independent feature counts. Instrumented timing helpers import the real verifiers with assertions unchanged and add private request-path/status/final-render diagnostics.

**45 executions: 38 PASS, 7 FAIL.**

| # | Command | UTC start | Exit | Result | Log |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m3/preserve.mjs` | 10:55:06.869 | 0 | PASS | `01-m3-preserve-1794826508192.log` |
| 2 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 10:57:18.405 | 0 | PASS | `02-units-1794826686068.log` |
| 3 | `npm run typecheck` | 10:58:06.111 | 0 | PASS | `03-typecheck-1794826691787.log` |
| 4 | `npm run lint` | 10:58:11.801 | 0 | PASS | `04-lint-1794826717261.log` |
| 5 | `npm run verify:reader-readiness` | 10:59:09.550 | 0 | PASS | `05-verify-reader-readiness-1794826775804.log` |
| 6 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:00:05.643 | 0 | PASS | `06-m3-timing-reconnect-1794826836464.log` |
| 7 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:00:36.490 | 0 | PASS | `07-m3-timing-review-1794826857342.log` |
| 8 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:00:57.542 | 1 | FAIL | `08-m3-timing-reconnect-1794826872962.log` |
| 9 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:01:12.984 | 1 | FAIL | `09-m3-timing-review-1794826904784.log` |
| 10 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:01:44.786 | 0 | PASS | `10-m3-timing-reconnect-1794826931539.log` |
| 11 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:02:11.541 | 0 | PASS | `11-m3-timing-review-1794826951393.log` |
| 12 | `npm run verify:attendance-integrity` | 11:02:31.395 | 0 | PASS | `12-verify-attendance-integrity-1794826963754.log` |
| 13 | `npm run verify:attendance` | 11:02:43.756 | 0 | PASS | `13-verify-attendance-1794826966769.log` |
| 14 | `npm run verify:final-journeys` | 11:02:46.770 | 0 | PASS | `14-verify-final-journeys-1794827003242.log` |
| 15 | `npm run test:rfid:integration` | 11:03:23.245 | 0 | PASS | `15-test-rfid-integration-1794827007498.log` |
| 16 | `npm run test:gateway:local-integration` | 11:03:27.500 | 0 | PASS | `16-test-gateway-local-integration-1794827028045.log` |
| 17 | `node --env-file=.env.test.local .local/m3/preserve.mjs` | 11:03:48.046 | 0 | PASS | `17-m3-preserve-1794827028406.log` |
| 18 | `npm run verify:reader-readiness` | 11:04:00.046 | 1 | FAIL | `18-verify-reader-readiness-1794827071423.log` |
| 19 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:04:31.437 | 0 | PASS | `19-m3-timing-reconnect-1794827099765.log` |
| 20 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:04:59.772 | 1 | FAIL | `20-m3-timing-review-1794827132902.log` |
| 21 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:05:32.919 | 0 | PASS | `21-m3-timing-reconnect-1794827161924.log` |
| 22 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:06:01.941 | 1 | FAIL | `22-m3-timing-review-1794827196991.log` |
| 23 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:06:37.078 | 0 | PASS | `23-m3-timing-reconnect-1794827228671.log` |
| 24 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:07:08.684 | 1 | FAIL | `24-m3-timing-review-1794827263296.log` |
| 25 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:07:43.375 | 0 | PASS | `25-units-1794827302615.log` |
| 26 | `npm run typecheck` | 11:08:22.864 | 0 | PASS | `26-typecheck-1794827307779.log` |
| 27 | `npm run lint` | 11:08:27.795 | 0 | PASS | `27-lint-1794827329807.log` |
| 28 | `node --env-file=.env.test.local .local/m3/preserve.mjs` | 11:08:49.809 | 0 | PASS | `28-m3-preserve-1794827331071.log` |
| 29 | `npm run verify:reader-readiness` | 11:09:04.140 | 0 | PASS | `29-verify-reader-readiness-1794827363259.log` |
| 30 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:09:23.261 | 0 | PASS | `30-m3-timing-review-1794827382975.log` |
| 31 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:09:42.977 | 0 | PASS | `31-m3-timing-review-1794827402598.log` |
| 32 | `node --env-file=.env.test.local .local/m3/timing-review.mjs` | 11:10:02.614 | 0 | PASS | `32-m3-timing-review-1794827421807.log` |
| 33 | `npm run verify:reconnect` | 11:10:21.809 | 1 | FAIL | `33-verify-reconnect-1794827454693.log` |
| 34 | `node --env-file=.env.test.local .local/m3/integrity.mjs` | 11:10:54.694 | 0 | PASS | `34-m3-integrity-1794827458417.log` |
| 35 | `node --env-file=.env.test.local .local/m3/preserve.mjs` | 11:10:58.418 | 0 | PASS | `35-m3-preserve-1794827458873.log` |
| 36 | `node --env-file=.env.test.local .local/m3/timing-reconnect.mjs` | 11:11:06.588 | 0 | PASS | `36-m3-timing-reconnect-1794827493726.log` |
| 37 | `npm run verify:reconnect` | 11:11:46.574 | 0 | PASS | `37-verify-reconnect-1794827532724.log` |
| 38 | `npm run typecheck` | 11:12:12.726 | 0 | PASS | `38-typecheck-1794827536843.log` |
| 39 | `npm run lint` | 11:12:16.844 | 0 | PASS | `39-lint-1794827555952.log` |
| 40 | `npm run verify:reader-readiness` | 11:12:54.704 | 0 | PASS | `40-verify-reader-readiness-1794827593172.log` |
| 41 | `node --env-file=.env.test.local .local/m3/integrity.mjs` | 11:13:13.173 | 0 | PASS | `41-m3-integrity-1794827597068.log` |
| 42 | `npm run verify:school-operations` | 11:13:34.197 | 0 | PASS | `42-verify-school-operations-1794827656566.log` |
| 43 | `npx --no-install supabase db lint --local` | 11:14:16.595 | 0 | PASS | `43-schema-lint-1794827659869.log` |
| 44 | `npm run build:isolated -- --working-tree` | 11:14:19.870 | 0 | PASS | `44-build-isolated-1794827725812.log` |
| 45 | `node --env-file=.env.test.local .local/m3/preserve.mjs` | 11:15:25.947 | 0 | PASS | `45-m3-preserve-1794827726765.log` |

## Exact files and publication

- `package.json`
- `scripts/attendance-demo/cli.mjs`
- `scripts/attendance-demo/mock-reader.mjs`
- `scripts/verify-attendance-review.mjs`
- `scripts/verify-reconnect.mjs`
- `docs/63_M3_RFID_SOFTWARE_READINESS.md`
- `scripts/rfid-gateway/diagnostics.mjs`
- `scripts/rfid-gateway/reader-adapter.mjs`
- `scripts/rfid-gateway/reader-adapter.test.mjs`
- `scripts/verify-reader-readiness.mjs`

Only completed M3 source/tests/operator commands/report are included. The containing commit is the milestone publication identity; its exact verified `origin/main` SHA and canonical GitHub link are supplied in the completion response and retained private publication receipt. No force-push, fake/empty commit, backdating, reset, stash or unrelated staging is authorized or used.

M3 is ready for **local software review**, subject to the limits above. Recommended M4 priorities: select the physical/network deployment architecture; review real acquisition enrollment/time/sequence/key custody; implement the selected driver and supervised hardware acceptance; design retained-attention resolution and operational backup/retention. No M4 implementation is included.
