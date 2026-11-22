# Raspberry Pi physical RFID: staged local handoff

20 November 2026. **Software stages only; hardware acceptance is pending.**
The Nano was disconnected during the software tests. In the later metadata-only
check, the owner reported that the Pi detects the FTDI adapter described below.
No Pi serial port has been opened by this implementation. Do not start the full
Supabase stack on the 4 GB Pi.

**Latest checkpoint:** the approved Pi software-only queue/tunnel/API test passed:
one synthetic gate event, one receipt, an identical retry, zero classroom attendance,
expected role visibility and all 20 protected-school hashes unchanged. The owner
reported the Pi execution; the saved Windows authoritative verifier confirms the
database counts and authorization. Source deployment and software submission are
complete; the earlier transfer instructions below are historical procedure, not a
request to reapply the patch or rerun the one-shot probe. See
[the milestone and controlled physical plan](../../docs/75_PI_SOFTWARE_MILESTONE_AND_PHYSICAL_VALIDATION_PLAN.md).
Actual-unit reset behavior and reader electrical compatibility remain unverified.
Unpowered board/wiring review is next; no serial opening is authorized yet.

**Subsequent operator result:** the separately approved Nano/RC522 read-only test
received three valid distinct scan tuples in its bounded run, with zero invalid
frames, zero serial payload/backend writes and automatic closure. Physical serial
acquisition is now reported PASS; reset causation/electrical certification and
live gateway/dashboard acceptance remain separate. See
[milestone 76 and its bounded approval gates](../../docs/76_NANO_PHYSICAL_SERIAL_MILESTONE_AND_GATEWAY_TEST_PLAN.md).
Earlier awaiting-open/inspection wording is historical. Do not run gateway capture
or generic sync from this handoff before the new scope/budget review and approval.

The bounded guard implementation is now prepared and mock-tested on Windows QA;
see [preparation report 77](../../docs/77_NANO_BOUNDED_GATEWAY_PREPARATION.md).
It has not been deployed to the Pi, and enrollment/database writes remain pending.
The report's commands are review-only; do not substitute the generic unscoped sync.

## Reported USB identity: awaiting open approval

The owner reported this metadata on 20 November 2026; the assistant has not
independently inspected it over SSH:

- Exact stable path:
  `/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0`.
- Resolved node: `/dev/ttyUSB0`; FTDI FT232R USB UART, serial `BG02XZ38`;
  kernel driver `ftdi_sio`.
- Mode `660`, owner `root`, group `plugdev`; the active user is reported to belong
  to both `plugdev` and `dialout`. No permission/group/udev change is planned.
- The owner subsequently reported `fuser -v /dev/ttyUSB0` with no output and
  exit 1. No visible user was reported; this is not proof against owners hidden
  by process permissions. Do not stop processes automatically.
- Reported versions: Node `v22.23.5`, Python `3.13.5`; version prerequisites are
  met, but native Linux operation has not been executed by the assistant.
- Reported short Git revision `7f22280` matches the prepared package's base
  prefix; `git status --short` was empty. Check the full base and patch on the Pi
  before any approved deployment.
- The owner then reported `ID_VENDOR_ID=0403`, `ID_MODEL_ID=6001` and
  `ID_SERIAL_SHORT=BG02XZ38`. The exact worker identity is
  `0403:6001:BG02XZ38`; it is backed by the supplied metadata, not inferred
  from the FTDI product name.
- Reset/DTR behavior and RC522/Nano voltage/logic compatibility are unverified.
  Device enumeration is not evidence that reader operation is electrically safe.

The basic operator-reported USB metadata stage is complete. The next software
stage is to transfer the reviewed source package, compare the full Pi base
revision/working tree, and run a patch dry-run before applying anything. Refresh
port-user checks immediately before any later approved hardware opening.

`fuser` is an inspection command, not a serial reader, and normally does not use
a pager. Share permission errors or a missing-command result without trying to
kill processes, change permissions or install packages. Empty output alone does
not prove every possible port owner was visible. Do not use `cat`, `screen`,
`minicom`, `stty`, a serial monitor or either capture CLI during this step.
The capture CLI still requires explicit approval and a reviewed DTR choice.

## Current architecture

Nano legacy CSV -> Linux bounded read-only serial worker -> reviewed host
binding -> existing SQLite gateway -> existing signed v2 delivery -> SSH tunnel
-> Windows loopback Next API -> Windows local Supabase -> existing entry views.

The read-only monitor and the enrolled gateway capture are separate commands.
The monitor is DB-free. Gateway capture writes only the existing local gateway
queue, with a namespaced session cursor; it never writes directly to Supabase.
Delivery reuses `scripts/rfid-gateway/cli.mjs sync-v2`. Neither mode records
classroom attendance, auto-enrolls a card, or sends commands to the Nano.

## Software transfer and prerequisites

The new software is currently uncommitted on Windows. `git pull` on the Pi will
not fetch it until the owner separately approves publication. Do not overwrite
the Pi checkout. First inspect `git status --short` and its revision; choose a
reviewed source transfer or approved publication after preserving its local work.
Never transfer Windows environments, databases, credentials, node_modules or keys
as part of a source bundle.

A source-only patch and manifest can be prepared on Windows without transferring
or executing them on the Pi. They must contain only this task's reviewed source,
tests, examples, documentation and the Windows-backend migration. The example
configuration remains placeholders, not a usable private enrollment. Do not apply
the migration on the Pi or run it merely to deploy the reader source. Check the
Pi revision/local work and review `git apply --check` before any separately
approved application of the patch; do not overwrite conflicting work.

Use Node 22.18+ within 22.x for parity with Windows QA, plus `/usr/bin/python3`.
The capture and gateway runtime use Node/Python standard libraries; no pyserial
package or Pi Supabase/Docker installation is required for this reader process.
Tests additionally require the lockfile's Vitest/dev dependencies. Native Linux
and ARM64 operation have not yet been executed in this task.

## First hardware check: metadata only

Before powering the reader, confirm the existing wiring and voltage/level-shifting
arrangement is reviewed for this Nano/RC522 combination. Do not rewire powered
hardware or assume the sketch's SS/RST constants certify electrical safety.

1. Close Arduino Serial Monitor, Serial Plotter, `screen`, `minicom` and any
   process reading this board, on every machine to which it is connected.
2. Connect the Nano to the Pi using a USB **data** cable, with its existing
   reviewed reader wiring. No firmware upload is needed for the CSV monitor.
3. In the existing Pi SSH terminal, inspect without opening a serial stream:

   ```sh
   cd /home/schovera/Schovera
   uname -m
   node --version
   python3 --version
   git status --short
   ls -l /dev/serial/by-id/
   ```

4. If exactly the intended new Nano entry appears, copy that exact by-id path.
   Inspect its descriptors (this does not read RFID data):

   ```sh
   device='/dev/serial/by-id/REPLACE_WITH_EXACT_NANO_ENTRY'
   udevadm info --query=property --name="$device"
   stat -Lc '%a %G %F' "$device"
   id -nG
   ```

   Confirm `ID_VENDOR_ID`, `ID_MODEL_ID`, `ID_SERIAL_SHORT` and the exact device.
   The worker checks the corresponding sysfs USB attributes. If no stable by-id
   entry or USB serial exists, **stop**: the current strict transport refuses
   that device rather than guessing `/dev/ttyUSB0`. A reviewed physical USB-path
   identity alternative would be additional work. Missing permissions also stop
   capture; do not run as root or change groups/udev rules without review.

5. Share the metadata and confirm Monitor is closed. Review the USB bridge's
   DTR/reset behavior before approving an open. DTR on/off is explicit, RTS is
   off, and opening/closing may still pulse a line and reset the Nano. Software
   tests do not verify voltage or reset behavior on this board.

## First approved read-only observation

Only after metadata review, explicit reset-risk acceptance and hardware approval:

```sh
node scripts/physical-rfid/capture-linux.mjs \
  --device '/dev/serial/by-id/EXACT_CONFIRMED_ENTRY' \
  --confirm-usb-id 'vvvv:pppp:EXACT_USB_SERIAL' \
  --seconds 30 --dtr off \
  --ack-reset-risk --confirm-monitor-closed
```

`off` is an example choice for review, not a tested reset-safe setting. Replace it
only with the reviewed explicit choice. Remove and re-present the card three
times during the window. Share sanitized final counts, not raw serial output.
Counts of different CSV tuples do not prove three physical taps; correlate with
operator observation. The window includes startup and shutdown and does not
automatically reconnect or extend. Actual bytes, reset/disconnect behavior and
three presentations remain **NOT TESTED**.

The worker pins by-id and exact USB identity, verifies the opened character-device
number, requests `flock`/TIOCEXCL ownership, configures 115200/8N1 without software
flow control, and reads at most 256 bytes per IPC record. Existing parser bounds,
capture byte limits and shutdown deadlines apply. An owner that ignores advisory
locking or already held the device may still exist; operator confirmation remains
necessary. USB descriptors are not cryptographic device authentication.

## Secure Windows backend route: tunnel only, no network reconfiguration

Keep Windows Next bound to `127.0.0.1:3106`, and Supabase to Windows loopback.
The existing guarded QA launcher is `npm run dev:rfid-local -- --port 3106`
in the already configured isolated Windows QA checkout, not the production-env
developer checkout. Do not overwrite either environment file.

In a **Windows** terminal, after checking the Pi host key and authenticating
privately, keep this foreground process running:

```powershell
ssh -NT -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 `
  -R 127.0.0.1:33106:127.0.0.1:3106 schovera@10.42.0.1
```

On the Pi, verify the listener and test the forwarded app:

```sh
ss -ltn 'sport = :33106'
curl --max-time 5 -I http://127.0.0.1:33106/
```

Proceed only when the listener is loopback-only. If it binds all interfaces,
stop the tunnel and review sshd policy; do not change hotspot, firewall,
GatewayPorts, sshd or Supabase configuration to get past this check.
`ExitOnForwardFailure` confirms forwarding setup, not destination health; the
HTTP check is separate. The tunnel forwards Next only, not PostgreSQL/Supabase.
Signed v2 authentication and server role/assignment checks still apply.

References: [OpenSSH remote forwarding](https://man.openbsd.org/ssh),
[forwarding failure semantics](https://man.openbsd.org/ssh_config), and
[Python termios](https://docs.python.org/3/library/termios.html).
No tunnel was established by the assistant: TCP/22 was reachable, but the strict
non-interactive SSH attempt was rejected. No SSH configuration was changed.

## Reviewed enrollment and durable demonstration: still gated

Do not use a real student's assignment or silently bind the first scanned card.
Use a newly owned fictional school/student and its Principal-reviewed immutable
credential assignment, device and signed capability. Migration
`20261120083000_allow_nano_rc522_devices.sql` adds `nano_rc522` while retaining
the three existing types. It was applied and permission-tested only against the
approved Windows local QA database (52 migrations). No real Nano, card or existing
student was enrolled. Do not label real Nano hardware as a simulator. This is a
Windows backend migration; do not start Supabase on the Pi to apply it there.

`enrollment.example.json` is an intentionally unusable shape template. The private
reviewed configuration must reside under `.local/`, owned by the Pi user with
mode 0600; it pins the exact USB identity and session/school. It holds an HMAC
digest of the reviewed UID, not a raw UID or student name. Generate random local
reader/lookup secrets, obtain the authorized assignment capability through the
existing Windows-side provisioner and verify its issuer public key. Do not put
the Supabase service role, Principal password or issuer private key on the Pi.
Transfer only approved device/reader material privately; never commit it.

After that review, and after confirming the private configuration permissions:

```sh
node scripts/physical-rfid/capture-linux-gateway.mjs \
  --config "$PWD/.local/physical-rfid/reviewed.json" \
  --confirm-school 'REVIEWED_FICTIONAL_SCHOOL_UUID' \
  --confirm-session 'REVIEWED_CAPTURE_SESSION_UUID' \
  --database "$PWD/.local/schovera-rfid-gateway/gateway.sqlite"
```

Capture is bounded; it exits before delivery. New stores use a private umask.
Existing queues/permissions are not replaced. After the capture owner closes,
reuse the existing delivery command; device signing key material is private and
is distinct from Supabase service/issuer keys:

```sh
node scripts/rfid-gateway/cli.mjs sync-v2 --local-only \
  --target http://127.0.0.1:33106 \
  --database "$PWD/.local/schovera-rfid-gateway/gateway.sqlite" \
  --device-key-file "$PWD/.local/physical-rfid/device-private.pem"
```

No new queue or parallel delivery service is introduced. The existing worker lock
excludes capture/delivery competition. Retry/backoff/attention behavior is retained;
pending work is never deleted on network failure. Session cursor and queue insert
commit in the same SQLite transaction via the existing ingress hook.

## Evidence limits and acceptance sequence

CSV `millis` is uptime, not UTC. This explicitly selected legacy mode records the
host's receipt time as its observation time and records that basis in diagnostics.
It cannot know an earlier physical tap time. It derives a stable host event ID
from the reviewed session, private card digest and original uptime, and reuses the
stored canonical envelope/sequence/time after a duplicate or restart. Separate
tuples are separate host observations, not guaranteed unique physical taps.
READY after persisted scans or regressed uptime holds that session for review;
no automatic epoch reset, credential remapping or new session is invented.

Loss before SQLite commit cannot be recovered: current Nano firmware has no
durable source identity, ACK or retransmission. New firmware is a separate reviewed
step, and the existing M7 synthetic protocol remains unchanged. Unknown cards are
refused and capture stops for review. Current authorization is checked again at
destination; revoked/expired assignments can produce retained unresolved evidence.

For final physical acceptance, prove in order: actual sanitized serial bytes;
three operator-observed presentations; reviewed fictional enrollment; local
committed receipt; process restart with identical pending event; tunnel loss and
recovery; signed server receipt; matching PostgreSQL gate row; Parent/Teacher/
Principal entry visibility and other-family denial; unchanged classroom register.
Do not replace any of those with a mock test result or mark them complete now.
