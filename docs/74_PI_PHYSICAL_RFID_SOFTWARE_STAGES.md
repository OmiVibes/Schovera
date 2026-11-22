# Pi physical RFID integration: software stages and hardware handoff

20 November 2026. **PARTIALLY IMPLEMENTED; PHYSICAL ACCEPTANCE PENDING.**
During the initial software stage, the owner confirmed the Nano was disconnected
and requested software-only work. Later USB metadata is recorded in the follow-up
below. This report never claims a real scan reached PostgreSQL.

## Audit and preserved boundaries

Starting HEAD: `7f22280d083102dbef1ca3f906d71b4392e484e0`, branch `main`.
Existing doc 45 typo edit, `CLAUDE.md` and `review/` remain untouched.
Nothing is staged, committed or pushed. No dependencies, firmware, UI, existing
enrollment records or attendance logic were changed. One compatible PostgreSQL
migration was added and applied only to isolated local QA; prior migrations remain
unchanged.
Developer `.env.local` and `.env.development.local` were not opened or overwritten.
The existing isolated QA checkout retained its approved environment files.

Already complete and reused:

- `scripts/physical-rfid/protocol.mjs` and `serial-lines.mjs`: strict physical
  frame validation and bounded ASCII framing; legacy CSV has no stable source ID.
- `scripts/physical-rfid/adapter.mjs`: simulation/reference protocol only; unchanged.
- `scripts/arduino-local/` and `scripts/arduino-gateway/`: unchanged M7 synthetic
  schema/session/host-intent restrictions. They do not accept real cards.
- `scripts/rfid-gateway/reader-adapter.mjs`, `ingress.mjs`, `storage.mjs`: reviewed
  assignment mapping, HMAC admission, existing SQLite WAL/FULL queue and receipt.
- `scripts/rfid-gateway/local-v2-transport.mjs`: immutable signed delivery,
  loopback-only target, retry/recovery and matched destination receipts.
- `src/app/api/device/v2/events/route.ts`, `src/lib/rfid/v2-server.ts`: device
  signatures, assignment capabilities, revocation, limits and local server guard.
- Existing `school_devices`, `student_credentials`, `school_entry_events`,
  `device_event_receipts` and role-scoped views remain authoritative. RFID never
  automatically finalizes Teacher classroom attendance.

Windows Docker core API/Auth/DB were healthy. Vector was restarting, an existing
auxiliary issue not repaired here. The owned QA web service was stopped at
inspection and was started in guarded RFID mode on loopback port 3106. No Pi
containers were started. TCP/22 on `10.42.0.1` was reachable; strict BatchMode SSH
was rejected, so no remote commands or hardware discovery were performed.

## New software

| File under `scripts/physical-rfid/` | Purpose |
|---|---|
| `readonly-linux.mjs` | Bounded private Python-worker transport; strict by-id/USB selection, no payload-write API |
| `linux-readonly.py` | Standard-library Linux serial open/read/cleanup; explicit DTR/RTS, exclusive access, sanitized failure IPC |
| `capture-linux.mjs` | Separate safe 1..30 second read-only CLI |
| `capture-readonly.mjs` | Narrow Linux dispatch; Windows CLI/options remain unchanged |
| `legacy-gateway.mjs` | Reviewed binding/capability validation, HMAC UID matching, host-receipt-time observations, deterministic retry identity and reset holds |
| `linux-gateway-capture.mjs` | Bounded framing-to-gateway orchestration, stops on malformed/unmapped/held work |
| `capture-linux-gateway.mjs` | Explicit private config/school/session/database CLI; captures locally, does not submit to destination |
| `readonly-linux.test.mjs` | Mock transport, strict options, no-write and portable pure Python validation |
| `legacy-gateway.test.mjs` | Scoped temporary SQLite tests for duplicates, restart, admission, rollback, revocation, capacity, reset and offline delivery |
| `linux-gateway-capture.test.mjs` | Mocked bridge framing, pre-open refusal and fail-closed lifecycle |
| `linux-worker-mock.py` | Six OS/descriptor-mocked Python lifecycle tests; no hardware calls |
| `enrollment.example.json` | Intentionally invalid placeholder template; no card identifier/credential |
| `RASPBERRY_PI.md` | Exact staged software/network/hardware handoff and unresolved acceptance |

The gateway adds only a namespaced session cursor to the **same** SQLite file;
outgoing events stay in `gateway_events`. Its schema version and existing engine
are unchanged. Cursor advancement uses the existing ingress `beforeCommit` hook,
so rollback cannot leave a cursor claiming an uncommitted scan. Worker ownership
is reused; capture and sync run sequentially. No second outgoing queue exists.

`supabase/migrations/20261120083000_allow_nano_rc522_devices.sql` extends the
hardware-type constraint and existing Principal-only provisioning RPC with
`nano_rc522`, retaining all former values, signature, audit behavior and ACLs.
Explicit null-role/type refusal makes denial fail closed. No device row is relabelled,
backfilled or enrolled, and no RLS/signature/attendance rule changes. After confirming
all 51 local versions matched QA and there were no unrelated pending migrations,
the one migration was applied with
`node node_modules/supabase/dist/supabase.js migration up --local` in QA. There are
now 52 local migrations. Windows Supabase's API binding was verified as
`127.0.0.1:54321`; no hosted or Pi database was contacted.

`scripts/verify-nano-device.integration.test.mjs` creates only owned fictional
metadata/accounts, confirms all four hardware types, denies anonymous/Teacher/
Parent provisioning, rejects invalid/null types, denies cross-school revocation
and verifies same-school revocation. It then cleans its scoped devices, audit
records, accounts and schools and verifies school removal. No card or reader
connection is part of that test.

Legacy source limitations are explicit: no before-commit recovery, physical-tap
identity guarantee, secure card identity, fabricated UTC conversion, source ACK,
automatic reset adoption, background service or classroom mutation. Local signed
capability checks permit only the reviewed binding; destination replay still
rechecks current server authorization. Private config is an operator trust input,
not an OS security sandbox. Neither USB descriptors nor an editable local file
cryptographically authenticate the Nano or a physical person.

## Verification record

All checks used the existing approved Windows QA checkout with synthetic data;
new serial transports/OS calls were mocked. Python's Linux-only APIs were injected
with mocks on Windows; no Linux kernel or ARM64 compatibility claim follows.

Final checks passed as recorded below. The initial new gateway test
failed by incorrectly equating host observation time with later ingress time;
the test now asserts the injected host timestamp and validates the separate
durable ingress timestamp. Existing assertions were unchanged. The first Python
timeout mock exhausted a one-item fake-read list before its fake clock reached
the deadline; the fake now returns the same controlled bytes until the deadline.
Both failed attempts remain in ignored execution evidence.

| Executed command (QA unless stated) | Final result |
|---|---|
| `node node_modules/vitest/vitest.mjs run scripts/physical-rfid --maxWorkers=2 --no-file-parallelism` | PASS: 81 tests in six files (60 existing, 21 new) |
| `python -I -B scripts/physical-rfid/linux-worker-mock.py` | PASS: six tests, all native OS calls mocked |
| `node node_modules/vitest/vitest.mjs run scripts/arduino-local/serial.test.mjs scripts/arduino-gateway scripts/rfid-gateway --maxWorkers=2 --no-file-parallelism` | PASS: 103 existing tests, including the 22 M7 serial tests |
| `node --env-file=.env.test.local node_modules/vitest/vitest.mjs run scripts/verify-gateway-v2.integration.test.ts scripts/verify-rfid-v2.integration.test.ts --maxWorkers=1 --no-file-parallelism` | PASS: two integration scenarios |
| `node --env-file=.env.test.local node_modules/vitest/vitest.mjs run scripts/verify-nano-device.integration.test.mjs --maxWorkers=1 --no-file-parallelism` | PASS: correct Nano type, former types, invalid input, role/school denial and scoped cleanup |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| `node node_modules/eslint/bin/eslint.js src scripts --no-cache --concurrency 1` | PASS |
| `npm run build:isolated -- --working-tree` (developer repo, isolated wrapper only) | PASS: Next 16.4.5, TypeScript, expected routes, private-sentinel scan, unchanged inputs and exact snapshot cleanup |
| `node --env-file=.env.test.local .local/proposals/preserve.mjs` | PASS before/after integration and at completion: all 20 protected-school datasets unchanged |

The initial implementation phase ledger contains 28 executions: 26 passing, two failed
attempts retained. Those failures are the Python mock issue above and an isolated
build that compiled but refused certification because implementation edits changed
its source during verification. A frozen-source rerun passed; the guard was not
weakened and both snapshots were cleaned. The earlier 75/76 physical-test run
is separate in the publication runner ledger, not hidden by this count.

The passing isolated build fingerprint is
`396032c645e1087c33c0a799103715e4132d4f6db4c14274744d5cd7a95ea869`
(267 approved inputs, uncommitted). Only generated `.env.production` was loaded.
Only the two allowlisted Google Fonts hosts were observed through its limited
proxy, not an OS sandbox. The wrapper does not compile/execute the Python serial
worker; that source was separately syntax/pure-helper and OS-mock tested. npm
reported the existing ESLint deprecation warning; dependencies were not upgraded.

Final physical source/QA copies match for executable files; sensitive-pattern
review found no real test-card UID, known local password or private-key block in
the new physical source/docs. The example configuration contains only placeholders.
Git diff checks passed. Source hashes/diffs confirm the pre-existing M7, gateway,
RFID simulator, firmware, migrations and package manifests remain unchanged.
The newly added Nano-type migration is the sole PostgreSQL schema addition;
the existing migration files are unchanged. The new metadata integration and the
two original integration scenarios passed after it was applied, followed by a
passing frozen-source build. Completion probes returned website HTTP 200 and
HTTP 400 for an invalid v2 envelope (enabled API correctly refusing invalid input).

Existing v2/gateway integration passed two scenario tests against actual Windows
Supabase: signed ingestion, attribution/revocation/replay, SQLite restart/offline
retry, persisted receipts, role denial and three-portal entry visibility. These
are existing synthetic integration tests, **not the new Linux adapter driving a
physical card end to end**. All 20 protected-school dataset hashes matched before
and after those tests. Scoped integration fixtures were cleaned by the suites.

Private evidence: `.local/schovera-manual-demo/pi-physical-20261120/`.
The earliest test batch also appended to the prior publication runner's ignored
ledger; its 75/76 new-test failure is retained there. No secrets are copied into
this report or the source template.

## Remaining blockers and next action

See [the step-by-step Pi guide](../scripts/physical-rfid/RASPBERRY_PI.md).
Do metadata-only device discovery after connecting the Nano and closing monitors;
then review the exact by-id/USB identity, permissions and DTR behavior before
approving the 30-second read-only test. A missing USB serial/by-id entry is a
blocker, not permission to guess another device.

The SSH tunnel is a documented, unexecuted route: Pi loopback 33106 forwards over
SSH to Windows loopback 3106; no hotspot, firewall, Supabase bind or Host guard is
changed. Verify the actual Pi listener remains loopback-only before using it.
The Pi must not run the full Supabase stack.

Real-card enrollment is still blocked on reviewed fictional school/student
assignment, private Pi provisioning and actual device identity. The Nano-type
software gap is closed in local QA, with role and tenant tests passing. This task
does not mislabel real Nano hardware as `local_simulator`. No Pi service install,
source deployment, private enrollment transfer or device upload was performed.

No publication is authorized. The Pi's cloned main does not contain these pending
changes yet; agree a reviewed source transfer or GitHub publication separately.

## Metadata follow-up: software preparation only

The owner later reported the stable by-id path
`/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0`, resolved ttyUSB0,
FTDI serial BG02XZ38, driver ftdi_sio, root/plugdev mode 660 and schovera membership
in plugdev/dialout. This is operator-reported evidence, not an assistant-run
hardware test. The subsequent terminal transcript reported no `fuser` output with
exit 1, Node `v22.23.5`, Python `3.13.5`, short Git revision `7f22280` and empty
working-tree status. Those versions meet the documented prerequisites and the
reported short revision matches the prepared base prefix. No visible port user
was reported; visibility limitations remain. The next supplied udev output confirms
vendor `0403`, product `6001`, serial `BG02XZ38`; the exact worker identity is
`0403:6001:BG02XZ38`. Reset/DTR behavior and electrical compatibility remain
unresolved. The guide pins the exact path and identity without assuming a reset
result, safe reader wiring or a successful scan.

Source-only deployment preparation is allowed; hardware capture and actual Pi
transfer/application remain unapproved. No permissions, firmware, private config,
network settings, database services or serial-port state are changed by this
follow-up. No application code changed, so prior test/build results remain the
implementation evidence rather than a claim of a new hardware pass.

A 17-file source-only patch, manifest and ZIP were prepared under ignored
`.local/schovera-manual-demo/pi-source-prep-20261120/`. The patch passed
`git apply --check` against an owned temporary copy of committed base
`7f22280d083102dbef1ca3f906d71b4392e484e0`; application to that temporary copy
reproduced all reviewed source files. The exact temporary copy was cleaned.
No Pi source or configuration was touched. The package excludes unrelated edits,
private environments/configuration, credentials, logs, SQLite, dependencies and
firmware changes. It remains a prepared artifact, not approval to transfer/apply
it or run a capture. The manifest records per-file and patch hashes for review.

## Operator-reported Pi deployment

The owner subsequently confirmed SCP transfer and ZIP checksum verification for
package SHA-256
`3a0457d0d6cb1884dec54ffb48678fb992aeaed191e8a39d9ac88f59a9924435`.
The reported Pi transcript shows the expected base/clean-tree guards and patch
dry-run passing, then source-only application to `/home/schovera/Schovera`.
All 17 manifest files passed canonical content hashes, MJS parse checks, Python
AST checks, JSON parsing, Git whitespace checks and the exact changed-file check.
The modified/untracked working tree after application is expected; no Pi commit
was made. These are operator-reported static validation results, not independently
executed SSH checks or a native serial test.

The transferred ZIP/manifest are retained unchanged as the deployed snapshot.
This Windows-side follow-up record is not part of that original package and must
not silently replace its hashes. Next are software-only mocked lifecycle and RAM
protocol checks on the Pi. No reader opening, firmware operation, database
migration, service startup or electrical acceptance follows from source deployment.

The owner then supplied successful native Pi execution output for
`python3 -I -B scripts/physical-rfid/linux-worker-mock.py` (six mocked OS lifecycle
tests, OK) and `node scripts/physical-rfid/cli.mjs simulate` (with NODE_OPTIONS and
NODE_PATH removed). The latter ended with `simulation_complete`, two RAM records,
one session, zero validation-ACK attention, `writeCount:4` and false durability,
backend/student association and hardware-verification flags. Those four writes
were simulated callback operations, not serial payload writes. No real port,
reader, authoritative database or Pi Supabase service was exercised. Native Pi
SQLite queue tests are the next software check; physical acceptance remains pending.

The owner next supplied a passing Pi Vitest run of
`scripts/physical-rfid/legacy-gateway.test.mjs`: 12/12 tests in one file, 130 ms
test time and 835 ms total duration. This exercises the existing SQLite engine
on that Pi runtime with owned disposable databases and fictional enrollment:
persistence/reopen, duplicate identity, reset holds, rollback, lost local ACK,
expiry/revocation, concurrency, school/assignment mismatch and capacity. Remote
delivery in these unit tests is mocked; no physical scan, tunnel, authoritative
PostgreSQL write or actual hardware ACK is proven. The Node SQLite experimental
warning appeared, but the test file passed. These are owner-supplied results,
not assistant-operated hardware observations. Network-only tunnel verification
is next; physical opening remains gated on electrical review and explicit approval.

The owner then reported successful temporary reverse-tunnel verification:
Pi listener `127.0.0.1:33106`, forwarded website HTTP 200 and invalid v2 envelope
HTTP 400. This proves the reported loopback API route, not authenticated event
acceptance, a usable Pi browser database session, or real hardware ingestion.
No persistent network change or Pi Supabase restart was reported. Next is a
dedicated software-probe signing identity: generate its private key on the Pi,
share only its public verification request, and then review an owned fictional
Windows enrollment. No real UID/student association or reader opening is authorized
by this step. Private identity/configuration transfer remains separately gated.

The owner supplied public request `8adb602c-9f93-40bb-8f5a-c651572f3d7e`.
Its Ed25519 SPKI SHA-256 was independently recomputed as
`ab6f81bfad92a4f9f730a4a5187617559ff28b2eda9e51d102ee871b4ab23964`.
The Pi private key was not requested, read or transferred. A private operator
harness in the approved QA checkout prepared one new fictional probe school,
one class/student and four generated accounts (Principal, Teacher, linked Parent,
unlinked Parent). It used the existing Principal RPCs and guarded capability API
to register that public key as a clearly labelled `local_simulator` software
probe and issue an immutable assignment capability. No real card was associated.

The private enrollment response was checked against an explicit field allowlist,
the owned fixture journal, stored device binding and issuer signature. It contains
the fictional IDs and signed assignment capability, but no device private key,
reader secret, account passwords, Supabase key or issuer private key. Four new
actor sign-ins, the authorized roster and unlinked denial passed. The new school
still has zero gate events and zero attendance records. All 20 protected-school
dataset hashes matched before and after preparation. Node reported its existing
native-TypeScript module-type warning; the preparation/verifier exited 0, and no
package setting was changed to suppress it.

Private scope/journal/verification artifacts are under ignored
`.local/schovera-manual-demo/pi-software-probe-8adb602c/`. The response digest is
`4135c973581b67ee8228d9665a1404d679e3933f95afd2a2681e8f475bf79836`.
At this checkpoint, private response transfer and submission of one synthetic
event plus an exact retry await explicit owner approval. No event has been sent,
and the original deployed source ZIP remains unchanged. The fixture is retained
for that controlled test; no automatic cleanup or credential rotation is performed.

The owner then explicitly approved transferring only the required device-scoped
test response and submitting exactly one synthetic event plus one identical retry
through the existing durable queue. Approval requires one stored gate event,
zero classroom attendance rows and unchanged protected datasets; hardware capture,
firmware/network changes and Pi Supabase startup remain forbidden. The response
hash remains `4135c973581b67ee8228d9665a1404d679e3933f95afd2a2681e8f475bf79836`.
Fresh Windows preflight again verified the signed capability/owned fixture,
four test-role sign-ins, zero probe gate/attendance rows and all 20 protected
dataset hashes. A private approval sidecar pins the response and two-submission
limit. At this point authenticated file transfer still requires the owner's SSH
terminal; no response transfer or event submission has been performed by the
assistant. The next gate is exact response checksum and private file ownership/
permissions on the Pi, without printing the response or any private key.

The owner reported transfer preflight success, matching response SHA-256,
mode 600, owner schovera and size 1613 bytes on the Pi. Private Windows command
preparation now provides a one-shot inline sender and a separate read-only
authoritative verifier; these are ignored operator artifacts, not additional
files to transfer. The sender uses the existing queue and signed v2 transport.
It deliberately holds the first local receipt only after HTTP 202/accepted, then
allows one identical-body retry expecting HTTP 200/duplicate with the same
destination receipt and fresh authentication nonce. Queue and durable marker
guards prevent re-execution; any unexpected response stops without another retry.

Nine private harness checks passed: six queue/signature/budget/failure/read-only tests
and three authoritative evidence/count/link/hash tests. The latter allows the
gate and receipt's distinct server insertion timestamps, while requiring the
same observation time and exact immutable payload hash. These harness tests are
offline with generated synthetic identities, not the approved live Pi submission.
All 20 protected-school hashes still matched immediately before handing over
the commands. Live result verification remains pending; no new event has been
submitted by the assistant and no physical operation is authorized.

## Completed software-only integration — 20 November 2026

The owner subsequently reported the approved live probe PASS: HTTP 202/200,
duplicate false/true, one SQLite row, two delivery attempts, delivered state and
identical payload. The retained Windows `after-server-verification.json` confirms
one gate row, one device receipt, zero fictional classroom attendance rows,
matching payload/immutable assignment and visibility Principal 1, Teacher 1,
linked Parent 1, unlinked Parent 0. The owner also confirmed all 20 protected-school
dataset hashes unchanged. This supersedes the pending live-result checkpoint
above; the assistant inspected the saved authoritative result without submitting
any further event. No physical serial operation is claimed.

[The milestone and next physical validation plan](75_PI_SOFTWARE_MILESTONE_AND_PHYSICAL_VALIDATION_PLAN.md)
records the evidence and blockers. Actual-unit DTR/reset behavior and RC522/Nano
electrical compatibility still require review and controlled measurement.
Unpowered board/wiring identification comes first. The deployed source ZIP stays
unchanged; no new transfer, capture, firmware change, network change or Pi Supabase
startup is authorized. Nothing is staged, committed or pushed by this follow-up.

## Operator capture-window correction — 22 November 2026

Review of the supervised physical-capture timing found that the read deadline
started before the serial port-open confirmation and reserved 500 ms inside the
configured duration. The operator prompt is emitted only after the port opens,
so initialization reduced the available tap time. The supervisor now starts its
unchanged maximum 30-second capture window immediately after reporting readiness;
the separate five-second startup bound remains, and the Linux worker has only a
shutdown margin while the parent stops accepting bytes at the configured limit.
The five-minute approval and one-new-event limit are unchanged.

Focused verification on Windows used mocked serial transports and a mocked Linux
worker: 54 Vitest tests, 6 Python worker tests, and 4 supervised-workflow tests
passed. Syntax and diff checks passed. No Pi source was transferred or run in
this correction, and no serial port, queue, backend or hardware was accessed.
The updated Pi runtime source therefore still requires its separately reviewed
transfer before another physical attempt.
