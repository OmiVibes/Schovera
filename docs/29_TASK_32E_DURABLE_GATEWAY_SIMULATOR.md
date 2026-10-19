# Task 32E — Durable offline gateway simulator

**Status:** implemented as a laptop-local, hardware-free simulator using synthetic values only. This is not a Raspberry Pi service, physical RFID integration, production security boundary, hosted sync feature, or student pilot. No listener is started and no network delivery is implemented.

**Baseline:** Task 32D commit `4e160316ec379d263c6707b4806b9cd54be8c2db`. Work is on `feat/task32e-durable-offline-gateway`.

## Architecture and files

- `scripts/rfid-gateway/storage.mjs` — versioned SQLite schema, WAL/foreign-key configuration, transactional inserts, queue state and status summaries.
- `scripts/rfid-gateway/ingress.mjs` — event validation using the Task 32A contract, synthetic reader authentication, idempotency, sequence state and commit-before-ack behavior.
- `scripts/rfid-gateway/transport.mjs` — narrow one-event transport abstraction and an in-process fake destination. It never opens a socket. The fake destination can accept, be offline, rate-limit, reject, or accept then lose a response.
- `scripts/rfid-gateway/runtime.mjs` and `cli.mjs` — local operator commands. They do not load `.env*`, initialize Supabase, or run a web server.
- `scripts/rfid-gateway/gateway.test.mjs` — temporary-database fault and recovery tests.

The default database and synthetic-reader key file are placed in the Git-ignored `.local/schovera-rfid-gateway/` directory. The key file contains only a randomly generated synthetic-reader secret. The database stores only its SHA-256 hash. No child names, raw card UIDs, school IDs, hosted credentials or personal data are stored. The local test database has no attendance table and is not connected to the Schovera Supabase schema.

## SQLite and queue semantics

SQLite's built-in `node:sqlite` `DatabaseSync` implementation avoids adding a native npm dependency. The gateway commands require Node 22.13 or later; the checked development runtime is Node 22.18. Node still labels this built-in API experimental, so the command suppresses only its runtime warning; this does not make the API stable. The application's normal Next.js engine declaration is unchanged. A future maintained SQLite package can be evaluated if Node's API changes or a stable API is required.

The database uses WAL, `synchronous=FULL`, foreign-key enforcement, a five-second busy timeout, `BEGIN IMMEDIATE` transactions, schema `user_version=1`, integrity checking on open, and bounded queue capacity (default 10,000 retained records). Unsupported schema versions and corruption fail closed; files are left in place for review. Network-share/UNC storage paths are rejected.

`gateway_events` stores the immutable canonical event, payload hash, reader sequence, device-observed time, sequence classification, local receipt, queue state, attempts, retry schedule/error class, and eventual *fake-only* destination receipt. Uniqueness on `(device_id,event_id)` prevents duplicate observations; a second uniqueness constraint prevents a reader sequence from being consumed by two distinct events. New valid events commit together with their nonce before an acknowledgement is returned. A write/transaction failure yields no success acknowledgement. A process failure after commit but before acknowledgement is recoverable by resending the same event ID; it returns the original receipt. Reusing an event ID with changed content is a conflict.

Different taps are different observations and need distinct event IDs and sequences. Transport retries preserve the original event ID and payload. Sequence gaps and out-of-order submissions are retained with an explanatory flag; they are never dropped to force a clean sequence.

Queue states:

| State | Meaning |
|---|---|
| `pending` | Durably held locally; not confirmed by any destination. Offline/transient errors retain it with bounded retry metadata. |
| `delivered` | The in-process fake destination returned a definitive receipt and the local receipt was committed. This is not cloud delivery. |
| `attention` | A permanent fake-destination error or retry limit requires operator review. The original payload remains retained. |

The fake destination persists its synthetic receipt in the same local test database to simulate the “destination accepted but response was lost” crash window. It is intentionally not evidence of remote acceptance.

## Synthetic reader authentication and limits

Reader submissions are HMAC-SHA256 authenticated using a random local-only synthetic reader secret, a fresh timestamp and nonce, and the canonical event hash. A constant-time comparison is used for the MAC. The registered reader can be revoked; revoked credentials cannot submit. The CLI does not print the secret. The identity file is created with restrictive POSIX permissions where supported; on Windows it inherits the current user's directory ACL. This is a development convenience, not a hardened key store, secure element, mutual TLS or protection from a compromised laptop administrator. Never reuse this key for hardware or a real school.

This local adapter deliberately accepts the validated event object rather than opening an HTTP endpoint. It caps canonical event size at 16 KiB, applies the existing strict version-1 schema, enforces a five-minute local authentication time window, protects nonce reuse, and limits retained queue capacity. There is no unauthenticated LAN/public listener to bind or expose.

## Windows PowerShell demonstration

Run from the Schovera root. Do not run this against a hosted environment; these commands do not read `.env.local` or other environment files.

```powershell
node --version # gateway requires v22.13+
npm run gateway:init
npm run simulate:gateway -- --type check_in
npm run simulate:gateway -- --type check_out
npm run gateway:status
```

Each command is a separate Node process. Thus, calling `gateway:status` or another command demonstrates reopening the same SQLite database after process shutdown. To simulate a cloud outage, retain the local event and ask the fake transport to stay offline:

```powershell
npm run simulate:gateway -- --type check_in --event-id 69c070bf-1b7f-4dd4-9bc7-3bed920fbe9f --observed-at 2026-10-19T08:00:00+05:30
npm run gateway:sync -- --mode offline --force
npm run gateway:status
npm run gateway:sync -- --mode accept --force
npm run gateway:status
```

The first command creates a synthetic event. `offline` records a retryable failure and leaves it pending; a later process can see it. `accept` uses a local fake destination and labels any receipt as fake. `--force` is only for the deterministic demonstration and bypasses the scheduled backoff. Supported modes are `accept`, `offline`, `rate-limited`, `permanent-failure`, and `lose-response`.

To demonstrate commit-before-ack crash recovery, the injected fault prints the committed event ID without an acknowledgement. Retry it using the persisted event:

```powershell
npm run simulate:gateway -- --fault-lost-local-ack
npm run simulate:gateway -- --retry-event <event-id-from-output>
```

`--fault-before-commit` demonstrates a failed transaction with no success acknowledgement. `npm run gateway:revoke-reader` revokes the current synthetic reader; later submissions are refused. Do not delete or manually edit `.local/schovera-rfid-gateway` as part of normal use. The isolated tests create their own temporary databases and clean those test directories.

External `--target` values are rejected before any runtime/network operation. The transport has no network implementation even for loopback targets. This simulator never contacts the local Next.js RFID route; that is a separate future Task 32G activity.

## Verification and fault coverage

The gateway suite uses per-test temporary SQLite files and covers: WAL/schema/foreign keys; incompatible version and corrupt file handling; valid insert; exact retry and changed-content conflict; separate taps; unknown/revoked reader; device identity mismatch; wrong key; stale authentication; unexpected schema fields; nonce replay; duplicate sequence; sequence gaps and out-of-order retention; pre-commit rollback; injected SQLite insert failure; committed event with lost local acknowledgement; close/reopen persistence; queue capacity; pending age summary; offline retry/backoff; fake definitive receipt; fake destination acceptance with lost response and idempotent retry; rate-limit `Retry-After`; permanent failure/attention retention; receipt-write failure/retry; external destination refusal; absence of an attendance table.

These are process/repository tests and deterministic injected failures. They do not claim physical power-loss or storage-device durability. A real Pi/drive, hardware key custody, reader↔gateway link, Pi shutdown, filesystem-full behavior, and electrical/RF behavior remain untested.

## Task 32F and 32G gates

Task 32F must decide how a credential is bound to the event-time owner when a locally queued event reaches the cloud after card revocation/reassignment. The current hosted processor resolves the current active mapping at processing time. Until a versioned, server-verifiable attribution contract and revocation-race policy are agreed, do not sync real named-student offline events.

Task 32G may connect this durable outbox only to an isolated local Supabase and local ingestion endpoint after the Task 32F decision, with temporary synthetic data, a strict loopback guard, idempotent receipt persistence and cleanup checks. It must not link the repo to production, call Vercel, or use `.env.local`. Hosted ingestion and deployment require a separate authorization/security review.

## Scope boundary

No Next.js application route, database migration/schema, Supabase or Vercel setting, production key, new npm dependency, physical hardware, hosted sync, dashboard, or real-student data was added. Task 32E does not resolve the Task 32F event-time identity issue and does not start Task 32F or 32G.
