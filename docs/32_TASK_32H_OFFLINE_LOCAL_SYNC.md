# Task 32H — Durable offline gateway to local Supabase sync

**Status:** implemented and verified with synthetic records against the loopback-only local Next.js/API and local Supabase stack. This is not a hosted gateway, production endpoint, real-student pilot, or physical reader test.

## What is covered

The durable Task 32E SQLite outbox can sync schema-v2 events through `LocalSupabaseV2Transport` to the local-only `/api/device/v2/events` route. The transport refuses non-loopback destinations, sends one event per request, signs the exact canonical payload with Ed25519 plus a fresh request timestamp and nonce, and validates a bounded response before treating it as a receipt. Retries preserve the event ID and canonical payload; each HTTP attempt gets a new nonce. Accepted receipts mark the durable queue row delivered. An unresolved receipt remains in attention-required state and is not presented as a named event. Transient failures remain queued under bounded retry/backoff. The gateway child process is started with a minimal environment and does not inherit the service-role, capability-issuer or AI keys.

The end-to-end suite is `npm run test:gateway:local-integration`. It uses a temporary SQLite database and uniquely named synthetic schools, classes, students, accounts, device keys and credentials. It exercises offline persistence/reopen, local API sync, exact retry/idempotency, revoked-assignment unresolved handling after credential reassignment, new-assignment sync, role RLS, Parent browser views, no attendance mutation, and cleanup. No public Realtime subscription is involved.

## Task 32H-DIAG-3 finding

The synthetic linked Parent fixture did not disappear. The intentionally unlinked Parent and unassigned Teacher correctly receive no named records. The School Entry panel short-circuits when no child/class context is selected and shows the relevant choose-context prompt; `data-loaded` remains false in this state by design. The diagnostic test had incorrectly treated that as a failed load.

An additional diagnostic-only assertion race was fixed: Playwright does not await asynchronous `page.on('response')` callbacks. The integration now waits until the callback has parsed the response and captured the actual browser-token snapshot before closing the account context. Independent local PostgreSQL, direct RLS, browser-token and UI assertions show the linked Parent fixture is present before dashboard checks and immediately before cleanup. Three consecutive full Task 32H integration runs passed after this fix. See [Task 32H-DIAG-3 evidence](32_TASK_32H_DIAG3_SYNTHETIC_FIXTURE.md).

## Boundaries and outstanding work

- Only loopback HTTP is supported. Do not tunnel or expose the local server.
- No hosted Supabase credentials, hosted database, Vercel deployment, or production API is used.
- Offline-to-cloud delivery remains at-least-once with idempotent server receipts, not exactly-once transport.
- Device capability expiration, revocation, unknown assignments, and unresolved outcomes require operator attention; they do not create a named event.
- The Task 32I dashboard polling task is separate. The current School Entry panel refreshes on open/context/filter, manual refresh, focus/visibility and reconnect; this Task 32H suite does not claim automatic periodic dashboard refresh.
- No physical Pi, reader, power-loss behavior, or real card was tested.

The detailed event-v2 authorization and receipt contract is in [Task 32G](31_TASK_32G_RFID_EVENT_V2_IMPLEMENTATION.md); local Supabase setup and credentials safeguards are in [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md).
