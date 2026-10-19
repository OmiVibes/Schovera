# Task 32B-2 — Secure local RFID event ingestion

**Status:** Local-only backend and simulator integration. No RFID dashboard, physical reader, hosted Supabase change, or Vercel deployment is included. Every demo event is synthetic; a recorded reader event does not prove a student is physically safe.

## Data model and migrations

Migrations:

- `20261019100000_add_local_rfid_event_ingestion.sql`
- `20261019101500_return_persisted_rfid_receipt_time.sql`
- `20261019103000_allow_revoked_rfid_credential_reassignment.sql`

The feature adds four tables:

- `school_devices`: a school-owned reader/gateway, its label/type, Ed25519 verification public key, key version, active/revoked state and sequence high-water mark. Private keys never enter PostgreSQL.
- `student_credentials`: a school-scoped opaque card reference mapped to an existing student, version and activation/revocation metadata. Only one active mapping per school/reference and one active credential per student are allowed; after revocation, a reference may be reassigned while old event attribution stays unchanged. It is not a login credential. Store a keyed opaque reference, never a raw RC522 UID.
- `school_entry_events`: immutable resolved check-in/out observations. `observed_at` is device-reported; `received_at` is server/database time. It stores resolved student identity, not the presented credential reference.
- `device_event_receipts`: one durable result per `(device_id, device_event_id)`, canonical event hash, request nonce, outcome and receipt time. Unique nonce-per-device prevents a nonce being reused for a different event.

An unmatched/unknown/revoked/cross-school credential creates a generic receipt and no resolved arrival row. Revoking/replacing a credential never changes already-recorded student attribution. Events are deliberately separate from `attendance_records`; RFID never marks classroom attendance.

## Authorization and writes

`school_entry_events` has authenticated SELECT-only RLS: Parent uses active `parent_student_links`, Teacher uses an actively assigned class, Principal uses `same_school`. Anonymous access is absent. Browser roles have no table write grants. Device registry, credential mapping and receipts have no authenticated/anonymous read policy or grant.

Authenticated Principal-only security-definer RPCs:

- `provision_school_device(label, hardware_type, verification_public_key)`
- `revoke_school_device(device_id)`
- `issue_student_credential(student_id, opaque_ref, version)`
- `revoke_student_credential(credential_id)`

Each checks the caller’s active profile/role and current school, and writes an audit event. Replacement requires revocation first. The reader/API payload never supplies a school or student ID.

`process_school_entry_event(...)` is a narrow server-side security-definer writer executable only by `service_role`. It locks the device row, rechecks active status, derives school from that row, resolves a credential only within that school, records sequence state, then atomically writes the optional event and receipt. Same device/event ID + same canonical hash returns the durable original receipt; different content conflicts. Same nonce reused by another event conflicts. Device row locking serializes concurrent duplicate submissions. Out-of-order events are retained and flagged, not discarded.

No event table was added to the Realtime publication. Task 32C must first decide on a minimized change signal and verify each role’s RLS/refetch flow before enabling event Realtime.

## Version 1 local endpoint

`POST /api/device/v1/events` accepts one JSON object (not a batch), at most 16 KiB, with exactly these fields:

```json
{
  "schema_version": 1,
  "event_id": "f10f4d70-1e5a-4b98-9c18-2d30cedc0081",
  "device_id": "registered-device-uuid",
  "credential_ref": "opaque-school-scoped-reference",
  "event_type": "check_in",
  "observed_at": "2026-10-19T08:12:21+05:30",
  "device_sequence": 1842
}
```

Unknown fields—including `school_id`, `student_id`, names and raw card UID—are rejected. Device and event IDs must be UUIDs at the API boundary; `observed_at` must be timezone-qualified ISO-8601; event type is `check_in` or `check_out`; sequence is positive.

Authentication headers: `X-Schovera-Device-Id`, `X-Schovera-Timestamp` (Unix milliseconds), `X-Schovera-Nonce` (UUID), `X-Schovera-Signature` (base64 Ed25519 signature). Sign UTF-8 bytes of:

```text
POST
/api/device/v1/events
<timestamp>
<nonce>
<sha256 of exact HTTP body bytes>
```

The route rejects stale/future timestamps outside five minutes, invalid signatures, unknown/revoked devices, replayed nonces, oversized/malformed bodies, and a local in-memory limit of 60 authenticated events/device/minute. Responses contain only an opaque receipt ID, outcome, sequence state, receipt time and duplicate flag; never student names, IDs or credential references. Exact retry is HTTP 200; first processing is HTTP 202; changed event payload/nonce replay is HTTP 409; malformed/oversized input is HTTP 400/413; unauthorized device/signature is HTTP 403/401; rate limit is HTTP 429.

**Hard local-only gate:** the route is disabled unless both `SCHOVERA_RFID_API_MODE=local` and `SCHOVERA_TEST_MODE=local` are set, the configured Supabase URL is HTTP loopback, the HTTP Host is loopback, and server-only service credentials exist. `npm run dev:rfid-local` reads only `.env.development.local` and `.env.test.local`, validates matching loopback URL/key values, binds Next to `127.0.0.1`, and supplies the local service role only to the server process. The normal `npm run dev` continues clearing the service-role variable. No route can accept production/Vercel host traffic. Do not tunnel or expose this local server.

The limiter is process-memory only and resets on restart; it is not suitable for a multi-instance deployment. Local HTTP is loopback-only, not a production transport. Future deployment requires HTTPS, distributed rate limits, audited key rotation, device enrollment/revocation operations, abuse monitoring, backup/retention policy and an independently reviewed server boundary. Node’s Ed25519 verification is used instead of a hand-written signature comparison.

## Local setup and verification

Do not modify `.env.local`; never use hosted credentials. In PowerShell, from the repository root:

```powershell
npx supabase status                 # do not paste its output; it contains local keys
npm run test:rfid
npx supabase migration up --local   # only after confirming API and DB are loopback
npm run dev:rfid-local
```

In another PowerShell window:

```powershell
npm run test:rfid:integration
```

The integration test refuses non-loopback Supabase/app targets and creates uniquely named synthetic schools, classes, students, Auth users, keys and credential references. It invokes the existing Task 32A simulator in explicit `--local-api` mode, tests database/auth/RLS behavior, and removes its controlled records in `finally`. It does not use the seeded natural demo school or touch classroom attendance. It requires local Supabase already migrated and the local server already started; failure to start services is an environment failure, not a test pass. Do not run `supabase link`, remote `db push` or any remote reset.

The simulator’s API mode requires all of `--local-api`, `--target` (loopback only), `--device-id`, `--private-key-file`, `--sequence-start`, and optionally `--credential-ref`; its caller must explicitly set local mode variables. The integration verifier is the supported end-to-end demonstration because it provisions a temporary Principal-authorized synthetic device/student, runs check-in/out through the simulator CLI and cleans up its private key and test database rows. Offline Task 32A scenarios continue to run with no environment files/network access.

## Test coverage

The local integration verifier covers:

- Ed25519-valid synthetic check-in/check-out through the simulator and Next endpoint.
- Exact retry, changed-payload conflict, concurrent same-event retries, nonce replay, stale timestamp, invalid signature, oversized body, unexpected identity fields and invalid event type.
- Unknown, revoked and cross-school credential behavior; device revocation; historical attribution after credential replacement; sequence gaps/out-of-order retention; server and device timestamps.
- Parent linked/unlinked-child RLS, Teacher assigned/unassigned-class RLS, Principal same/cross-school RLS, anonymous read, denied browser inserts/credential access, and no classroom attendance mutation.
- Cleanup of temporary events, receipts, credentials, devices, audits, relationships, students, classes, test users and schools.

### Recorded verification (2026-10-19)

- Local migration up applied the three migrations incrementally; all 19 migrations show applied to the local database. A fresh `db reset` replay was intentionally skipped to preserve the existing seeded local demo database.
- `npx supabase db lint --local`: passed, no schema errors.
- `npm run test:rfid`: passed, 19 unit/helper tests; offline simulator check-in/check-out scenario passed.
- `npm run test:rfid:integration`: passed, including simulator CLI delivery, exact retry, concurrent retries, reassignment, RLS, all temporary-data cleanup checks, and a forged non-loopback Host rejection. A few earlier harness attempts exposed and fixed a head-count assertion and a wrong revoked-credential fixture; final run passed.
- `npm run verify:student-profile`: passed. `npm run verify:phase1`: first encountered the already-known transient Realtime preflight timeout; independent rerun passed. `npm run verify:reconnect`: first attempt hit a 15-second section-navigation timeout; independent rerun passed all role recovery/profile/attendance/homework/timetable checks.
- `npm run typecheck`, `npm run lint`, and `npm run build:local-check`: passed. The safe build wrapper forces loopback public Supabase values and clears service-role/AI secrets without editing `.env.local`.
- `npm run simulate:rfid -- --target https://schovera.vercel.app`: refused before HTTP delivery. No production or Vercel requests/writes were made.

No production DB, public endpoint, real student data, paid provider, hardware library or new npm dependency is involved. No physical RFID reader has been tested.

## Rollback and Task 32C gate

There is no hosted rollback because no hosted change is authorized or performed. For a local throwaway database, use the existing guarded local reset only after verifying that erasing local demo data is intended. Do not manually drop these tables in a linked/hosted project. The schema’s FK order is receipts → events → credentials/devices → schools.

Task 32C may begin only after the local integration suite passes and the team agrees on authorized event projection, privacy-safe UI language, timestamp/clock-quality presentation, and a minimal Realtime signal followed by RLS refetch. Do not label a tap as attendance, present, safe, absent or late without a separately approved policy and human review.
