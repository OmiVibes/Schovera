# Task 32D — School-entry pilot, security and offline plan

**Status:** design and readiness review only. This document does not authorize a real-student pilot, implement hardware/gateway code, change the database, publish Realtime, or deploy the ingestion route.

**Task 32G update:** the local v1 HTTP route described below has since been retired with `410 Gone`. Assignment-bound event v2 and its local-only capability issuer are implemented in [Task 32G](31_TASK_32G_RFID_EVENT_V2_IMPLEMENTATION.md). This does not change the Task 32D recommendation: no real-student offline pilot is authorized or ready, and the durable gateway is still not connected.

**Repository inspected:** `feat/task32c-school-entry-dashboards` at `c48a98066d28e75b32d0ba83aa88921f7224b7c`. The Task 32B-2 schema, local-only route, Task 32A simulator and Task 32C dashboards were inspected. All Task 32D tests remained local and synthetic. No physical reader is available, so electrical compatibility, RF range, reader behavior and outage behavior have not been hardware-tested.

## Executive recommendation

1. Begin with a **single entrance at ZP School Lonikand**, under staff supervision, and synthetic cards/data. Do not begin with multiple gates or treat taps as attendance/safety evidence.
2. Keep the existing event v1 payload for synthetic local API tests, but do not use the current route for a real pilot: it is loopback-only HTTP and has a process-memory rate limit.
3. Build and test a **laptop-hosted persistent gateway simulator** before buying/connecting hardware. The existing Task 32A `LocalReplayQueue` is in-memory and proves replay logic only; it does not survive process restart or power loss.
4. For eventual hardware, prefer a confirmed 3.3 V ESP32-family module talking to a Raspberry Pi 5 gateway over a private local link. Treat secure-element/key-storage choice, exact module revision and voltage adaptation as procurement gates. The Pi, not the MCU, holds the separate cloud signing key. Do not finalize pins before the exact boards and RC522 breakout are identified.
5. For an initial dashboard experience, choose **bounded visible-page polling** over raw row Realtime: refetch through existing RLS, stop while hidden/offline, and retain focus/reconnect/manual refresh. Revisit a minimal opaque change signal only after its authorization and refetch tests pass.
6. No real-student/offline pilot is ready yet. An important current schema gap is described below: credential resolution occurs when the cloud receives an event, not necessarily when the offline tap happened.

## Verified implementation boundary

- `POST /api/device/v1/events` accepts one signed JSON event up to 16 KiB. It requires local-mode flags, an HTTP loopback Supabase URL, a loopback `Host`, and a server-only service key. It is not reachable as a hosted device-ingestion service by design.
- The request uses Ed25519 verification, a five-minute signed-request timestamp window, per-device nonce protection, database deduplication by `(device_id, event_id)`, and a 60 authenticated requests/device/minute **in-memory** limiter. That limiter resets on restart and is not shared across instances.
- The database processor resolves `credential_ref` against the credential mapping active at processing time. It stores server receipt time separately from device observation time and keeps RFID entry events separate from `attendance_records`.
- Browser reads are RLS-scoped to linked Parent children, currently assigned Teacher classes, and same-school Principals. The sensitive device, credential and receipt tables are not browser-readable. There is no event-table Realtime publication.
- Task 32C refreshes on open, filter/context changes, manual refresh, focus/visibility and reconnect. It does not provide push delivery or polling.
- `scripts/rfid-simulator/core.ts` contains an explicitly in-memory processor and replay queue. It is not a Pi/laptop durable queue.
- Installed Next.js is `16.3.4`. The local-development report recorded an `npm audit` critical Next.js finding on 2026-10-19. This task does not re-audit/upgrade dependencies; production deployment remains blocked until the finding is reviewed, a patched compatible version is selected, and the full security/build/deployment-preview checks pass.

These statements describe checked-in code and recorded local checks, not production deployment or school approval.

## Proposed school workflow at ZP School Lonikand

### Before any student credential is issued

The school must name an accountable project owner and data-protection contact; approve purpose, locations, dates, staff responsibilities and incident process in writing; complete a privacy/security review for the school and its hosting/provider arrangement; provide families clear notice and obtain the school-approved parent/guardian permission required for the pilot; seek age-appropriate student assent where appropriate; and offer a workable non-RFID alternative without penalty. Do not infer consent from enrollment or from owning a card.

Approve a short, explicit retention schedule for raw entry events, unmatched receipts, audit records and local queue data separately. Define who can view/export records, how access is logged, correction/contestation steps, deletion/retention exceptions, breach escalation, and what happens when a family opts out or a student transfers. No retention duration or legal sufficiency is assumed here; the school must have its responsible administrator/privacy adviser verify applicable requirements before collecting real data.

The pilot purpose is only to evaluate whether supervised scan recording works operationally. Do not use it for discipline, grading, absence adjudication, safeguarding guarantees, automated parent alerts or consequential decisions. Existing classroom attendance remains the authoritative classroom process.

### Pilot configuration

Start with one staffed entrance and a clearly marked, supervised check-in and check-out flow. If arrival and departure use separate devices, label them physically and provision distinct checkpoint/device identities. If one reader is used for both directions, require a staff-controlled mode with a visible confirmation before the scan; never infer direction from a card UID or the previous event. Keep a paper/manual fallback and a staff review desk for missing, duplicate, unmatched or disputed events. Do not add other entrances until the first location's staff, exception and network procedures work.

Use school-issued opaque credentials. A Principal or specifically delegated, trained administrator verifies the child and card together, issues one active mapping, and gives the family a privacy notice and a replacement/contact path. A credential is a pseudonymous identifier, not a login or proof that the named child personally presented it. Never write names on an RFID card or expose its raw UID in logs/screenshots.

At check-in/out, a staff member supervises the scan and gives non-identifying confirmation (for example, a tone/light). The screen says “scan recorded” only after durable gateway acceptance; it must not say “safe,” “present,” “arrived home,” or “attendance marked.” If acknowledgement is lost, retry the same immutable event ID. A second intentional tap gets a new event ID and is preserved for policy/review; transport retries do not create another record.

### Exceptions and closure

- **Missed scan:** follow the school's existing attendance/contact process; do not infer absence or safety state from missing RFID data.
- **Repeated scan:** preserve the observation and mark a possible duplicate according to an approved rule. Do not silently delete it or convert it into a second arrival/departure transition.
- **Unknown, revoked or unreadable card:** return a generic message at the reader, do not reveal student identity, route the family to a staff member, and create only a privacy-safe unmatched operational record if approved.
- **Lost/replaced card:** staff verifies identity, revokes the old mapping, records reason/operator, issues a new opaque credential, and tests it. Historical event identity must not silently move to a new cardholder.
- **Closure, emergency, reader or gateway failure:** staff announce the manual process; no one waits for cloud connectivity to determine whether a child may leave. A physical tap never substitutes for safeguarding or authorized pickup checks.
- **Internet failure:** the local gateway may queue events after durable commit, but cloud dashboards and remote families cannot see them until synchronization. Display separate “reader → gateway” and “gateway → cloud” health, plus last successful sync time. Never imply remote delivery while offline.
- **Power loss/storage failure:** stop acknowledging scans if the local queue cannot commit; switch to the manual register. Reconcile after recovery with staff review and retained sequence-gap evidence.

## Hardware architecture and prerequisites

```text
Student credential
        ↓ supervised tap
RC522 module ── SPI ── ESP32-family MCU
                         │ local authenticated event only
                         ↓ private school LAN / isolated AP
                   Raspberry Pi 5 gateway
                   SQLite WAL outbox + local status
                         │ outbound TLS; signed one-event requests
                         ↓ (future reviewed hosted endpoint only)
                   Supabase event processor
                         ↓ RLS read + controlled dashboard refetch
                   Parent / Teacher / Principal
```

### Recommendation and board selection

For a later prototype, select an ESP32-family board with native 3.3 V GPIO and well-supported SPI, plus a known-good RC522 breakout, as the simplest reader-to-Pi wireless path. Confirm the exact ESP32 chip/module revision and secure boot/flash-encryption support before procurement. The Arduino UNO R4 WiFi is viable only after pin ownership and voltage translation are designed: its RA4M1 runs at 5 V while the onboard ESP32-S3 runs at 3.3 V; Arduino explicitly warns not to apply 5 V to ESP32-S3 pins. Do not treat the board's 5 V main GPIO as safe for a 3.3 V RFID module.

The NXP MFRC522 IC's supply is 2.5–3.3 V (with 3.6 V absolute maximum in its electrical characteristics), and its host interface is SPI. Breakout boards vary; inspect the exact board schematic/data sheet rather than assume a regulator or level shifter exists. Use a 3.3 V supply and compatible logic on all RC522 signal lines. If the selected MCU signal is 5 V, use a suitable bidirectional/unidirectional level translator as required by signal direction; simple resistor dividers are not automatically appropriate for every SPI edge/rate. Confirm common ground, decoupling, signal integrity and actual current budget before energizing. Never connect unknown pinouts live.

No exact GPIO pin assignments are included. They depend on board revision, SPI peripheral/pin mapping, reserved pins, boot-strapping pins, module breakout and wiring length. Validate with official board documentation, a continuity check and a current-limited bench supply first.

### Interface and protection

- **RC522 ↔ MCU:** short SPI wiring; module-appropriate 3.3 V; correct NSS/CS, SCK, MOSI, MISO and reset; debounce/re-poll logic with a bounded read window. RC522 supports ISO/IEC 14443 Type A/MIFARE/NTAG families; it does not read every RFID/NFC card. Select and test a card type compatible with the module and pilot's threat model.
- **MCU ↔ Pi:** local authenticated transport only. Preferred design is reader-specific mutual TLS or message authentication backed by a secure element, with a unique, revocable local credential. It is distinct from cloud credentials and the Pi's cloud-signing private key. The MCU sends only schema version, stable event ID, registered opaque reader identity, opaque credential reference, check-in/out, observed time and monotonic sequence; it never receives Supabase keys or the Pi/cloud private key. The Pi derives the registered device identity from its provisioned reader mapping, not a student ID supplied by firmware. If the selected MCU cannot protect a unique local credential, keep it a supervised synthetic prototype; do not call the local link production-secure.
- **Pi ↔ cloud:** only the Pi sync service holds cloud signing keys, one per registered device/checkpoint as required by the API. Keep keys outside the browser and firmware; use a secure element/TPM-backed store where available. Root-only file permissions and disk encryption are a minimum laptop/Pi development measure, not equivalent to hardware-backed protection. Use HTTPS, outbound-only firewall rules, key versioning, revocation drills and no inbound public listener.
- **LCD/buzzer:** optional only after core flow passes. Use a display with matching bus/logic voltage or a level shifter. Do not drive a buzzer, relay, lamp or other load directly from a GPIO if its current exceeds the board's pin rating; use a correctly rated transistor/MOSFET driver, protection components where inductive loads apply, and an independent supply if required. Keep audio/display feedback generic and non-identifying.
- **Power/cooling:** Raspberry Pi 5 requires a quality USB-C supply; Raspberry Pi recommends its 27 W / 5 V 5 A supply, and a 3 A supply limits USB peripheral current. The power budget is shared with USB/fan. Use a ventilated case and monitor temperature; official active cooling is available. Provide a separately sized stable supply for reader electronics if needed, common ground only where the interface requires it, strain relief and an enclosure that prevents accidental shorts. An UPS/safe shutdown design is required for sustained pilot use; a consumer power bank is not assumed to protect the filesystem.
- **Storage/network:** use quality, tested storage with free-space and write-failure monitoring; consider an SSD or industrial/high-endurance card for sustained queue writes. Reserve storage by policy and alert before full. Use a private local AP/LAN with only the reader and gateway; gateway egress should be restricted to approved cloud destinations, with no router port-forwarding, tunnels or public development server.

The Pi 5 recommended supply and cooling information is from the [Raspberry Pi hardware documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html). Electrical ranges and SPI behavior should be rechecked against the selected breakout; the chip reference is the [NXP MFRC522 data sheet](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf). UNO R4 voltage distinctions are in the [Arduino UNO R4 WiFi documentation](https://docs.arduino.cc/resources/datasheets/K000007_R4-datasheet.pdf). ESP32 secure boot and flash encryption are capabilities that need deliberate provisioning and irreversible eFuse decisions, not defaults to assume; see [Espressif Secure Boot guidance](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/secure-boot.html).

## Offline gateway design

### Laptop-first implementation

The next software prototype should run on the development laptop and use synthetic identities only. It should implement the same process boundaries intended for the Pi: local reader ingress, durable outbox, cloud-sync worker and operator status. It must refuse non-loopback destinations by default and never load `.env.local` or production credentials.

Use SQLite with WAL, foreign keys, explicit schema version and transactional writes. For each event: validate strict schema/size/enums; authenticate local reader; assign/validate a stable event ID and per-reader sequence; insert the complete opaque event and queue state in one transaction; request durable commit; only then acknowledge the MCU. If commit fails, return no acknowledgement so firmware retries the same event ID. Keep events until a definitive server receipt is persisted; store response status, attempts, next retry, last error class and receipt timestamp. Never store student names or raw card UIDs in the queue.

On restart, run integrity/schema checks, resume only pending rows in sequence order, and replay with the same event IDs. Build in fault injection for process kill before commit, after commit/before local ack, after cloud acceptance/before local receipt commit, disk full, permission error, corrupt row and prolonged offline. This gives at-least-once delivery plus cloud idempotency; it does not promise exactly-once transport. If local storage is unavailable/full, stop accepting taps and instruct staff to use the manual fallback.

Status must distinguish:

| Link/state | Meaning and required UI behavior |
|---|---|
| Reader → gateway connected | Local message authenticated, validated and durably committed; only then show “recorded locally.” |
| Reader → gateway unavailable | Do not claim a recorded scan; staff uses manual process. |
| Gateway → cloud online | Last successful cloud receipt time and pending queue count/age visible to authorized operator. |
| Gateway → cloud offline/retrying | Keep events queued, show pending count and last sync; no remote dashboard/notification promise. |
| Attention required | Disk full, revoked/unknown key, sequence gap, invalid event or retry age exceeded; retain evidence, alert staff and require reviewed resolution. |

### Cloud sync and contract compatibility

The existing v1 event envelope can be sent one event per request. The Pi creates a fresh signed-request timestamp and nonce on each attempt, but preserves the original event ID, observed time, sequence and payload. It deletes/marks an outbox row complete only after saving the API's definitive receipt. Retries use bounded exponential backoff with jitter and a cap; 4xx validation/auth errors enter attention-required, 429 respects `Retry-After`, and 5xx/network errors retry. Unknown receipt after timeout is safe to retry with the same event ID and a fresh request nonce.

Do not add batch API assumptions: the checked-in route accepts one event. Keep the queue until every event has a canonical receipt. Preserve server `received_at` as receipt truth and mark device clock quality separately; server request-freshness timestamps are not a substitute for `observed_at` validation.

**Required separate design/implementation decision before real offline named records:** the current processor resolves `credential_ref` using the mapping active when the cloud processes the event. A tap queued while offline can arrive after that credential was revoked/reassigned; it may become unmatched or resolve under a later mapping. Do not guess attribution from untrusted device time. Before real student offline use, design an immutable credential-version binding or other server-verifiable event-time mapping, including revocation/reassignment races, privacy, signing and retention. That likely needs a versioned event contract and migration/RPC change, so it is not silently folded into this plan or the current task.

### Keys, clocks and recovery

- Each reader identity and Pi/cloud identity is unique; no fleet-wide shared secret. The local reader credential and cloud API signing key are different keys with separate scopes and rotation.
- Keep a key version and activation/revocation state. Rotation: provision new public verification key, securely install matching private key, perform synthetic test, switch sender, then revoke old key. Lost/stolen board or Pi: disable its identity immediately, preserve queue for reviewed recovery, and re-enroll with new identity. A stolen gateway may expose queued pseudonymous events; encrypt disk, limit access and report according to the approved incident plan.
- Use monotonic device sequence for ordering/gap evidence; do not use client wall clock to overwrite ordering. Keep both `observed_at` and database `received_at`, and flag unreliable time. Pi should sync time when network returns; no NTP or RTC is assumed available during outage. If time uncertainty exceeds policy, retain event with a quality flag and route to staff review rather than fabricate a time.
- Power failure before durable commit means no acknowledgment; reader retries. Power failure after commit but before acknowledgment means retry deduplicates locally by event ID. Power failure after cloud receipt but before local state update means sync retry returns the original receipt. Disk full or integrity error means fail closed to manual recording; never silently discard or overwrite oldest rows.

## Dashboard refresh strategy

| Strategy | Benefits | Risks / cost | Pilot decision |
|---|---|---|---|
| Existing manual/focus/reconnect refresh | Lowest load; simple authorization; persisted RLS query is truth. | A visible page can look stale until a person focuses/refreshes it. | Keep as baseline and fallback. |
| Bounded polling | Uses existing RLS SELECT and needs no raw event broadcast; straightforward to pause/back off. | Repeated queries and bounded delay; must avoid polling every route or hidden tab. | **Recommend for a small pilot:** only while an authorized entry panel is visible and page is foreground, one query every 15–30 seconds with jitter; stop on hidden/offline/unmount, coalesce with reconnect/focus/manual refresh, show “last updated,” and back off on errors/rate limits. Load only a bounded recent window. Measure query volume before expanding. |
| Minimal opaque Realtime signal | Lower delay/query load; can trigger refetch. | Requires carefully authorized topic/filter, reconnect behavior, payload minimization and independent RLS/refetch proof; broad/raw event publication can leak metadata. | Defer until a separate security-reviewed implementation; never broadcast names, student IDs, card refs or event payloads. |

Polling does not make data instantaneous or available when cloud connectivity is down. Do not add `school_entry_events` to Realtime publication just to make the dashboard appear live. The signal, if later approved, should only cause the existing role-scoped client to re-read persisted rows.

## Threat model and risk register

| Threat / failure | Impact | Required mitigation / evidence before pilot | Residual risk |
|---|---|---|---|
| Clone/emulate a card UID | Another person can create scans under a credential. | Treat UID as lookup token, not authentication; staff supervision, controlled issuance, incident/replace flow, no safety promise. Consider a stronger credential technology only after threat/cost review. | A basic RC522 UID card is clonable; identity cannot be proven. |
| MCU impersonation/local packet injection | Forged or altered events enter queue. | Unique local mTLS/message-auth credential, Pi allowlist, replay IDs/sequences, isolated network, secure element and revocation test; gateway derives device binding rather than trusting arbitrary school/student fields. | Physical compromise of an inadequately protected MCU remains possible. |
| Stolen cloud key / Pi | Attacker can submit events as the registered device. | Per-device keys, hardware-backed protection where possible, least privilege, TLS, immediate revocation drill, alerting, logs without secrets, rotation and backup recovery. | Root/physical compromise may extract a non-hardware-backed key. |
| Credential misassignment or cross-school leak | Wrong family sees records or event attribution crosses school boundary. | Two-person/student-card verification for pilot issuance; school derived from device registry; maintain current RLS tests Parent linked/unlinked, Teacher assigned/unassigned, Principal own/other school. | Human enrollment error and policy misconfiguration remain. |
| Replay/duplicate/forged or altered payload | Double count or fabricated observation. | Stable event UUID, signed exact payload, timestamp/nonce, event hash, unique receipt, sequence gap monitoring; test exact retry, changed payload and nonce replay. | A legitimately signed but compromised device can still submit false physical observations. |
| Offline data tampering/reordering | Missing/changed observations or misleading chronology. | SQLite transaction/WAL, protected disk, at-least-once idempotent sync, sequence gaps, original payload hash, server receipt time and staff review; fault-inject restart/corruption. | Local administrator/root can alter a laptop/Pi without hardware-backed integrity; observed time is untrusted. |
| Device/API exposure | Remote attacker reaches a local-only development route. | Keep current route loopback-only; no tunnel/port forward. A future production route requires HTTPS, authentication, bounded bodies, distributed rate limit, monitoring, abuse controls and independent review. | Current route is not production-safe. |
| In-memory rate limit / multiple instances | Limits reset on restart and do not coordinate across servers. | Replace with shared distributed limiter at a reviewed hosted boundary before deployment; test per-device and per-school abuse, 429 behavior. | None until implemented and load-tested. |
| Lost/revoked card in delayed queue | Processing-time credential mapping may differ from tap-time owner. | Resolve the event-time binding gap described above; otherwise do not attribute real offline events to named children. | Unresolved in the current schema/processor. |
| Time drift / sequence gap | Wrong displayed chronology or delayed status. | Record observed and received times separately, monotonic sequence, quality state, NTP/RTC health, staff review; never infer absent/late from a gap. | Device clock may be untrusted or unavailable. |
| Power, disk full, SD wear or corruption | Lost scans / false acknowledgement. | Commit-before-ack; capacity monitoring; validated storage; UPS/manual fallback; restart and disk-full fault tests; keep unacknowledged pending on MCU. | Hardware durability varies; manual register remains necessary. |
| Retention, audit or breach | Excessive sensitive history or inadequate response. | School-approved retention/deletion/access policy, minimal metadata, audit trails, encryption, incident contacts and restore drill. | Requires organizational controls not provided by code alone. |
| Critical Next.js advisory | Exposed hosted app may run vulnerable framework. | Resolve the previously recorded critical finding, re-run current audit, build/security suites and deployment preview; do not deploy RFID endpoint before closure. Current locked version observed: Next `16.3.4`; no upgrade performed in Task 32D. | Release blocker until verified closed. |

## Decision checklist — no student pilot until every gate is signed off

- [ ] School head/management authorizes purpose, entrance, schedule, roles and manual fallback.
- [ ] Privacy/legal adviser confirms applicable child-data requirements, parent/guardian permission wording, student notice/assent approach, opt-out alternative and complaint/contact channel.
- [ ] School names data owner/operator, authorized staff, support contact and incident/breach escalation.
- [ ] Data categories, access/export, audit, retention/deletion, backups and local queue purge schedule are approved.
- [ ] Pilot limits are written: cohort, start/end, allowed use, no safety/discipline/attendance decisions, stop conditions and success measures.
- [ ] Credential technology and cloning limitations are accepted; lost/reissue/revocation and disputed-record process are rehearsed.
- [ ] One-entrance and in/out layout, staffing and exception procedures are approved; alternative/manual register is available.
- [ ] Exact MCU, Pi revision, RC522 breakout, voltage levels, power supplies, enclosure and optional peripherals are identified and bench-tested by a competent adult/technician.
- [ ] Local-reader authentication, Pi key custody, provisioning, rotation, revocation and stolen-device response are tested.
- [ ] Durable queue/restart/fault tests pass; the event-time credential mapping issue is fixed or real offline named attribution remains disabled.
- [ ] Cloud deployment boundary, HTTPS, distributed rate limits, monitoring, data backup/retention and least privilege receive independent review.
- [ ] Critical Next.js advisory is resolved and re-audited; no production deployment uses the current blocked dependency state.
- [ ] Parent dashboard language and stale/offline indication are reviewed with families; no remote-alert promise during outage.
- [ ] A rollback/stop switch and post-pilot data deletion verification are demonstrated.

## Local acceptance plan and evidence status

| Scenario | Existing evidence | Additional work needed | Physical hardware? |
|---|---|---|---|
| Synthetic check-in/out, signature validation, exact retry, payload conflict, nonce replay, stale timestamp, invalid signature, size/schema rejection | Implemented in local Task 32B-2 integration tests. | Re-run after any route/schema change. | No. |
| Parent/Teacher/Principal role visibility and cross-tenant isolation | Implemented locally through RLS and Task 32C role UI integration. | Repeat with final pilot policy and account setup. | No. |
| Credential/device revocation and unknown credential | Implemented for current online processor. | Add offline queued-before-revocation/event-time attribution tests. | No. |
| No classroom attendance mutation | Implemented local assertion; table separation in migration. | Preserve regression in gateway integration suite. | No. |
| Local-only environment / production target refusal | Implemented in local launcher, env guard, simulator and tests. | Keep loopback assertions in every mutating harness; no hosted acceptance in this task. | No. |
| New event on already-open dashboards | Task 32C integration uses explicit refresh; reconnect/focus tests exist. | Add bounded-poll visibility/backoff tests or later opaque-signal tests. | No. |
| Offline queue/replay | Task 32A only demonstrates an in-memory queue. | New laptop durable SQLite service and restart/fault-injection suite. | No for laptop simulation. |
| Pi power-loss/storage behavior | Not implemented or tested. | Test after gateway code on Pi with storage/power fault injection and safe manual fallback. | Yes, Raspberry Pi. |
| RF card read, duplicate tap distances, interference, enclosure, sound/LED feedback | Not tested. | Bench-test exact card/module/antenna and location, supervised; record board/module revisions and results. | Yes, reader/cards. |
| MCU → Pi authenticated link and key storage | Not implemented or tested. | Implement local protocol, provisioning, replay and revocation; verify secure element if selected. | Yes for final link validation; simulator can test protocol logic. |
| Cloud outage then hosted synchronization | Current API intentionally has no hosted route. | Separate production boundary/security task after critical dependency and event-time attribution blockers are closed. | No for local simulated sync; hosted acceptance needs explicit authorization. |

Test evidence must state synthetic simulator versus physical device, exact software/hardware revision, expected/observed result, timestamps, and cleanup. Do not create test data in production. No test in this Task 32D run asserts future gateway behavior; only documentation checks and the existing offline-safe RFID unit suite are appropriate.

## Smallest safe next-task order

1. **32E — durable laptop gateway simulator (synthetic/local only).** SQLite WAL outbox, local authenticated-ingress abstraction, commit-before-ack semantics, restart/retry/fault injection, production-target refusal, and cleanup. Do not enroll real children or claim Pi/hardware durability.
2. **32F — offline credential-attribution and contract decision.** Resolve tap-time identity/revocation races, local reader identity versus cloud device identity, any v2 event fields, sequence semantics and server verification. This decision must gate named-student offline sync; migrations/RPC changes require a separately approved implementation task.
3. **32G — local Supabase sync acceptance.** Connect the durable laptop gateway to the current one-event local endpoint using synthetic records; test outbox crash windows, idempotent receipts, revocation, sequence gaps, retry status and cleanup. Do not link or write to hosted Supabase.
4. **32H — pilot dashboard freshness.** Implement foreground-only bounded polling (recommended first) with backoff/last-updated and tests; consider opaque Realtime only as a separately reviewed alternative. Do not publish raw event rows.
5. **32I — voice playback accessibility** for existing original communication text, with browser availability and user-controlled play/stop. This can proceed in parallel with gateway simulator work because it does not depend on RFID identity or cloud sync.
6. **32J — approved translation and communication fallback.** Define human approval/original preservation and privacy review first; it may proceed in parallel with hardware procurement but not as fabricated/automatic “approved” translation.
7. **32K — physical reader bench integration.** Only after hardware procurement, wiring/voltage review, unique-key provisioning, secure boot/storage decision, local protocol, supervised test plan and school authorization. Start with synthetic cards; no real-student pilot until every decision checklist gate is complete.

## Task 32D completion boundary

This plan is not permission to buy/connect devices, issue cards, collect student scans, publish Realtime, create cloud routes, apply migrations, or deploy. No `.env.local`, Supabase production, Vercel or `main` change is made. Task 32E should start with synthetic, laptop-local, durable-queue engineering only.
