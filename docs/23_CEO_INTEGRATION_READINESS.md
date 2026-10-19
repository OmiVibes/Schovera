# CEO Integration Readiness — Architecture Only

**Status:** Task 31 design and groundwork. This document proposes future interfaces; it does not claim the RFID, offline gateway, voice, translation, or SMS/IVR features exist.

**RFID contract update:** Task 32G implements a local-only assignment-bound `POST /api/device/v2/events`; the illustrative v1 route below is historical and returns `410 Gone` locally. No gateway sync or hosted device endpoint is enabled. See [Task 32G](31_TASK_32G_RFID_EVENT_V2_IMPLEMENTATION.md).

**Repository baseline inspected:** `3b7ab555ad5e27b7b35c3334403c4d9c943d807c` on `main`; the reported Task 30 commit `267ae6f138b3e1e6ff2aef6009a86974e7b52cbf` is an ancestor, not HEAD. Task 31 work is isolated on `feat/task31-integration-readiness`.

## 1. Current product and architecture

Schovera is a Next.js 16 / React 19 / TypeScript web app. Its interactive role shell is shared across `/teacher/*`, `/parent/*`, and `/principal/*`. It uses Supabase Auth, PostgreSQL with RLS, security-definer RPCs for privileged writes, and Postgres Changes as a prompt to refetch authoritative data. Vercel hosts the web app; Supabase hosts auth and data. No separate API service, queue, or edge server is currently present.

The current relational foundation is reusable: `schools`, `profiles`, `classes`, `teacher_class_assignments`, `students`, `parent_student_links`, `student_updates`, `acknowledgements`, `attendance_records`, `announcements`, `class_assignments`, `timetable_entries`, and `audit_events`. Teacher attendance is a class/day register; it is not currently a physical-entry event stream and must not be silently redefined as one.

Current role boundaries derive from the authenticated profile and database relationships, not a role supplied by a form. Parents can select among active linked children; the selected child is held in session storage and each data request remains scoped to that child. Teachers work in actively assigned classes. Principals see data for their own school. Writes such as attendance, update creation/correction, parent acknowledgement, assignments, timetable changes, and announcements use database-side checks and RPCs. Existing important-update coverage is derived from persisted updates and acknowledgement rows, not client counter increments.

Current UI localization provides English, Hindi, and Marathi dictionaries for interface text. It does not translate teacher-authored messages. Update correction creates a linked, new immutable communication while preserving the original. Request IDs make teacher sends, assignments, notices, and timetable creates retry-safe. Realtime recovery resubscribes and coalesces an authorized persisted refetch after online/focus/visibility or channel recovery; Realtime payloads are not treated as authority.

The Next.js role route files are intentionally thin; the shared app owns route state and role content. The existing test scripts cover data/security/reliability, role navigation, visual widths, accessibility/i18n, and teacher AI. Package scripts are present for all requested verification commands. `next.config.ts` contains no custom deployment configuration; no `vercel.json` or `.github` workflow was found in the repository. Deployment has previously been reported as Vercel-backed; no production environment values or secrets are documented here.

## 2. Proposed future topology

```text
RC522 reader + ESP32 / UNO R4 WiFi
             │ local authenticated event; no student identity in the wire payload
             ▼
Raspberry Pi 5 gateway ── durable local queue / local status
             │ outbound HTTPS + gateway signature, at-least-once retry
             ▼
Next.js server endpoint (future) ── authenticate, validate, rate-limit, deduplicate
             │ narrowly scoped server-side write; service credentials never leave server
             ▼
Supabase PostgreSQL (immutable entry events + receipts, school-scoped RLS)
             │ authenticated RLS-filtered reads / authorized Realtime signal
             ▼
Teacher / linked Parent / same-school Principal web views
```

For the first pilot, make the Pi the online and offline gateway. Reader boards talk only to their paired local gateway. The Pi durably accepts events and later syncs them to a versioned cloud endpoint. A direct MCU-to-cloud mode is a separate future choice, not a hidden fallback: it complicates offline behavior, secret handling, rate limiting, and device fleet operations.

## 3. Minimum future data model

No Task 31 migration is proposed. Reuse existing `schools`, `classes`, `students`, `teacher_class_assignments`, and `parent_student_links`; do not duplicate school or student identity in device tables. Use existing school timezone configuration for display and policy windows.

| Proposed entity | Minimum purpose and fields | Access / lifecycle |
|---|---|---|
| `school_devices` | Opaque UUID, `school_id`, label/location, hardware kind, public verification key or protected device-secret reference, key version, active/revoked state, `last_sequence`, created/revoked timestamps. | Principal/admin provisioning only within its school. Device auth is checked in a server-only ingestion boundary; a device cannot read its registry row or change its school. Revoke immediately and rotate by version. |
| `student_credentials` | UUID, `school_id`, `student_id`, opaque `credential_ref`, credential version, valid-from/revoked-at, issued-by. | Principal/admin lifecycle only within same school. Never a login credential. Parent and Teacher do not read card references. Reassignment revokes the old association before linking a replacement. |
| `school_entry_events` | Immutable event UUID, `school_id`, resolved `student_id`, `device_id`, `event_id`, check-in/out type, untrusted `observed_at`, server `received_at`, sequence, timestamp-quality flag, optional credential-version reference. | Read only through role RLS. Corrections are separate reviewed/annotated records, never edits to raw events. Unknown credentials do not become student events. |
| `device_event_receipts` | Unique `(device_id,event_id)`, canonical payload hash, outcome, first `received_at`, event-row reference if accepted, batch ID and sequence. Store no raw card UID or names. | Ingestion service only; operational summaries require a separate narrowly scoped Principal view if justified. Provides retry result and conflict evidence. |

For an initial pilot, batch ID and sequence columns on receipts are sufficient; defer `offline_sync_batches` until there is a real batch-level review/approval need. Defer `notification_delivery_attempts` until a consented SMS/IVR channel is approved. Keep device audit/provision/revocation actions in the existing audit concept only if its access/retention rules are suitable; do not copy raw tap payloads into general audit metadata.

### Credential and reader limitations

RC522-readable UIDs are identifiers, not strong proof of identity: many cards can be cloned or emulated. A successful tap is not a safety guarantee, proof that the named student personally entered, or a substitute for school safeguarding procedures. The pilot should label this “recorded at this reader,” make human review available, and never promise attendance accuracy from UID alone.

The MCU must not contain Supabase keys or service-role credentials. During enrollment, the Pi can normalize a UID and derive an opaque reference with a school/device-scoped keyed HMAC; only the reference is stored in `student_credentials`. Do not log the raw UID, send it in analytics, or include it in a broadcast. Protect Pi secrets and disk access; assume physical compromise is possible. Rotate the relevant key version and re-enroll/revoke credentials after compromise. Device auth should use per-device credentials, narrow scopes, TLS, revocation, and rate limits. A secure element/public-key design is preferable for a hardened deployment; a shared fleet-wide key is not.

Lost or reassigned cards are revoked before a replacement is issued. Old event-to-student associations remain fixed; historical events are not reattributed to a new cardholder. Revocation does not erase history. Unknown/revoked references produce a generic unmatched receipt and an authorized operational review path, without exposing a student roster to the reader.

## 4. Versioned hardware-independent contract

Illustrative future route (not implemented or publicly exposed): `POST /api/device/v1/events`.

Example event:

```json
{
  "schema_version": 1,
  "event_id": "f10f4d70-1e5a-4b98-9c18-2d30cedc0081",
  "device_id": "opaque-registered-device-id",
  "credential_ref": "opaque-school-scoped-card-reference",
  "event_type": "check_in",
  "observed_at": "2026-10-19T08:12:21+05:30",
  "device_sequence": 1842
}
```

Authentication is outside the JSON body: HTTPS plus a per-device/gateway signature over method, versioned path, canonical body hash, a fresh request timestamp, and nonce/key version. Verify against the registered active device; derive school from that registry record, never from request JSON. A Pi signing key is distinct per installation and revocable. The Pi signs a fresh sync request when connectivity returns; a queued event retains its original stable `event_id` and sequence.

Initial bounds for a simulator/pilot: one event or a batch of at most 100; request body at most 256 KiB; strict JSON schema, enum, UUID and timestamp parsing; reject extra identity/school fields; per-device and per-school rate limits; and bounded processing time. Those values are design defaults to validate against the actual pilot, not current product guarantees.

Suggested responses: `202` accepted or accepted-with-unmatched-credential receipt; `200` already-processed event with the original canonical result; `400` malformed/version-unsupported event; `401` missing/invalid signature or stale signed request; `403` revoked or unauthorized device; `409` same `(device_id,event_id)` with a different payload hash; `413` body too large; `429` rate limited with `Retry-After`; `5xx` transient processing failure. Responses contain opaque event/receipt IDs and outcomes only—no child name, profile, or raw credential.

The unique receipt key makes retries idempotent. Same key + same canonical hash returns the stored outcome without a second event or side effect; same key + different hash is a conflict. Exact replay cannot process twice. Request nonce/timestamp and signatures defend tampering and stale packet replay; idempotency remains necessary because signatures do not guarantee one network delivery. Debounce repeated physical reads at the reader, but retain accepted raw observations; a separate projection may mark near-identical repeated taps as duplicate/no-op under an explicit policy. Do not delete raw observations to make counts look clean.

`observed_at` is device-reported and untrusted. Always store server `received_at`. Store a source/quality indicator and measured clock offset where possible. Reject impossible format/range, but do not discard delayed offline events solely because `observed_at` is old. Use sequence to identify gaps and per-device ordering; do not assume timestamps are monotonic or use them alone to resolve conflict. Dashboard projections should say when an event is delayed or its clock is uncertain.

### Task 32 simulator contract

Implement a hardware-free simulator that reads deterministic JSON/JSONL events conforming to the versioned shape, accepts a fake device identity only in a non-production test environment, signs requests through a test-only helper, and can replay, duplicate, reorder, delay, corrupt, revoke, and restart from a persisted queue. Assert the same receipts/results as hardware would receive. Simulator credentials must be isolated from real school devices; the simulator must refuse production URLs by default. It must not fabricate children or pass simulated taps off as physical-device evidence.

## 5. Authorization and Realtime boundaries

The ingestion endpoint is not a public anonymous Supabase table or browser RPC. It authenticates a registered device/gateway before any database write, enforces request bounds, derives the tenant from the registry, and uses a server-only narrow writer. If a privileged Supabase credential is required by that adapter, keep it only in server environment/secret storage; never expose it to firmware, the Pi's reader-facing API, frontend bundles, logs, or screenshots. Prefer an RPC/role that can only insert receipts/events and cannot administer Auth or read the school roster.

| Actor | Proposed event access |
|---|---|
| Device / Pi | Submit authenticated event envelopes only for its registered device and school. No roster, profile, parent-link, or raw event query. |
| Teacher | Read events for students in currently assigned classes; no other class/school. |
| Parent | Read only events for children with an active `parent_student_links` row for `auth.uid()`. |
| Principal | Read events only where `school_id` matches the authenticated profile's school. |
| Anonymous / other school | No event, credential, receipt, or device-registry access. |

Enable event Realtime only after these SELECT policies are implemented and direct REST/RLS tests pass. Subscribe with the user's authenticated scope, send only the minimum opaque signal, then refetch the authorized event projection through RLS. Reuse `useRealtimeResync` behavior: reconnect/focus triggers a bounded refetch from persisted truth. Do not broadcast student names or credentials. Realtime is a latency aid, not a delivery guarantee.

## 6. Offline and synchronization model

Track two independent health states:

1. **Reader/device → Pi:** connected, retrying, or offline/unacknowledged. A reader is acknowledged only after the Pi has durably committed the event to its local queue.
2. **Pi → cloud:** synced, queued, retrying, or attention-required. A Pi can accept local events while its internet/cloud connection is down; remote Parent/Teacher/Principal screens and alerts cannot update during a complete internet outage.

The Pi queue should use a durable local database with transactions/WAL, stable event IDs, monotonic sequence, schema version, and an fsync/commit before acknowledging the reader. After a power loss, recover committed rows; events not committed must be resent by the reader. Keep retry data until the cloud returns a definitive idempotent receipt. Sync at least once with bounded exponential backoff plus jitter and a cap; never claim exactly-once network delivery. A bounded retry policy controls frequency, not data loss: after a configurable age/attempt threshold, retain and surface a dead-letter/attention state rather than silently dropping records.

On reconnect, transmit events in device-sequence order where possible; cloud receipts tolerate retries, gaps, and out-of-order delivery. A sequence gap is visible for investigation but does not block later safe events indefinitely. Server `received_at` is authoritative for receipt; `observed_at` is evidence with a clock-quality flag. If a duplicate ID/hash arrives, return its original receipt. If the ID is reused with different content, quarantine with `409` and require operator review. Do not overwrite a later event based on client clock. Local collection is not remote delivery, and no Parent is promised SMS/app notification until connectivity and the approved notification provider are available.

Conflict resolution is conservative: preserve immutable observations and resolve the current arrival/departure projection through a documented state machine (e.g. repeated `check_in` while already checked in is an anomalous duplicate, not a second arrival). Missing events, gaps, implausible clock offset, unmatched card, and contradictory transitions are flagged for staff review; the system must not infer punishment or absence from a single missing tap.

## 7. Voice, translation, SMS/IVR

- **Voice:** browser `speechSynthesis` may read the currently displayed original text using its known language tag. Voice inventory, pronunciation and playback support vary by browser and OS; provide text as the accessible source, an explicit play/stop control, and a graceful unavailable state. Do not upload messages to a TTS vendor in this groundwork.
- **Translation:** current English/Hindi/Marathi UI labels do not translate free text. Keep teacher-authored original communication immutable. Any future translation should be a separate `student_update_translations` record keyed to the exact source update/version, with target language, draft/approved status, approver and timestamps. Label it “Translated”; always offer “View original.” Re-correction invalidates approval for the prior source version. Translation requires privacy review and an explicit quality workflow; never fabricate human-approved translations.
- **SMS/IVR:** later adapter only, after school and parent consent, phone verification, provider/data-processing review, locally approved language/templates, opt-out, status callbacks, bounded retries, deduplication and cost limits. Message only minimal notification text (no sensitive student detail); direct families to sign in. Delivery is `queued/sent/delivered/failed/unknown` evidence, not proof of reading. Add `notification_delivery_attempts` only when an approved channel is actually built.

## 8. Explainable indicators and pilot evidence

An “arrival recorded” indicator is based on a resolved, authorized reader event and shows reader/time plus any clock-quality warning. A “no check-in recorded yet” indicator is only a data-collection status after a school-defined time window and expected schedule; it is not equivalent to absent, late, unsafe, or unexcused. Show the rule and source, let staff correct/annotate through an audited path, account for alternate entrances, forgotten cards and opt-outs, and avoid student ranking or risk scores.

For a small consented pilot, measure operational evidence rather than surveillance: number of provisioned/revoked devices; reader-to-Pi durable-ack latency; Pi queue depth/age and recovery after a controlled internet outage; cloud receipt latency; duplicate/replay/conflict rejection; sequence gaps and clock offsets; unmatched/revoked credential handling; authorized Parent/Teacher/Principal visibility; and opt-in notification delivery outcomes if later approved. Use aggregated counts and synthetic data for the competition demo. Record test setup, date, build, simulator-vs-physical device, expected result, observed result and cleanup. Never claim physical hardware tested when only simulation ran.

Suggested demonstration: show a clearly labelled simulated check-in, show the same authorized event in Teacher/Parent/Principal views, disable Pi internet and demonstrate local durable queue only, restore internet and show one idempotent cloud receipt, then show a duplicate tap as retained-but-not-double-counted. State explicitly that remote family updates resume only after internet returns.

## 9. Task 32 implementation and test gate

1. Confirm the intended pilot workflow, school authorization/consent, sites/gates, data retention, and whether the Pi is the sole gateway.
2. Implement only the simulator and pure contract validation first; run against local isolated test data, never production. Refuse production URLs unless a separately approved production acceptance plan exists.
3. Threat-model enrollment, physical device compromise, secret rotation/revocation, school reassignment, replay, payload tampering, rate exhaustion, lost cards, clock drift, duplicate taps, sequence gaps, Pi disk-full, sudden power loss, internet outage, and recovery.
4. Add migrations only in a later approved implementation task. Test RLS/tenant isolation as Teacher in assigned/unassigned class, Parent linked/unlinked child, Principal own/other school, device active/revoked/other-school, and anonymous caller. Include `service_role` absence from client bundle and MCU/Pi reader API.
5. Verify same event retried returns the same receipt and one event; same event ID with changed body is rejected; repeated physical tap is transparently flagged; out-of-order queued events retain observed/received times and sequence gaps; a revoked card is not reattributed; unknown credential reveals no name.
6. Run outage tests at both links separately (reader↔Pi and Pi↔cloud), kill power before/after durable commit, restore connectivity, and assert queue recovery, bounded backoff, no silent loss, and idempotent replay. Confirm remote views do not claim updates while cloud is offline.
7. Verify authorized Realtime delivery plus refetch-after-reconnect, accessibility, English/Hindi/Marathi interface copy, original/approved-translation/view-original behavior, voice-unavailable behavior, and notification consent/opt-out if such adapters are in scope.
8. Collect privacy-safe pilot metrics, screenshots, simulator/physical labels, failure evidence, operator review procedure, and a rollback/disable plan before any production pilot.

## 10. Task 31 scope and handoff

This task adds architecture and a testable future contract only. It creates no tables, RPCs, endpoint, firmware, gateway, translation, speech, SMS integration, dashboard, dependency, or production setting. Existing production schema/data remain unchanged. Task 32 should begin with the hardware-free simulator and local tests, not a publicly reachable ingestion endpoint.
