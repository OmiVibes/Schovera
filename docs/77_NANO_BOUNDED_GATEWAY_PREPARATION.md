# Nano bounded gateway preparation

20 November 2026. **Software guards ready for review; enrollment and live execution pending.** The owner approved preparation only and explicitly excluded live capture, delivery and database writes. Device/student/credential registration therefore was not performed. A separate nonfunctional enrollment blueprint is prepared in `scripts/physical-rfid/physical-enrollment-plan.example.json`; its null IDs and false approval flags are deliberate. It does not constitute a registered device or card assignment. No simulator identity, key or assignment is reused.

## Implemented safeguards

- `scripts/physical-rfid/bounded-gateway.mjs`: wraps the existing capture class and delivery worker. Capture is limited to **at most one new durable event**, and success requires exactly one plus confirmed worker closure. Extra frames in the same input chunk cannot reach ingress after that commit. Timeout/no scan fails rather than claiming capture success. No serial command/ACK writes are added.
- `scripts/physical-rfid/linux-gateway-capture.mjs`: optional strict one-event budget, immediate abort/close after first commit, numeric new-event evidence and explicit budget result. Default behavior remains compatible with the existing caller. The internal read-only observer may label the budget's abort as interrupted; the outer gateway result reports `capture_budget_reached` and success only with confirmed closure. Unconfirmed closure remains failure with the committed event retained.
- `scripts/physical-rfid/legacy-gateway.mjs`: opt-in unused-session/device check under the existing SQLite worker lock. This prevents another process/restart from getting a fresh capture allowance from the same session or a device that already has events. After even an empty failed attempt initializes its session, a new session requires separate review; no cursor is deleted/reset.
- `scripts/rfid-gateway/storage.mjs`: optional `recoverOnOpen: false`; default recovery is unchanged. The bounded CLI opts out of broad interrupted-work recovery so it cannot alter unrelated queued records. The scoped delivery adapter likewise bypasses global recovery and selects only the exact device/event. A selected event left `syncing` after a process crash is retained and refused for review, not silently recovered or resubmitted.
- `scripts/physical-rfid/bounded-test-cli.mjs`: separate explicit capture/delivery modes, exact port/USB and school/session/device confirmations, private Linux config/approval/key ownership and mode checks, existing private v2 gateway database requirement, loopback target pinned to `http://127.0.0.1:33106`, new device key fingerprint verification for delivery. No dotenv loading, auto-enrollment, alternate serial selection or execution on import.
- `scripts/physical-rfid/bounded-gateway.test.mjs`: 26 new mocked-serial/HTTP and disposable-SQLite tests. Existing M7 tests/assertions are untouched.

The delivery approval pins event ID and canonical payload SHA-256. Under the existing worker lock it checks reader authorization, current signed capability, school, immutable assignment, device and event content. The existing signed v2 transport handles nonce/signature/receipt validation; destination authorization and revocation remain authoritative. One invocation permits at most one HTTP send; stored `attempt_count` limits the approved event to two attempts across invocations. No automatic repeat loop is added. Delivered work is a no-op; mismatched, exhausted, corrupt, inactive, expired, attention or interrupted states fail closed. Other devices' pending/syncing/delivered rows are not selected or recovered.

The reviewed lost-local-receipt mode is allowed only on attempt zero. It uses the existing transactional receipt hook after destination acceptance, leaving the same immutable event pending. Its deliberate pending result exits nonzero and must be inspected before any separately approved normal retry. An unrelated failure is not permission to rerun. Fault injection is not a physical network-outage claim.

Private approval files are operator-reviewed local controls, not protection against an administrator who can rewrite the queue, key and manifest. File permissions, the signed assignment and server authorization remain necessary. No raw UID is printed or put in ordinary logs. Legacy source limitations and host-receipt timestamp semantics from [milestone 76](76_NANO_PHYSICAL_SERIAL_MILESTONE_AND_GATEWAY_TEST_PLAN.md) remain.

## Verification executed

All commands below ran in the approved isolated Windows QA checkout `C:/Users/Om/AppData/Local/Temp/schovera-m7a-qa-b5bad848`. Six approved executable files were copied there without copying root environment files. A controlled ignored runner supplies an OS-variable allowlist. Tests use generated identities, mocked serial/HTTP and owned disposable SQLite files, never the live Pi queue. Known temporary paths are checked before fixture cleanup. No hardware transport or HTTP event delivery was executed.

| Exact command | Final result |
|---|---|
| `node node_modules/vitest/vitest.mjs run scripts/physical-rfid scripts/arduino-local/serial.test.mjs scripts/rfid-gateway --maxWorkers=1 --no-file-parallelism` | **184 PASS in 12 files**, including 26 new guard tests, all 22 M7 serial tests and existing physical/gateway coverage |
| `node node_modules/eslint/bin/eslint.js scripts/physical-rfid/bounded-gateway.mjs scripts/physical-rfid/bounded-test-cli.mjs scripts/physical-rfid/bounded-gateway.test.mjs scripts/physical-rfid/linux-gateway-capture.mjs scripts/physical-rfid/legacy-gateway.mjs scripts/rfid-gateway/storage.mjs --no-cache` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| `node --env-file=.env.test.local .local/physical-preparation-20261120/read-only.mjs` | Original simulator gate/receipt IDs, counts, canonical hash/assignment and zero classroom attendance verified unchanged using SELECTs only |
| `node --env-file=.env.test.local .local/proposals/preserve.mjs` | All **20 protected-school dataset hashes unchanged**, existing baseline retained |
| Root `git diff --check` and firmware/M7/package diff checks | PASS; unrelated pre-existing line-ending warnings only |

The new tests cover a multiple-frame chunk, one-event budget, alternate source refusal, persisted session reuse, unconfirmed closure, scope/expiry changes, forged capability, unknown card/malformed input, timeout/disconnect cleanup, unrelated interrupted-row preservation through reopen, exact duplicate retry with fresh nonce, wrong event/hash, local reader revocation, remote denial, outage/budget exhaustion and worker contention. These are automated software checks, not another physical acceptance run. No build, migration or live capture was run in this preparation stage.

Failures retained in ignored `.local/schovera-manual-demo/physical-preparation-20261120/`:

1. The initial preservation lookup helper used the wrong relative enrollment-response path and stopped before querying. Correcting its private artifact path allowed verification; no product assertion was weakened.
2. First unit run: 181/182 passed. One event was correctly committed and capture stopped, but the internal abort surfaced as exit 130. The outer budget result now succeeds only on its own budget stop with confirmed closure. The unchanged expectation then passed (182/182); adding two more source/closure cases produced final **184/184**.
3. The first successful preservation pass reused the pre-existing authoritative verifier, including four fictional account sign-ins. Those sign-ins can create Auth session records; it was not strictly SELECT-only. No school business records or enrollment/gate/attendance rows were written. The final verification switched to service-client SELECTs with no sign-ins. This limitation is retained rather than claiming absolutely zero possible Auth writes.

Native SQLite experimental and existing TypeScript module-type warnings remain unsuppressed. No credentials or raw real-card UID were printed. The previous role visibility result remains preserved; the final SELECT-only pass did not repeat role logins.

## Enrollment still awaiting database-write approval

The proposed enrollment is a new `nano_rc522` device and a new fictional school/class/learner/credential assignment, with a new device key generated **on the Pi**. Only the public request and approved scoped capability response would cross machines. The real test card's HMAC mapping must be established privately and explicitly; it is not inferred from the simulator or automatically enrolled from a scan.

No new key has been generated/transferred and no physical device/student/card registration is claimed. The currently approved instruction says no database writes, so usable school/device/assignment IDs, signed capability, key fingerprint and private approvals cannot yet be supplied. First authorize fictional enrollment records only, keep capture/delivery prohibited, prepare the exact scope, then review and separately approve live commands. No production environment, issuer secret, Supabase credential or account password belongs on the Pi.

## Proposed live commands — review only, DO NOT RUN

These are the exact CLI shapes after a separately approved source transfer and enrollment. The Pi still has the earlier source package: these new guards have **not** been deployed there. The existing source ZIP is frozen and must not be silently replaced. Any new source patch needs its own checksum/diff review. No network, firmware or Pi Supabase change is needed.

Private config must use the existing `enrollment.example.json` structure with verified scope, exact hardware identity, 30-second maximum and explicit monitor/reset confirmations. A separate private capture approval must contain version 1, `hardwareType: nano_rc522`, `fictionalOnly: true`, matching school/device/reader/session IDs, `maxNewEvents: 1`, `maxRequests: 2`, the new device's public-key PEM SHA-256 and a reviewed future expiry. Delivery approval additionally pins the locally committed event ID and canonical hash. No template becomes approval by merely filling it in. All such files stay ignored/user-owned 0600, directories 0700.

**Capture only, after separate approval B:**

```bash
cd /home/schovera/Schovera && env -u NODE_OPTIONS -u NODE_PATH node scripts/physical-rfid/bounded-test-cli.mjs capture \
  --config /home/schovera/Schovera/.local/physical-rfid/nano-one-event-20261120/capture.json \
  --approval /home/schovera/Schovera/.local/physical-rfid/nano-one-event-20261120/capture-approval.json \
  --database /home/schovera/Schovera/.local/schovera-rfid-gateway/gateway.sqlite \
  --confirm-school '<PENDING_NEW_FICTIONAL_SCHOOL_UUID>' \
  --confirm-session '<PENDING_NEW_CAPTURE_SESSION_UUID>' \
  --confirm-device '<PENDING_NEW_NANO_DEVICE_UUID>'
```

Expected: first valid mapped scan commits one new pending SQLite row, closes immediately with confirmed closure and outer reason `capture_budget_reached`; no backend delivery. Observe one card presentation only. No event within the bound is failure; an uncertain close/commit is a review hold, not permission to repeat. Before delivery, reopen the queue without serial and inspect its exact immutable event/hash and pending state; backend physical-device rows must still be zero.

**Single delivery attempt with planned local receipt loss, after separate approval C and event/hash review:**

```bash
cd /home/schovera/Schovera && env -u NODE_OPTIONS -u NODE_PATH node scripts/physical-rfid/bounded-test-cli.mjs deliver \
  --config /home/schovera/Schovera/.local/physical-rfid/nano-one-event-20261120/capture.json \
  --approval /home/schovera/Schovera/.local/physical-rfid/nano-one-event-20261120/delivery-approval.json \
  --database /home/schovera/Schovera/.local/schovera-rfid-gateway/gateway.sqlite \
  --confirm-school '<PENDING_NEW_FICTIONAL_SCHOOL_UUID>' \
  --confirm-session '<PENDING_NEW_CAPTURE_SESSION_UUID>' \
  --confirm-device '<PENDING_NEW_NANO_DEVICE_UUID>' \
  --device-key-file /home/schovera/Schovera/.local/physical-rfid/nano-one-event-20261120/device-private.pem \
  --target http://127.0.0.1:33106 \
  --receipt-mode lose-first-local-receipt
```

Expected: one accepted destination event, attempt count 1, local pending row due to intentional receipt rollback and nonzero CLI exit. Confirm the actual destination receipt before continuing. This is not permission to ignore other failures. For the **separately reviewed identical retry**, use the same exact command/scope with only `--receipt-mode normal`; expect attempt count 2, duplicate destination receipt, one delivered queue row and one backend gate row. There is no third request allowance. Do not use the generic unscoped sync CLI for this rehearsal.

Final Windows verification must independently check matching payload/assignment/receipt, exactly one physical-device gate row and receipt, zero fictional classroom attendance, dashboard visibility for Principal/Teacher/linked Parent and denial for the unlinked Parent. Recheck original synthetic evidence and all 20 protected-school hashes. The source scan must stay distinct from teacher-confirmed attendance. Preserve retained records and stop on any unexpected result.

## Preservation and handoff

Existing M7 source/assertions, firmware, dependencies, schemas/migrations, private environment files and unrelated files are unchanged by this stage. Only mocked tests wrote disposable local SQLite fixtures. The live Pi queue was neither opened nor modified; no serial access, source transfer, event submission, firmware/network change or Pi Supabase restart occurred. No stage, commit or push occurred.

Preparation is ready for code review. **Enrollment is blocked only by the explicit no-database-write restriction; live execution remains separately unapproved.**

The owner subsequently approved fictional enrollment/database registration only.
[Checkpoint 78](78_NANO_FICTIONAL_ENROLLMENT_REGISTRATION.md) records the new
verified fictional school/learner/credential and the pending Pi public-key request.
The no-database-write blocker above describes the earlier preparation checkpoint;
live capture, delivery and safeguard deployment remain unapproved.
