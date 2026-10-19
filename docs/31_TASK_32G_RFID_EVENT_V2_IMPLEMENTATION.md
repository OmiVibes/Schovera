# Task 32G — Secure local RFID event v2 attribution

**Status:** implemented and verified against isolated local Supabase using synthetic records. This does not connect the durable gateway, use a physical reader, authorize a student pilot, modify hosted Supabase/Vercel, or change production data.

**Baseline:** `0efa0bdbc113cec0920b254590e9189b8f6c2ea7` (`fix/task32f1-isolated-build`). Work is on `feat/task32g-rfid-event-v2`.

## Implementation

Event v2 lives separately at `POST /api/device/v2/events`. The strict JSON contract is version 2 and requires the event UUID, registered device UUID, opaque per-issuance credential reference, immutable `credential_assignment_id`, assignment version, signed assignment capability, event type, timezone-qualified observed time, and positive device sequence. It optionally accepts `gateway_receipt_id`. It rejects unknown fields, including student/school identity fields. The gateway receipt reference is currently metadata only; this task does not connect the durable gateway.

Device request authentication remains Ed25519 over the HTTP method, exact versioned route, timestamp, fresh nonce, and SHA-256 digest of the exact body bytes. The route requires explicit local-mode flags, loopback Supabase URL and HTTP Host, a local service key, strict 16 KiB body limit, active registered device, active capability signing key, five-minute request freshness, and the existing local per-process rate limiter. It does not accept remote destinations. Responses contain only opaque receipt ID, result, sequence state, server receipt time, and duplicate flag.

`POST /api/device/v2/capability-keys` and `/api/device/v2/capabilities` are local-only. Both require an authenticated Supabase user. The key registration RPC and capability-claims RPC independently require an active same-school Principal. The issuer returns no child name or student ID; it resolves the immutable assignment server-side and signs an Ed25519 capability binding assignment ID/version, opaque ref, device, school, key ID, and a seven-day validity window. No browser or device receives the issuer private key. Key IDs are school-scoped; a Principal can register/revoke keys only for their own school. Rotation means registering a new key ID, updating the issuer keypair, then revoking the old key.

Generate an isolated synthetic local issuer keypair with `npm run rfid:capability-key:init`. It is written under `.local/schovera-rfid-gateway/`, which is ignored by Git. Only the public key is printed. The command refuses to overwrite an existing pair. This local file-based custody is for development only; it is not a production KMS or hardware-backed key store. `npm run dev:rfid-local` loads that ignored private key only when `.env.local` is absent; it now refuses to start when `.env.local` exists because Next.js may load it. The integration test invokes the Next route handlers directly with loopback Host headers, so it does not start Next or load Next's `.env.local` discovery path. An HTTP/UI server test must use a disposable clean checkout with no private environment files.

## Migrations and transaction behavior

The nine additive Task 32G migrations are:

- `20261020100000_add_rfid_event_v2_attribution.sql`
- `20261020101500_harden_rfid_v2_tenant_keys_and_locks.sql`
- `20261020103000_remove_unused_capability_claim_variable.sql`
- `20261020104500_keep_unrecognized_assignment_receipts.sql`
- `20261020105000_freeze_rfid_assignment_and_event_identity.sql`
- `20261020106000_retain_unresolved_rfid_event_evidence.sql`
- `20261020107000_revoke_public_capability_key_access.sql`
- `20261020108000_require_complete_unresolved_receipt_metadata.sql`
- `20261020109000_preserve_expired_capability_receipts.sql`

They add a school-scoped signing-key registry with no browser read grants, assignment IDs on new resolved events, private receipt evidence, and a service-role-only atomic v2 processor. Existing events are not rewritten: their new assignment ID remains `NULL`. Existing RLS policies and grants for resolved events remain unchanged. Parents continue to read only linked children; Teachers read currently assigned classes; Principals read their school. No classroom attendance field or table is written.

Processing locks the device, active signing-key row, exact assignment row, and student row. The assignment's `student_id`, reference, version, and assignment ID are immutable. Accepted school-entry rows cannot be updated. If the assignment is revoked before the v2 transaction obtains its lock, the processor writes an `unresolved` private receipt and no named event. If processing obtains the assignment lock first, it records the historical assignment, and a subsequent revocation cannot change that event. It never searches for a new credential owner by reference. Existing active mappings can be retired and the same synthetic opaque reference reused under a new assignment; old delayed v2 events remain bound to the old assignment and cannot resolve to the new student.

Unresolved receipts retain only the payload hash, device/event IDs, request nonce, assignment UUID (without a student FK), key ID, event type, device-observed timestamp, sequence, optional gateway receipt UUID, a coarse private reason (`capability_outside_validity`, `capability_key_unavailable`, `assignment_unavailable`, or `student_inactive`), outcome and server receipt time. A cryptographically valid but expired/not-yet-valid capability is retained as unresolved; its signature and event bindings must still verify. Tampered/unsupported capabilities are rejected before writing. The receipt table has no authenticated/anonymous access. An unknown or removed assignment can therefore leave a privacy-minimized record without a false FK or a student-linked event. No human-review interface or resolution RPC is included. Review authority, retention duration, deletion operations, and appeal procedures remain organizational decisions before any real pilot.

## V1 compatibility

`POST /api/device/v1/events` returns local-only `410 Gone` with a migration message. V1 has no assignment ID or signed assignment capability; using its active-reference lookup for delayed events can attribute an old scan to a newly assigned child. It is not accepted for “online-only” named attribution because device-observed timestamps cannot prove when a scan occurred. The v1 database RPC and historical records are retained for compatibility/history, but the HTTP route no longer invokes it. The Task 32A in-memory simulator remains useful for offline policy demonstrations; its old `--local-api` v1 delivery mode is retired. Do not silently reinterpret v1 as v2.

The Task 32C Parent/Teacher/Principal dashboard query and presentation schema is unchanged. Only resolved `school_entry_events` rows appear there; unresolved receipt-only observations never appear under a child's name. This task's integration test verifies role-scoped persisted reads and unchanged event columns, but does not repeat the historical Playwright dashboard interaction/visual suite because the v2 verifier invokes route handlers directly and no isolated Next development server was started.

## Local setup and verification

From PowerShell at the repository root, confirm the Supabase CLI endpoints are loopback without sharing its output, then apply only local migrations:

```powershell
npx supabase status # keep output private; contains local keys
npx supabase migration up --local
npx supabase db lint --local
npm run rfid:capability-key:init # once per local issuer keypair
npm run test:rfid
npm run test:credential-attribution
npm run test:gateway
npm run test:rfid:integration
```

`npm run test:rfid:integration` (also `npm run test:rfid:v2-integration`) requires the ignored local capability keypair and `.env.test.local`. It explicitly checks local-mode/loopback configuration before creating temporary synthetic schools, principals, parent/teacher accounts, students, devices, assignments, and keys. It exercises the key-registration and capability-issuance handlers, signature and schema failures, legacy-v1 refusal, v2 check-in/out, delayed A event after reassignment to B, unknown assignment, inactive student, stale observed time, nonce replay, exact retry, changed-payload retry conflict, concurrent duplicate requests, concurrent revoke/sync, signing-key revocation, RLS and denied browser writes/receipt reads, attendance non-mutation, and cleanup. Synthetic keys/rows are removed in `finally`; cleanup verifies no synthetic schools remain. It uses no Next server, `.env.local`, hosted Supabase, Vercel, or physical hardware.

Other checks:

```powershell
npm run verify:student-profile
npm run verify:reconnect
npm run typecheck
npm run lint
npm run build:isolated
```

The Student Profile and reconnect browser verifiers require the local app to be running. They were not run as part of this API/RLS integration pass; no potentially environment-discovering Next development server was started in the developer checkout. `build:isolated` runs only after the Task 32G files are committed because its clean snapshot intentionally contains tracked committed files only. The isolated build checks route manifests, TypeScript and synthetic leakage sentinels, not hosted runtime configuration or the recorded Next.js security advisory.

## Verification record

- `npx supabase migration up --local`: all nine Task 32G migrations applied incrementally; the final rerun reported no pending migrations. No reset/replay was used, preserving local demo data.
- `npx supabase db lint --local`: passed with no schema errors.
- `npm run test:rfid`: 22 tests passed.
- `npm run test:credential-attribution`: 20 tests passed.
- `npm run test:gateway`: 34 tests passed; this exercises the isolated fake transport only, not API delivery.
- `npm run test:rfid:integration`: passed against local Supabase using synthetic records; temporary data cleanup passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings on the final source.
- Vitest route-handler integration resolves Next's `server-only` marker to a test-only no-op module; the actual route module retains the marker for Next's server/client boundary checks.
- `npm run verify:student-profile` and `npm run verify:reconnect`: not run; no isolated local Next server was started.
- `npm run build:isolated`: passed on commit `b4dd86f29fa59d3ae758a22ebd117c49cd392fc6`; all expected routes and TypeScript compiled, synthetic private sentinels were absent, only the explicitly allowlisted Google Fonts hosts were reached through the build proxy, and the temporary snapshot was cleaned.

These are local software tests. They do not test physical taps, reader/gateway authentication, the durable gateway, network outage recovery, real school consent, UI visual quality, or production.

## Task 32H gate

Task 32H must separately define and test the gateway-to-v2 sync client, queue behavior on expired/revoked capabilities, receipt confirmation and crash windows, renewal/rotation/revocation while offline, and whether a gateway can securely obtain enrollment snapshots. It must remain synthetic/local with loopback guards. Do not connect the existing durable gateway until those decisions and tests pass. A production path additionally needs independent security review, production key custody, hosted HTTPS, distributed rate limits, monitoring, approved retention/privacy operations, and closure of the recorded Next.js advisory.
