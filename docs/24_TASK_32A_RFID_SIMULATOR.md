# Task 32A — Hardware-free RFID event simulator

**Status:** Local-only protocol simulator. This is not RFID hardware, a Pi gateway, a cloud ingestion endpoint, or school attendance functionality.

## What is simulated

The isolated TypeScript core validates the version-1 event envelope from [the integration architecture](23_CEO_INTEGRATION_READINESS.md), computes a canonical payload hash, and uses an in-memory processor to demonstrate deterministic acceptance, unmatched credentials, retries, conflicts, sequence gaps, and physical-style repeated-tap warnings. A small in-memory queue demonstrates destination outage and replay. All identifiers and credentials in the fixtures are synthetic.

An event contains exactly `schema_version`, `event_id`, `device_id`, `credential_ref`, `event_type`, `observed_at`, and `device_sequence`. `observed_at` is untrusted device-reported time; it is not a server receipt time. The simulator stores no names or card UIDs and does not create attendance records.

An exact retry with the same `(device_id, event_id)` and canonical content returns the first receipt. Reusing that key with changed content conflicts. Unknown or revoked credentials return a generic `unmatched` receipt. A separate event ID for the same credential and event type within 1.5 seconds is still retained/accepted (if the credential is active) and flagged as `duplicate_tap`; it is not confused with a network retry. Sequence gaps and out-of-order events are reported and retained rather than silently dropped.

## Run demonstrations (Windows PowerShell)

```powershell
npm run simulate:rfid
npm run simulate:rfid -- --scenario duplicate
npm run simulate:rfid -- --scenario conflict
npm run simulate:rfid -- --scenario out-of-order
npm run simulate:rfid -- --scenario revoked
npm run simulate:rfid -- --scenario unknown
npm run simulate:rfid -- --scenario invalid
npm run simulate:rfid -- --scenario offline-replay
npm run simulate:rfid -- --file .\scripts\rfid-simulator\fixtures\sample-events.jsonl
```

There is deliberately no networking in the simulator. `--target` exists only as a safety guard: loopback HTTP is the only accepted target value, while production and any remote host are rejected. No target is contacted. The outage queue is in memory only; it is not durable across process restart and must not be described as a Raspberry Pi offline service. JSONL fixtures are read-only inputs.

Run focused tests with `npm run test:rfid`. The tests need no Supabase configuration, internet, real hardware, or credentials.

## Not implemented / Task 32B prerequisites

There is no real reader/card authentication, enrollment or revocation UI, durable gateway queue, signature verification, cloud receipt store, database table/RLS policy, public API, attendance projection, role dashboard, notification, or physical-device evidence. Before a database-backed flow, Task 32B needs approval for an isolated non-production Supabase environment, a concrete device enrollment/key rotation model, privacy/retention rules, and RLS/tenant-isolation tests. Never use production credentials for simulator or integration tests.
