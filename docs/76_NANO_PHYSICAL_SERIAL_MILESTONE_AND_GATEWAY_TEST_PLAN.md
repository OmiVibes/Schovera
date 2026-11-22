# Nano physical serial milestone and controlled gateway test plan

20 November 2026. **Physical read-only serial acquisition PASS, operator-reported. Physical scan-to-database/dashboard acceptance PENDING.** This is a plan, not authorization for enrollment, live SQLite capture or backend writes. No hardware command, provisioning or delivery is executed by this documentation step.

## Milestones retained separately

| Stage | Evidence | Result and limit |
|---|---|---|
| Synthetic software integration | [Milestone 75](75_PI_SOFTWARE_MILESTONE_AND_PHYSICAL_VALIDATION_PLAN.md), saved authoritative verifier | One gate event/receipt, identical retry, zero classroom attendance; simulator identity retained unchanged |
| Nano-only serial diagnostic | Owner's supplied complete sanitized output | 124 bytes, READY 1, reader version indication 1, rejected frame 1, scans 0, exit 0, worker closed; no serial payload/backend writes |
| Nano + RC522 physical read-only diagnostic | Owner's 30-second result summary; three card presentations were planned | 155 bytes, valid scans 3, distinct tuples 3, repeated tuples 0, invalid frames 0, READY 1, version indication 1, possible-reset indications 0, uptime regressions 0, exit 0, automatic closure; serial payload writes 0, backendWritten false |

The latest summary is operator-reported, not a newly observed SSH execution or an archived raw serial log. It establishes real serial scan-frame reception within this run; the assistant has not independently inspected the physical setup. Distinct uptime tuples do not cryptographically prove three different physical taps. No UID is reproduced. The earlier Nano-only rejected frame remains unexplained and is not erased by the later zero-invalid-frame result.

Opening may reset the Nano even with DTR off. An initial READY is evidence of setup execution; the observer's possible-reset counter increments for READY after scans and does not rule out an opening reset. Reader version recognition is not a chip authenticity/electrical certification. The owner acknowledged the electrical compatibility concern and reconnected the reader; no repeat photo request is required by this plan. Electrical compatibility has not been certified by serial success.

Exact selected source: `/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0`, USB identity `0403:6001:BG02XZ38`, 115200 baud. No automatic alternate port or reconnect is permitted. Pi Supabase remains stopped. Preserve the existing loopback SSH tunnel at `127.0.0.1:33106` and the Windows loopback backend; no network reconfiguration.

## Reviewed integration path and current limits

Reuse `capture-linux-gateway.mjs` / `linux-gateway-capture.mjs`, `LegacyGatewayCapture` in `legacy-gateway.mjs`, the existing gateway SQLite WAL/transaction store, ingress validation and signed v2 transport. No second queue, direct database insertion, automatic attendance or firmware changes are needed. Capture and delivery are separate phases with the existing worker lock; never run both workers concurrently.

The local adapter checks the reviewed UID HMAC, exact reader binding, signed capability and school/assignment scope. Cursor and gateway row commit together. An identical session/card/uptime tuple reuses its stored event ID, sequence, observation time and payload. Another uptime is another host observation, even for the same card. This is not tap-level deduplication. Legacy firmware provides neither source ACK/replay nor a persistent acquisition identity; loss before host commit remains unrecoverable. Observation timestamps are host receipt time, not reconstructed card-tap UTC.

Two execution guards need a small reviewed software preparation before a tightly bounded live test:

- The existing capture CLI accepts 1–30 seconds but has no hard new-event budget. Three presentations do not guarantee exactly three emitted tuples. A one-shot rehearsal wrapper must stop after the approved number of distinct durable observations, reject subsequent new observations before ingress, and retain the first durable result. It must reuse the same capture class/store, close reliably and leave unknown-card, reset, expiry and capacity refusals intact.
- The generic `rfid-gateway/cli.mjs sync-v2` selects due queue rows without a device/event CLI filter. A wrapper must pin the newly approved device and exact captured event IDs, recheck the queue manifest under the existing worker lock, and use the existing signed transport with a fixed request budget. It must refuse unrelated pending work rather than send it with the physical device key. Do not change old rows or create a parallel delivery implementation/queue. Unexpected results must stop without additional HTTP requests.

These guards are planned, not implemented or tested in this step. Before live use, provide the exact wrapper source/diff and mocked test results for event budget, unrelated queue refusal, duplicate response, interruption and cleanup. Preserve every existing M7 assertion. No generic sync or live capture command is authorized merely by the examples in the earlier handoff.

## Proposed approval gates and bounded test

### A. Approve preparation and fictional enrollment separately

Scope: one new owned fictional school, one class and learner, Principal/Teacher/linked Parent/unlinked Parent test access, one opaque credential/active immutable assignment and one new `nano_rc522` device. Generate a new device Ed25519 key on the Pi; transfer only its public request to Windows. Never reuse the software-probe device, key, assignment, accounts or delivered event. New device metadata must truthfully say Nano/RC522.

Before authorized writes, verify the current Windows QA target/local guards and migration availability, take fresh hashes of all 20 protected-school datasets, and record the existing software-probe row/receipt/hash and zero classroom attendance. Check the Pi's existing gateway integrity/state without changing rows. The current tunnel stays in place. No environment file, Supabase credential, issuer secret or Principal password is transferred to the Pi.

After preparation approval only, provision through the existing authorized device/assignment contracts; create no schema. Journal exact owned fictional IDs privately. The test-card mapping is an explicit owner-reviewed enrollment, not a scan-triggered lookup. Generate the HMAC key/digest privately on the Pi with non-echoed input; do not place the UID in shell arguments/history, ordinary output or committed files. Pin the issuer public key and validate the signed capability scope/expiry. Transfer only the minimum scoped response after separate review; keep local config/key files user-owned 0600 and directories 0700. Do not copy the simulator response and edit its identifiers.

Preparation must end with no new physical gate events, no classroom attendance and unchanged protected hashes. Share only sanitized IDs/counts/checksums and the bounded wrapper review, then obtain approval B. Stop for unavailable authorized provisioning, expired capability or ambiguous card mapping.

### B. Approve one physical capture to SQLite only

Budget: one port opening at the exact identity above, at most 30 seconds, one operator presentation, **at most one new durable event**, no serial payload writes and no HTTP delivery. Reconfirm monitor closed, visible port users, device identity and DTR-reset acknowledgement immediately before opening. Use a new reviewed capture session; the source uses host receipt time. Initial READY before a scan is allowed. An unexpected READY after capture, uptime regression, unknown card, invalid frame, worker conflict or disconnect ends the run for review.

After the first durable observation, stop and close; confirm SQLite commit, private canonical envelope/hash, physical device/assignment/session match, one new pending row and zero destination rows for that device. Do not claim sent, delivered or classroom Present. Save a sanitized manifest of the exact event ID/hash and immutable scope. No raw UID or secrets in screenshots/logs. If zero/multiple new rows or an unexpected result occurs, retain all work and stop; never delete rows to force the expected count.

### C. Approve restart verification and signed delivery

First reopen the queue **without reopening serial** and verify the exact pending event ID, sequence, payload hash and timestamp remain unchanged. A later serial READY on the same persisted capture session is deliberately a review hold, not an instruction to bypass reset protection. Do not restart capture to test a gateway process restart.

Then approve a maximum of two signed API submissions for that single event: one original plus one identical-body retry, with fresh request authentication nonces. Use the reviewed existing receipt-commit fault hook only after the first accepted destination response to exercise lost local confirmation; reopen/retry through the same queue, never reconstruct an event or insert at the destination. If a private wrapper cannot enforce this safely, stop before delivery rather than approximate it with an unscoped command. Expected first/duplicate responses are 202/200 and false/true, with the same server receipt. An actual outage/unplug experiment is outside this initial budget; do not alter the tunnel or network. Unexpected response or timeout stops the run with the row retained for review and no automatic extra submission.

### D. Read-only authoritative acceptance

On Windows, using the approved isolated QA verifier and fictional account sessions, require:

- Exactly one gate event and one device receipt for the new physical device, identical expected payload hash/assignment and a committed receipt time; queue delivered with the same immutable event.
- Exactly zero classroom attendance rows for the new fictional school; RFID must not call classroom-attendance writers or auto-confirm presence.
- Principal, assigned Teacher and linked Parent can read the new gate record; unlinked Parent cannot. Open their existing school-entry views and verify the same physical event is displayed. API visibility alone is not dashboard acceptance.
- The earlier simulator event/receipt and its hash/counts are unchanged, as are all 20 protected-school dataset hashes. Compare business datasets without writing protected records.
- Sanitized evidence identifies physical versus synthetic source, observation timestamp basis, committed local/destination receipt and outstanding limitations. A card UID is not secure proof of a student's presence.

Report every actual command, exit/result, count and discrepancy. Leave owned fixtures/queue records retained after the test; cleanup/revocation is a separate explicit scoped action. Do not automatically proceed to more cards, repeated presentations, school records, firmware changes or Pi services.

## Approval text for the next stage

Suggested approval A only:

> Approve the reviewed bounded-test wrappers and mocked tests, plus preparation of one separate fictional Nano device/student/card enrollment. Generate its private device key only on the Pi, keep the simulator untouched, and exchange only public enrollment requests and scoped responses. Do not open serial, capture into SQLite or deliver an event yet. Return the exact reviewed scope and commands for approval B.

This is a proposed scope, not approval inferred from documenting the milestone. Commands will be provided one at a time once each gate is approved. Existing private configuration must never be pasted into chat.

The owner subsequently approved software preparation but explicitly prohibited
database writes. [Preparation report 77](77_NANO_BOUNDED_GATEWAY_PREPARATION.md)
records implemented/tested guards and proposed commands. Actual device/student/card
provisioning remains pending that restriction; live capture/delivery remain unapproved.

## Documentation verification

This update records the supplied results and reviews existing source; it does not rerun application tests or claim a new hardware execution. Run local documentation whitespace/link checks and confirm the firmware diff remains empty. Prior synthetic software/M7 evidence remains valid within its recorded scope, without claiming a fresh regression run. All unrelated work is preserved. No stage, commit, push, database operation, serial open or network change is performed.
