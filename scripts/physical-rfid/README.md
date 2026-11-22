# Physical RFID adapter — Stage 1

Linux software follow-up (20 November 2026): see [Pi staged handoff](RASPBERRY_PI.md)
and [software verification record](../../docs/74_PI_PHYSICAL_RFID_SOFTWARE_STAGES.md).
No physical gateway event or dashboard acceptance is claimed. A later bounded
read-only serial diagnostic was owner-reported to receive three scan frames; it
did not persist or deliver an event. The historical Windows/Stage 1 records
below remain unchanged.

Publication follow-up, 20 November 2026: see
[verification and Raspberry Pi handoff](../../docs/73_PHYSICAL_RFID_PUBLICATION_AND_PI_HANDOFF.md).
The historical implementation record below retains its original no-publication
status; the follow-up records the separately authorized GitHub checkpoint.

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

## Separately approved read-only capture utility — 19 November 2026

The owner subsequently approved **implementation and mock verification only** of
`capture-readonly.mjs`. The original `cli.mjs` still supports only `simulate`;
its restriction and all M7 code remain unchanged. The new utility has not been
used to open COM11 and does not establish hardware verification. No firmware,
database, backend, enrollment, attendance, commit or push operation is part of
this addition.

Added files:

| File | Purpose |
|---|---|
| `capture-readonly.mjs` | Strict CLI, capture deadline, shutdown/signals and sanitized final report |
| `capture-observer.mjs` | Existing physical parser/framer reused for bounded legacy observations and counts |
| `readonly-windows.mjs` | Narrow Windows subprocess transport with no payload-write method |
| `windows-readonly.ps1` | Exact registry/PnP preflight, fixed 115200/8N1 reads and port cleanup |
| `capture-readonly.test.mjs` | 20 mock observer/lifecycle/argument tests |
| `readonly-windows.test.mjs` | 9 mock transport/static-worker/pure-identity tests |

Only this README is modified among the six original Stage 1 files. There is no
new package or dependency. Capture modules import no backend, Supabase, SQLite,
gateway or attendance implementation; they do not use the ACK-capable simulated
adapter. `PhysicalSerialLines` and `parseFrame` remain the bounded parsing source.

### DTR/RTS review and preflight

This utility uses Windows PowerShell/.NET SerialPort. It requires an explicit
`--dtr on` or `--dtr off` and `--ack-reset-risk`; there is **no automatic/default
DTR choice**. RTS is explicitly off and handshaking is None. The utility never
calls Serial.Write/WriteLine/BaseStream.Write, sends protocol ACKs, transmits
XON/XOFF handshaking or forwards stdin to Serial. The only worker stdin control
is the literal CLOSE message; it closes the process/port, not a device command.

"Read-only" describes application serial **payload** operations. Opening,
configuring and closing a Windows SerialPort still involves driver/control-line
operations. DTR/RTS configuration is not a guarantee of the physical voltage,
polarity, pulse timing or absence of a Nano reset. DTR off is not assumed safe or
functional for the particular USB bridge. Actual driver/Nano behavior must be
reviewed and observed under separate hardware approval. References inspected:
[Microsoft DtrEnable](https://learn.microsoft.com/en-us/dotnet/api/system.io.ports.serialport.dtrenable)
and [Microsoft SerialPort.Open](https://learn.microsoft.com/en-us/dotnet/api/system.io.ports.serialport.open).

The utility requires a literal COM port and an exact, case-sensitive Windows
USB/FTDIBUS PnP identity. It never selects another port or automatically reconnects.
The worker checks the selected binding before opening, immediately after opening
before forwarding any data, and periodically during capture. Missing, mismatched
or ambiguous bindings fail closed. Registry/USB descriptors are identity claims,
not cryptographic attestation; a narrow hotplug race cannot be eliminated by
these checks. Ambiguous FTDI aliases may need review rather than relaxing checks.

`--confirm-monitor-closed` is a required **operator assertion**. Known Serial
Monitor/Plotter helper processes also cause refusal. The utility cannot prove
that every Java/IDE/third-party monitor is closed; exclusive SerialPort.Open
detects another owner and fails without killing it or retrying another device.
No physical ownership/monitor check was executed during mock testing.

### Command for the later approved COM11 observation

First, under the separately approved hardware procedure, obtain and personally
confirm the current instance ID. This metadata command does not open the port:

```powershell
Get-PnpDevice -PresentOnly |
  Where-Object { $_.FriendlyName -match '\(COM11\)$' } |
  Select-Object -ExpandProperty InstanceId
```

Do not automatically substitute a different device or choose among ambiguous
results. Close Serial Monitor/Plotter, confirm Nano identity/power/wiring and
review reset risk. After separate approval, replace the placeholder below with
that exact confirmed ID, keeping it single-quoted:

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
node scripts/physical-rfid/capture-readonly.mjs `
  --port COM11 `
  --confirm-pnp-id '<EXACT_CONFIRMED_WINDOWS_PNP_ID>' `
  --seconds 30 `
  --dtr on `
  --ack-reset-risk `
  --confirm-monitor-closed
```

The placeholder is deliberately rejected by validation; no current PnP identity
has been assumed or discovered in this implementation task. `on` explicitly
accepts potential line-triggered reset and is not evidence that this setting was
tested. If the reviewed physical procedure selects off, use `--dtr off` with the
same acknowledgement; neither setting promises reset-free operation. Do not run
the PowerShell worker directly: its stdout is a private byte IPC channel and
must not be dumped into ordinary logs.

### Capture window, reports and closure

- Duration is an integer 1..30 seconds, measured from capture setup, including
  worker startup. Half a second is reserved **inside** that budget for closure.
  Thus a 30-second request normally observes for less than 30 seconds, particularly
  on a slow startup. It never intentionally extends the capture to compensate.
- Parent and worker have independent deadlines; the parent sends CLOSE and then
  terminates only its own worker if needed. Windows scheduling/driver hangs are
  not hard-real-time guarantees. Closure evidence distinguishes worker-confirmed
  close/exit, process exit alone and unconfirmed cleanup; it never claims an
  unresponsive device closed successfully. Ctrl+C, SIGTERM, cancellation,
  exceptions, timeout, identity loss and disconnect use the same bounded cleanup.
  `portOpened` means the parent received the worker's open confirmation; false
  cannot prove that an interrupted driver/open attempt caused no line activity.
- The utility stops accepting input at shutdown, clears partial framing and
  unregisters only its own listeners. There is no firmware upload/reset command,
  source CLEAR or protocol acknowledgement. An electrical reset caused by port
  open/close is reported only as a possible indication, not a verified reboot.
- Ordinary output contains byte/scan/error counts, readiness/version indications,
  source uptime changes, exact repeated tuple counts and closure evidence. It
  contains no raw frame, UID, student data, arbitrary exception or worker stderr.
  Encoded byte IPC stays private between worker and parser.
- An exact repeated `(indicated epoch, UID, uptime)` tuple is counted, not silently
  removed. Replaying an older tuple after a later one remains an exact repetition
  and also reports uptime regression. A readiness marker starts a new **observed**
  epoch; uptime regression alone does not invent a boot. None of this proves
  retransmission identity or three distinct physical presentations. Those still
  require owner observation and, later, the versioned source protocol.
- Frames/chunks reuse the 192/4096-byte parser bounds. Tracking is capped at 256
  private tuples by default; byte volume is capped at 2 MiB. Exhaustion stops the
  capture without eviction or invented delivery. Diagnostics are rate-limited;
  final counts remain available. Raw bytes/tuples are RAM-only and never exported.
- The final `serialPayloadWrites: 0`, `backendWritten: false` and
  `studentsAssociated: false` describe this utility's code path. They do not
  certify OS/driver control signals, secure physical identity or real attendance.
  Normal bounded completion after a confirmed port open exits 0 even when no bytes
  were seen; inspect the counts. Failure to open, other errors and unconfirmed
  closure exit 1; Ctrl+C/cancellation exits 130.

### Executed mock verification

Tests run only in the existing isolated QA checkout, using the controlled OS-env
allowlist and existing Vitest `envDir: false`. All Serial transports/identities
are mocked. Two Windows tests parse the actual worker and execute only its
isolated pure identity-comparison function with fake descriptors; the worker's
top-level code, registry discovery and SerialPort.Open are never executed.

Final verification passed **60 physical-RFID tests** (31 existing Stage 1 plus
29 new read-only tests), **22 unchanged M7 Serial tests**, and targeted lint.
Commands, all final exit 0:

```text
node node_modules/vitest/vitest.mjs run scripts/physical-rfid --maxWorkers=2 --no-file-parallelism
npm run test:arduino-serial
node node_modules/eslint/bin/eslint.js scripts/physical-rfid --no-cache --concurrency 1
```

All 47 preserved M7/reader/gateway/firmware hashes remain unchanged. The six new
files and this README match the QA copies. Nothing is staged, committed or pushed
by this addition. The original Stage 1 implementation remains at commit
`992dca5aecc82957e31248ca2f435f1821e357e8`; unrelated pre-existing work is preserved.

The first physical-folder run passed 56/57 but caught a PowerShell 5.1 line-continuation
syntax error in the new worker. It was fixed before any native execution. A later
expanded run passed 58/59 but found the new test's helper-extraction API error;
the test now extracts the same pure function definition correctly. Assertions
were not weakened. Both failed attempts remain in the private execution ledger
at `.local/schovera-manual-demo/physical-rfid-readonly-20261119/`.

An initial evidence-summary command also treated the JSON ledger array as one
PowerShell object and stopped before writing its integrity result. Explicit Node
array validation corrected that reporting helper; the last physical/M7/lint exits
were all zero. This was not another application or unit-test failure.

No live byte, PnP-presence, monitor ownership, DTR/RTS, reset, disconnection or
three-presentation hardware result is claimed. The next step is owner review and
separate approval to execute the bounded capture command. Firmware, enrollment,
durable synchronization and Stage 2 remain blocked.
