# Nano live-capture authorization preparation

21 November 2026. **Pi read-only preflight: PASS (owner-reported). Capture authorization: NOT CREATED. Live capture/delivery: NOT RUN.** This document records the next controlled gate only; it does not authorize a serial open or queue write.

## Verified pre-capture snapshot

The owner reports the Pi-local read-only command passed these checks:

- Reviewed private files and fictional Nano enrollment scope: **PASS**.
- Signed assignment capability: valid, correctly scoped, unexpired.
- Private HMAC mapping present; no UID/digest/secret was printed.
- Live approval file absent; Nano serial port available.
- SQLite integrity check passed; Nano device events/readers/sessions: **0**.
- Other-device SQLite gateway events: **1**; receipts: **1**.
- Database metadata unchanged during the check.

The one existing other-device event and receipt are the pre-capture local queue baseline. A future post-capture check must confirm both remain unchanged and that exactly one Nano event was added. The command used an immutable, read-only SQLite connection; no gateway startup/recovery, serial open, backend request or write occurred. These are owner-reported execution results; the command was not run by this assistant.

The earlier Windows QA preservation check separately found the existing simulator gate event/receipt and all 20 protected-school dataset hashes unchanged. Those Windows records are not the Pi SQLite queue and are not replaced by the Pi counts above.

## Deployed capture contract

`scripts/physical-rfid/bounded-gateway.mjs` requires an approval with these exact fields and values:

| Field | Required value/source |
|---|---|
| `version` | `1` |
| `hardwareType` | `nano_rc522` |
| `fictionalOnly` | `true` |
| `maxNewEvents` | `1` |
| `maxRequests` | `2` (fixed contract field; capture mode itself sends no request) |
| `deviceId` | exact `reviewed.json` enrolled Nano device ID |
| `schoolId` | exact fictional school ID in the reviewed enrollment |
| `sessionId` | exact one-use capture session ID |
| `readerId` | exact enrolled local reader ID |
| `devicePublicKeySha256` | enrolled device-public-key fingerprint from the reviewed response |
| `expiresAt` | ISO timestamp five minutes after preparation, with the Pi clock correct |

Capture approval intentionally excludes `eventId` and `payloadSha256`. The separate `deliver` mode requires both, so this capture-only approval cannot authorize event delivery. The CLI also independently requires the config’s `resetRiskAccepted` and `monitorClosedConfirmed` booleans to be true, exact serial identity, matching school/session/device confirmations, an unused session, and zero existing queue rows for the Nano device. The hard limit is one newly durable event. A successful scan is a local SQLite queue write; it is not delivery.

## Fresh operator confirmation procedure (proposed, not run)

The currently reviewed config has both operator confirmation fields false. Before a future live-capture approval is created, the owner must freshly confirm in the Pi terminal that:

1. Arduino Serial Monitor/Plotter is closed and the Nano port is free.
2. Opening the serial port can reset the Nano even with the selected DTR setting; the operator explicitly accepts this for this one test.

Only after those confirmations and separate authorization to prepare the capture approval should a guarded helper set those two fields and create a mode-0600 `live-approval.json` with exclusive-create semantics. The helper must fail if the approval already exists, the response/config scope or signed capability differs, expiry exceeds five minutes, or serial identity/port checks fail. It must not print config values, HMAC, UID, private key, capability, or credentials. This preparation does not itself open serial or create a queue row.

The complete local-only helper prepared for review is `scripts/physical-rfid/prepare-live-capture-approval.py` (SHA-256 `bd6cc142ca679dab65f1dd2b2737ee1896092fd483a9fcaff84d5580100ab431`). It is not deployed to the Pi and was not executed. Its owner command, after separate approval, is:

```bash
cd /home/schovera/Schovera
python3 -I -B scripts/physical-rfid/prepare-live-capture-approval.py
```

The helper rechecks the response checksum, enrollment/capability, port identity/ownership, approval absence, and a read-only SQLite snapshot immediately before writes. It requests fresh typed confirmations, then updates only the two reviewed config booleans and creates an exact-contract mode-0600 capture-only approval expiring within five minutes. On detected errors it removes only its own temporary/new approval file and restores the original config if replaced; if rollback itself fails it emits an explicit stop condition. It does not read the device private key contents, print protected values, or contact a backend. This command is still **not run** and requires separate owner authorization.

Even after approval preparation, the capture CLI command must receive its own separate explicit authorization; it will run for at most 30 seconds, accept at most one new durable event, and never invoke delivery. Delivery remains a later, independently approved operation tied to the exact event ID and payload hash.

## Preservation and current state

No Pi queue contents, device private key, HMAC values, firmware, network settings or Pi Supabase were modified. No files were committed or pushed. The simulator baseline is recorded as **one other-device event / one receipt** from the owner’s read-only check. The next gate must recheck those counts and verify exactly one Nano event before any delivery request is considered.

**Current status:** preflight PASS; fresh operator confirmation pending; approval file absent; capture and delivery disabled. No capture command has been run.
