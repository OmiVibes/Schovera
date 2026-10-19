# Task 32F — Offline credential attribution and revocation safety

**Status:** design and synthetic pure-policy proof only. No Supabase migration, RPC, route, dashboard, hosted environment, or real-student data changed. The proof does not establish physical-reader or gateway security.

**Baseline:** `e684366f8b918be8206995fca60620749d307277` (`feat/task32e-durable-offline-gateway`). Work is isolated on `feat/task32f-credential-attribution-design`.

## Verified failure in the current v1 flow

The v1 request contains `credential_ref` but no immutable credential-assignment identifier. In `process_school_entry_event`, the server looks up the row active at processing time:

```sql
where school_id = device_row.school_id
  and credential_ref = p_credential_ref
  and revoked_at is null
```

Migration `20261019103000_allow_revoked_rfid_credential_reassignment.sql` intentionally permits a revoked `credential_ref` to be issued again. Therefore, if A's credential is revoked, the reference is assigned to B, and an older queued v1 event arrives afterward, the lookup selects B and stores B's `student_id`. That is a real attribution ambiguity and can become a wrong-child association.

`observed_at` does not repair this. It is supplied by the reader and may be stale, drifted, or deliberately changed. The request signature proves that the registered device key signed the payload; it does not prove when the scan occurred or that a human/card interaction happened. The route's signed-request timestamp is a freshness check on the HTTP attempt, not a trusted tap time.

The existing RPC locks the device row to serialize that device's event processing and, in the newest migration, reads the credential row `FOR SHARE` so concurrent revocation/reassignment cannot change the row mid-transaction. Those locks make each transaction coherent, but they do not recover which assignment a prior offline tap meant. Once reassignment has committed, a v1 reference-only event resolves to the new active mapping. Already persisted `school_entry_events.student_id` values remain unchanged after later revocation; the bug concerns delayed, not-yet-processed events.

## Scenario outcomes today

| Scenario | Current v1 result / trust boundary |
|---|---|
| A's event is processed while A's mapping is active | Accepted for A; resolved student ID and credential version are persisted. |
| A's event waits offline; A's mapping is revoked; the reference is not reused | Generic `unmatched` receipt; no resolved entry row. |
| A's event waits offline; the same reference is reassigned to B | **Accepted for B** if B's mapping is active on receipt. This is the confirmed wrong-attribution path. |
| The device changes `observed_at` to a time before reassignment | No protection; the lookup still resolves the current active mapping. Timestamp quality may be marked uncertain, but is not used to select a historical owner. |
| Exact event is submitted again | Existing receipt/hash returns its original result; same ID with changed payload conflicts. This protects retries, not assignment identity. |
| Sequence is delayed/out of order | Event is retained and flagged; sequence is not a credential ownership proof. |
| Student transfers/deactivates before sync | Current credential match may exist but the inactive student check produces `unmatched`; school/transfer workflow is not an event-time identity proof. |
| Reader/gateway key is compromised | The attacker can sign fabricated payloads as that device until it is revoked. Signatures do not prove a card was tapped. |
| Revocation races a sync | Row locking serializes the database transaction. If event processing wins, the old mapping is persisted; if revocation/reassignment wins first, the current-reference lookup can select B. Locking alone cannot distinguish an old queued scan from a new scan. |

## Options considered

| Option | Strengths | Weaknesses / trust required |
|---|---|---|
| A. Put an assignment UUID/version in the event | Small payload and a durable pointer to the exact historical row; no device timestamp inference. | A naked UUID is not authorization. A compromised reader could claim any identifier it knows. The server must verify the assignment, credential reference, school and device binding; revoked assignments still need a conservative policy. |
| B. Gateway enrollment snapshot | The gateway can retain a stable local mapping while offline and attach the assignment selected at scan time. A signed manifest prevents undetected edits. | A local snapshot alone is self-asserted. A compromised reader/gateway may alter it or invent old taps. Secure key storage and snapshot rotation are operational requirements. |
| C. Server-side credential history plus timestamp lookup | Preserves assignment history and supports audit. | Device time cannot safely select the owner. Timestamp-window policies create boundary races, do not prove a scan occurred in-window, and may assign an old event to the wrong child. History is necessary but insufficient evidence. |
| D. Hold uncertain events for review | Avoids silently attributing a delayed/revoked event to a new child. Keeps a clear safety boundary and supports manual investigation. | Delays family visibility and requires a staffed review process. Unresolved items must not be represented as attendance, arrival, absence, or safety status. |

## Recommendation: immutable assignment plus signed, device-bound capability; unresolved after revocation

For the smallest defensible supervised prototype, use an immutable credential-assignment row as the identity anchor and a short-lived server-signed assignment capability distributed to the authorized gateway during provisioning/snapshot refresh.

The token is an authorization context, **not** a secret and **not** proof of a physical scan. It should be signed by a server-controlled Ed25519 key and bind at least:

- token version and signing `key_id`;
- immutable `credential_assignment_id` and assignment version;
- opaque `credential_ref`;
- registered `device_id` and school scope;
- `not_before` and expiry.

It contains no student name or student ID. The server—not the reader—derives the student from the exact assignment row. An event's assignment ID must match the signed token, credential reference, authenticated device and school. Unsupported versions, bad signatures, unknown assignments, cross-school bindings, mismatched references and expired capabilities are unresolved/rejected, never guessed from `observed_at`.

On cloud receipt, automatically attribute only if the exact assignment still exists, matches all token/event bindings, its student remains eligible under the approved policy, and it was active at the serialized server transaction. If that exact assignment was revoked before processing, store a privacy-minimized unresolved receipt and do not create a parent/teacher-visible resolved event. Do not look up the current active assignment by `credential_ref` as a fallback. A staff review may later make an audited resolution; it must create a separate review/resolution record and preserve the original immutable envelope and receipt.

Use a fresh opaque reference for each issuance; never recycle an old reference for a different child in normal operations. If a school must reuse a physical card, derive a new assignment-scoped opaque reference and provision a new signed snapshot. Even if an old reference is accidentally reused, the old assignment ID can never silently become the new owner's ID: old-assignment events become unresolved after revocation. Historical accepted event rows remain linked to their original assignment.

This prevents a reader from *inventing* an arbitrary historical assignment without a valid server signature. It cannot prevent a compromised reader from replaying/forging observations for a valid capability already provisioned to that device. A device compromise requires immediate device revocation and quarantine/review of events since the last trusted point. Basic RC522 UIDs are clonable; a valid device signature is not proof of the person or physical tap. A hardware-backed monotonic clock/counter and non-exportable key could strengthen evidence, but are not present or assumed here. If the evidence is uncertain, the only safe automatic outcome is unresolved.

### Attribution evidence policy

Sufficient for *automatic mapping to an assignment* in the prototype means: valid gateway/device request authentication; a valid server-signed capability bound to this registered device and school; exact capability/event/database assignment ID, version and opaque reference match; active assignment at the serialized receipt transaction; valid event schema; and no idempotency conflict. It means “this authenticated gateway asserted an event under this assignment,” **not** “the named child personally tapped” or “the child was safe/present.”

If the assignment is revoked before sync, the capability expired, its binding is incomplete, a device was revoked, a credential was reassigned, the database disagrees, or compromise is suspected, return/record an unresolved outcome with no student identity in the device response. Do not accept `observed_at` as a way to override revocation. A future audited human review may use school records and retained evidence; absent that review, the event stays unresolved.

## Proposed versioned event contract (do not change v1 in this task)

V2 is required for delayed events because v1 has no event-time assignment reference. Proposed event envelope:

```json
{
  "schema_version": 2,
  "event_id": "f10f4d70-1e5a-4b98-9c18-2d30cedc0081",
  "device_id": "registered-device-uuid",
  "credential_ref": "opaque-per-issuance-reference",
  "credential_assignment_id": "immutable-assignment-uuid",
  "credential_assignment_version": 3,
  "assignment_capability": "<server-signed opaque capability>",
  "event_type": "check_in",
  "observed_at": "2026-10-19T08:12:21+05:30",
  "device_sequence": 1842,
  "gateway_receipt_id": "opaque-local-receipt-uuid"
}
```

The capability is signed server-to-gateway enrollment evidence. The gateway's event signature is a separate gateway-to-cloud authentication layer over the exact canonical v2 body, request timestamp and fresh nonce. Reader-to-gateway authentication is a third, separate local-link credential; it must not share the cloud key. Supabase service-role credentials are never placed on a reader or gateway. The API derives tenant scope from registered device state, not the payload.

The gateway's local receipt time and device `observed_at` are evidence, not trusted wall-clock proof. The server always stores its own `received_at`; sequence gaps/order remain flags. An event's immutable assignment/capability evidence is included in the canonical hash, so same event ID plus changed assignment proof conflicts. Same ID/hash returns the original durable receipt. Replayed signed requests still require nonce protection; deduplication remains necessary.

Example outcomes:

- **Valid/current:** exact signed capability and assignment are still active at receipt → `attributed` internally; API response contains only opaque receipt/outcome fields.
- **Revoked before delayed sync:** capability points to A but A's assignment is revoked → `unresolved`; no resolved event row and no fallback to B.
- **Reassigned:** B has a new assignment ID/version and new opaque reference/capability. B's new events resolve to B; A's delayed old assignment stays unresolved.
- **Delayed with uncertain clock:** do not infer ownership from the time. If exact assignment is still active and all bindings pass, it may map to that assignment under the stated assertion; if revoked/expired/ambiguous, it remains unresolved.
- **Unknown or cross-school:** generic unresolved receipt; no name, student ID, or credential mapping is returned.
- **Forged/unsupported version or changed assignment on replay:** reject/hold; never search by reference and choose another row.

## Future data model and transaction changes (proposal only)

No migration is added now. For a later reviewed implementation:

1. Keep `student_credentials.id` as the immutable assignment identifier; formalize issuance as immutable history, enforce a unique `(school_id, credential_ref, credential_version)` history key, and make the issuance RPC allocate/validate monotonically increasing versions. Add an explicit reason/operator audit metadata for revocation. Continue one-active-reference and one-active-credential-per-student constraints.
2. Add `school_entry_events.credential_assignment_id` as a non-null FK to the exact `student_credentials` row, retain `credential_version` during migration/backfill, and prevent update/delete of the assignment relationship for an accepted event. Historical event `student_id` remains consistent with the referenced assignment.
3. Extend the server-only receipt model to distinguish generic `unmatched` from `unresolved_review`, bind the canonical payload hash to assignment ID/version/capability, and retain only the minimum opaque evidence required by the approved retention policy. Never expose receipt/token material to browser roles.
4. For human resolution, add a separate audited review record or narrowly scoped Principal RPC. The original receipt/event bytes remain immutable; reviewer, decision, reason and time are appended. Only resolved rows with a verified student relationship become visible through the existing Parent-linked-child, Teacher-assigned-class and Principal-same-school RLS. Do not broaden existing RLS to read credentials or receipts.
5. Keep device enrollment/revocation in `school_devices` unless the server signing-key design requires a carefully scoped `key_id` registry. Private signing keys stay in server secret storage; public verification keys and rotation metadata are versioned. During rotation retain old public keys only for the bounded capability lifetime/verification window; after compromise revoke immediately and leave affected events unresolved.
6. In one transaction, authenticate the device, deduplicate by device/event ID and payload hash, lock/recheck device state, verify signed capability bindings, lock the exact assignment row `FOR SHARE`, and resolve only that row. The credential revocation RPC's row update then serializes cleanly: processing commits first → immutable event maps to A; revocation commits first → receipt is unresolved. Never perform a second lookup by active reference after the exact row fails.

The current RLS boundary remains unchanged: Parent sees only linked children, Teacher only currently assigned classes, Principal only same-school rows, and anonymous/browser clients cannot read device/credential/receipt tables or write events. Device ingestion stays server-only. Events remain separate from classroom attendance.

## Principal/operator workflow

1. Verify the student and physical card through the school's approved identity process; issue a fresh opaque per-issuance reference. Never store a raw card UID or student data on the card.
2. A same-school Principal (or later explicitly delegated operator) issues the immutable assignment through the server RPC. The server returns a device/school-scoped signed capability to an authenticated enrollment channel.
3. The gateway stores the signed snapshot with its version/expiry and never exposes the roster. Confirm the intended device received the matching entry, then perform a synthetic test.
4. For replacement/loss/transfer, revoke the assignment and device as appropriate, record an audit reason, issue a new assignment/reference, and do not recycle the previous reference. Family opt-out removes/revokes the mapping under policy; no scan is inferred.
5. If an old offline event arrives after revocation, it remains unresolved and invisible to family role views. A trained Principal reviews it using a separate audit action; no automatic timestamp override. If device compromise is suspected, revoke the device and quarantine its affected sequence/time range for manual review.

## Synthetic pure proof-of-concept

`scripts/rfid-attribution/attribution.mjs` and `attribution.test.mjs` model a versioned v2 event and verify a test Ed25519 assignment capability bound to device, school, assignment, reference, version and time window. The policy helper is pure: it does not call Supabase, read `.env*`, open a network connection, or authenticate a production device. Its generated keys and synthetic student/credential identifiers exist only in test memory.

Scenarios covered: pre-reassignment A; post-reassignment B under a new immutable assignment; old delayed assignment after reference reuse; untrusted timestamp; legacy v1; unknown/forged assignment; capability binding/signature tampering; credential mismatch; cross-school mapping; replay and changed assignment evidence; lost/replaced credential; device revocation; sync-vs-revoke ordering; inactive student; identity fields rejected. These tests validate policy decisions, **not** actual concurrent PostgreSQL locks, deployed signing-key custody, hardware authentication, physical taps or production behavior.

## Build-isolation investigation (separate from attribution)

`scripts/build-local-check.mjs` explicitly reads only `.env.development.local`, validates its Supabase URL is HTTP loopback, sets the two public Supabase variables from that local file, and sets `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` to empty strings before spawning Next. It does **not** explicitly read `.env.local`.

However, Next's production build calls `@next/env.loadEnvConfig(projectDir, false, ...)`. The installed Next env loader selects `.env.production.local`, `.env.local`, `.env.production` and `.env`; `.env.local` is read if present. The earlier Task 32E build output `Environments: .env.local` is evidence of discovery, and the loader source confirms it parses these files. Existing process values take precedence for names already set, so the wrapper's loopback URL/publishable key and blank service/OpenAI keys are not overwritten. But other keys absent from the wrapper's process environment can be loaded from `.env.local`. Any `NEXT_PUBLIC_*` values can be inlined into browser output; other variables are available to build-time server rendering/code. The actual `.env.local` keys/values were not inspected or printed, so whether it contains additional production credentials is unknown. It therefore cannot be certified safe to run the build in this repository under the explicit no-production-credentials constraint.

The source scan found the app's Supabase client reads the two expected public variables; the local-check wrapper overrides both. The device/teacher-AI server routes use the exact service-role/OpenAI names the wrapper blanks. That reduces known exposure but does not establish a complete allowlist for every environment variable or build-time execution path. `.env.local` was not modified.

**Task 32F-1 superseding update:** `npm run build:isolated` (and the backward-compatible `npm run build:local-check`) now creates a temporary snapshot from committed tracked files only, removes all private/developer environment files and local artifacts from that snapshot, installs dependencies inside it offline from the lockfile, and runs Next with an allowlisted environment plus synthetic leakage sentinels. It permits only the existing `next/font/google` build path through a loopback egress proxy allowlist; this proxy is not an OS-level network sandbox. The snapshot verifies that `.env.production` is its sole environment file, that expected routes are present, that Next did not report `.env.local`, and that synthetic private sentinels are absent from build output. It cleans its exact generated temp directory in `finally`. See [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md) for commands and limitations. The developer checkout's `.env.local` is neither opened nor copied. This does not certify a hosted deployment or resolve the recorded Next.js security advisory.

## Verification and Task 32G gate

Run the synthetic policy test with `npm run test:credential-attribution`; also run existing `npm run test:rfid`, `npm run test:gateway`, `npm run typecheck`, `npm run lint`, and `npm run build:isolated`. The isolated build validates local compilation only; it is not production acceptance.

Task 32G remains **blocked** until the team approves the event-v2 capability issuer/key custody, active-only auto-attribution and unresolved-after-revocation policy, credential non-reuse workflow, and retention/review process. The safe isolated build route is now implemented and verified separately. Then implement migrations/RPC only on local Supabase and add integration cases for actual concurrent revoke/sync, all role RLS, changed capability replay, server key rotation/revocation, cleanup and no attendance mutation. Do not use hosted Supabase, Vercel, real students, or physical cards for that acceptance.

No decision here authorizes a student pilot, hosted ingestion, production migrations, event Realtime, dashboard changes, or deployment.
