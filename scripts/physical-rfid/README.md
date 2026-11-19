# Physical RFID adapter — Stage 1

19 November 2026. **Host reference implementation and simulated tests only.**
No hardware port, network/backend, student enrollment, gateway persistence or
attendance writer is connected. The CLI supports `simulate` only and rejects
hardware/listen/port commands. Existing M7 synthetic files and validators are
unchanged. This is not a successful physical scan or a durable receipt.

## Inspected Nano source

The owner supplied `hardware/arduino-nano-rc522/schovera_nano_rfid.ino` during this
task. It was read and left unchanged. Source inspection does not establish that
it matches the firmware currently flashed on the Nano.

- SS/RST constants are 10/9; these are source settings, not verified wiring.
- `setup()` selects 115200, initializes SPI/RC522, waits 100ms and prints readiness
  and the reader version.
- `loop()` reads a UID, uppercases colon-separated hex, applies a two-second
  same-UID cooldown and prints `SCHOVERA_SCAN,<UID>,<millis()>`.
- The third field is confirmed as device uptime in this source, not UTC.
- There is no Serial command parser, source session/sequence, acknowledgement,
  pending-message buffer or retransmission implementation in this sketch.

No firmware edit, build or upload was made. MFRC522 version `0x82`, intermittent
reads, electrical reliability, exact board variant, port identity and flashed
source correspondence remain unverified by this adapter.

## Two deliberately separate input paths

**Existing CSV:** recognized as legacy input. It is rejected for capture by
default. An explicit `allowLegacyMonitor: true` stores only the latest private
sample in RAM, labelled with `acquisitionId: null` and retransmission `unknown`.
It sends no ACK/BIND/RETRY, does not assign sequence/UTC/student identities, and
does not infer whether two CSV lines are repeated transmission or two taps.
Readiness/version diagnostics never negotiate a versioned session.

**Reference v1:** the following is a host-side contract for review, **not a claim
that the supplied/flashed sketch implements it**. Firmware changes need separate
approval and Nano memory/reset review. No M7 `kind: synthetic` rule is changed.

## Reference physical wire contract

ASCII newline-delimited frames, LF or CRLF, without whitespace padding. UID bytes
use two hex digits separated by colons; supported lengths are 4/7/10 bytes and
hex case is normalized. Session IDs are lowercase host-generated UUIDv4 values.
Sequences are decimal integers 1..2147483647; uptime is decimal 0..4294967295.
The examples below contain placeholders, not a real card or working command.

Device → host:

```text
SRFID,1,READY
SRFID,1,STATE,<session-uuid>,<last-emitted-sequence>
SRFID,1,SCAN,<session-uuid>,<sequence>,<UID-bytes>,<original-device-uptime-ms>
```

Host → reference device:

```text
SRFID,1,STATUS
SRFID,1,BIND,<session-uuid>
SRFID,1,ACK,<session-uuid>,<sequence>,VALIDATED_RAM_ONLY
SRFID,1,RETRY,<session-uuid>,<sequence>
```

The adapter currently emits only BIND and validation ACK through an injected
simulation writer. STATUS/RETRY have strict encoders for protocol definition;
no hardware command loop or automatic reconnect driver exists.

1. A versioned READY permits an explicit host bind. The host reuses the exact
   offered UUID on binding retries. A successful local write is not device
   confirmation: matching STATE with sequence zero is required before admission.
2. A new source acquisition increments sequence and retains its original UID and
   uptime. Its stable Stage 1 identity is `<session UUID>:<sequence>`.
   Retransmission must reuse every field. Changing UID/time under that identity
   conflicts. Reusing a UID under a new sequence denotes a different **declared
   acquisition**, not independent proof of a second physical card presentation.
3. Contiguous sequences are required. Missing/out-of-order new frames are refused
   without advancing the accepted sequence. Already-retained duplicates remain
   recognizable. No cooldown or host receive timestamp is used as a dedupe key.
4. The proposed sender transmits stop-and-wait: at most one emitted acquisition
   is not yet validated by the host. STATE reports the last **emitted**, not the
   last merely buffered, sequence. On reconnect the host accepts the same known
   session with its current sequence or one pending next sequence. Other states
   require review; they never silently jump the receiver's accepted sequence.
5. A VALIDATED_RAM_ONLY ACK means exactly that the host validated and retained a
   sample in volatile memory. **It must never authorize source dequeue/discard.**
   A successful write callback does not prove that the board received an ACK.
   There is no durable/commit ACK in Stage 1 and no CLEAR command.
6. Future firmware must retain uncommitted samples in its own bounded buffer. A
   validation ACK may allow the next buffered frame to be transmitted, but does
   not free a source slot. A one-slot source cannot accept another sample until a
   separately reviewed durable-release stage exists. This task makes no promise
   about Nano buffer capacity, persistent memory or power-loss survival.
7. Reference source retransmissions retain exact identity/body, stop after at
   most three automatic attempts and retain work for review. The host limits
   validation ACK writes to three total attempts per acquisition, including
   source-triggered duplicate retries. Failed writes back off 250ms, then 500ms
   (capped at 1000ms); exhausted work remains in RAM attention. It is not deleted.
   Binding retries also reuse one UUID and are limited to three attempts.
8. A new READY after a negotiated session is a possible reset/rehandshake, not
   attestation of a hardware reboot. It cancels in-flight work and retains old
   records. A new namespace requires explicit volatile-reset-risk confirmation;
   an old namespace cannot be reused. Uptime regression/wrap without a new
   negotiated epoch stops admission for review; UTC is never reconstructed.
9. Disconnect aborts writes and clears partial framing, not retained observations.
   Reconnection needs a matching known STATE or reviewed reset. A new host process
   has no durable history and refuses to adopt an unknown old session. Stable
   identity does not imply persistence across host or board power loss.

`hostReceivedAt` is the first actual host-clock receipt time. It is distinct from
device uptime and is preserved on retransmission. There is no `observed_at` UTC
claim in this adapter. A wrong host clock is not repaired by guessing.

## Bounds and privacy

- Maximum line: 192 bytes; maximum input chunk: 4096 bytes. Invalid lines are
  discarded through newline; oversized chunks cannot create unbounded buffers.
- Default/max RAM records: 128; default/max negotiated namespaces: 4. Capacity
  exhaustion refuses new work without ACK or eviction of older records.
- Default write deadline: 1000ms, configurable only within 10..5000ms. Injected
  writers receive an AbortSignal and must honor it. Already-emitted bytes cannot
  be recalled; all ACKs remain explicitly validation-only.
- One ACK flush is active at a time. There is no autonomous timer/service. A future
  approved transport pump must call `flushValidationAcks()` to service due work.
- Ordinary diagnostic reports contain fixed codes, bounded metadata and opaque
  session/acquisition IDs. They never include UIDs, input frames, student data or
  callback exception text. Reports are capped at 16 per monotonic one-second
  window; excess reports increment a bounded suppression counter.
- `inspect()` is sanitized. `readPrivateObservation(id)` and
  `readPrivateLegacyObservation()` are explicitly sensitive accessors, not log
  APIs, student enrollment or access-control boundaries. Never dump their output.
- No signing keys, Supabase credentials, raw UID enrollment or backend/gateway
  event insertion exists. A UID remains a clonable card identifier, not proof of
  a student's presence. No event automatically marks attendance.

## Files and executed checks

All Stage 1 additions are in this directory:

| File | Purpose |
|---|---|
| `protocol.mjs` | Strict versioned/legacy parsing, identity and command grammar |
| `serial-lines.mjs` | Bounded byte framing and resynchronization |
| `adapter.mjs` | RAM validation, session/reset/reconnect handling, ACK limits and sanitized reports |
| `cli.mjs` | Fictional simulation only; hardware commands refused |
| `adapter.test.mjs` | 31 automated tests including privacy, corruption, capacity, timeout and disconnect cases |
| `README.md` | Source inspection, protocol, limitations and handoff |

Executed in the existing isolated QA checkout with an OS-variable allowlist and
Vitest's existing `envDir: false`. No developer `.env.local` was opened/copied.
The M7 unit suite uses temporary loopback test receivers and a CLR stdin probe;
it does not open a serial port or start the application/database services.

| Command | Exit | Result |
|---|---:|---|
| `node node_modules/vitest/vitest.mjs run scripts/physical-rfid/adapter.test.mjs --maxWorkers=2 --no-file-parallelism` | 0 | 31/31 passed |
| `npm run test:arduino-serial` | 0 | Existing 22/22 passed without assertion changes |
| `node node_modules/eslint/bin/eslint.js scripts/physical-rfid --no-cache --concurrency 1` | 0 | Clean |
| `node scripts/physical-rfid/cli.mjs simulate` | 0 | Two fictional acquisitions, one duplicate, partial input and reconnect; sanitized output; explicitly non-durable |

No test failed in this run. Private execution logs/timestamps are retained under
`.local/schovera-manual-demo/physical-rfid-stage1-20261119/`. SHA-256 checks found
47 preserved M7/reader/gateway/firmware files unchanged, including the supplied
Nano sketch. The owner-supplied Nano source is not an adapter-authored change.
No dependencies, package scripts, APIs, migrations, student records or existing
M7 files were changed. No staging, commit, push or hardware operation was made.

## Exact next hardware verification — separate approval required

The next step is **not** sending this reference protocol to the current sketch.
It is a bounded read-only observation of its existing CSV:

1. Owner confirms Nano identity and exact current COM11/PnP descriptor, closes
   Arduino Serial Monitor/Plotter, and confirms safe power/wiring. Review port
   DTR/reset behavior before opening: opening a port may reset some boards even
   without transmitting commands. Do not reuse UNO-specific assumptions.
2. Obtain explicit approval for a separate 30-second, 115200-baud read-only capture
   harness. Stage 1 CLI deliberately has no hardware-open command. No outbound
   Serial bytes, firmware upload, enrollment or backend writes are permitted.
3. Observe readiness/version stability and three deliberate remove/re-present
   card actions. Ordinary logs contain counts/error classes only; any required
   UID comparison stays private. Record uptime/reset behavior and intermittence.
   Do not call legacy lines exactly-once acquisitions or confirmed attendance.
4. Only after those observations, request approval for a Nano firmware proposal
   implementing the reviewed protocol and source retention/ACK behavior. Verify
   its memory and reset behavior before any upload. Durable gateway enrollment,
   persistence and backend synchronization are a later stage.

Stage 1 is ready for code review only. It is not ready to connect to a school,
clear a source observation, guarantee offline capture, deploy to Pi or certify
hardware. Ask for owner approval before any commit or hardware operation.
