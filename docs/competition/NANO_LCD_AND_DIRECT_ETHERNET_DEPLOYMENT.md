# Schovera Nano, LCD and direct Ethernet handoff

This is a deployment handoff for the Windows application + Raspberry Pi gateway. It is not physical acceptance: the Nano, RC522 and LCD were not available to this development session, and the edited sketch was not compiled or uploaded. The checked-in sketch is source evidence only; confirm separately that it matches the firmware on the board.

## What the software now does

- The Nano keeps emitting the existing `SCHOVERA_SCAN,<UID>,<millis>` line unchanged. The LCD extension adds a separate, bounded `SCHOVERA_LCD,1,WELCOME,<hex>` command and a `SCHOVERA_LCD_SHOWN,1` response. It accepts printable ASCII only, caps the frame/name, and returns to `SCHOVERA` / `TAP YOUR CARD` after three seconds. The `hd44780` I2C backpack library auto-detects the display; wire SDA to A4 and SCL to A5 only after the physical wiring is reviewed.
- The signed event API includes a display name only after it has accepted the event and can resolve that exact persisted event within the enrolled device's school. Unresolved events do not return a name.
- The Pi command's LCD options bind the callback to one exact pending event and device. The event must receive an accepted signed API receipt and be marked delivered in the existing SQLite queue before the display worker can open the serial device. LCD failure does not undo or relabel the delivered event. The name travels to the worker through stdin, not command-line arguments or logs. No raw UID is logged by this extension.
- The Teacher school-entry panel already refreshes through its bounded authorized polling/Realtime-reconnect path while open. It remains a school-entry view. Gate events do not mark or finalize classroom attendance.

No migration or new enrollment policy is part of the LCD change. Use the existing approved device enrollment, capability and card-to-fictional-student mapping workflow; do not place a real learner's name, UID, key or capability in source/config examples.

## Dependencies and unverified hardware details

For an Arduino Nano (ATmega328P), compile with the Arduino AVR core and the existing MFRC522 library plus Bill Perry's `hd44780` library. A board bootloader variant may affect upload settings; identify it on the target board instead of assuming old/new bootloader. The sketch was not compiled here because Arduino CLI/toolchain and the physical board were unavailable.

Use a 16x2 I2C LCD backpack supported by `hd44780_I2Cexp`. Confirm its address, contrast, power, and Nano logic-level compatibility at the actual bench. This handoff does not certify RC522 or LCD electrical compatibility, prove a card scan, or prove the installed firmware matches this source.

## Windows application and Pi tunnel

First preserve Arohi's existing Teacher refresh edits on her laptop. On that laptop, inspect `git status --short` and review all modified/untracked files. Save her work in a separate reviewed commit/branch or a complete patch including any untracked files before fetching. Do not use reset, clean or overwrite. Then fetch and integrate the published Schovera change using a reviewed merge/rebase appropriate to her branch; stop on conflict and reconcile the Teacher refresh deliberately. Install dependencies from the repository lockfile (`npm ci`) only after this reconciliation and after confirming her Node version satisfies `package.json` (`>=20.9 <23`).

Use the existing guarded local setup and environment files already provisioned for the competition laptop. Never copy the development laptop's `.env*`, database, private keys or local SQLite file. Initialize local Supabase from [the reviewed second-laptop procedure](SECOND_LAPTOP_SETUP.md) and a fresh synthetic rehearsal dataset; verify its loopback URL and Auth before starting the web app. On an already prepared checkout/QA installation, the existing one-click launcher is:

```powershell
.\scripts\competition\start-schovera.ps1 -PiHost '<VERIFIED_PI_HOST>'
```

It checks the guarded competition workflow and starts/maintains the existing strict SSH tunnel guardian. This does not provision a new laptop or create a tunnel key/host trust. Do not put an unverified host into the shortcut. The tunnel must forward only the Pi's loopback listener to the laptop's loopback Next API. Do not expose Supabase/Postgres or bind the API publicly.

Example tunnel shape (replace host/user/ports only with the independently verified destination values; keep `StrictHostKeyChecking=yes`):

```powershell
ssh -NT -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 `
  -R 127.0.0.1:<PI_LOOPBACK_PORT>:127.0.0.1:<WINDOWS_APP_PORT> <PI_USER>@<VERIFIED_PI_HOST>
```

Do not change persistent network configuration as part of the software deploy. A temporary direct Ethernet link can use a private point-to-point subnet with static addresses and **no default gateway or DNS** on that Ethernet interface, leaving Wi-Fi as the Internet default route and the existing Pi hotspot untouched. Before applying such settings, inspect adapters, routes and subnet conflicts on both devices; the exact addresses and interface names must be chosen for the destination environment. Persistent NetworkManager/Windows adapter changes require separate owner approval. Confirm the Pi tunnel listener is bound only to `127.0.0.1`.

## One-event demonstration sequence

Run only after the software has been reviewed/deployed, the laptop's local Supabase/Auth and guarded app are healthy, a fresh synthetic school is enrolled, and the approved Pi tunnel is connected:

1. Confirm the LCD starts at `SCHOVERA` / `TAP YOUR CARD` and that the serial monitor is closed. Opening the port can reset the Nano even when DTR is requested low.
2. Use the already reviewed one-event physical capture workflow; explicitly confirm the card is enrolled to the intended fictional learner. Capture must use the registered physical device, signed capability and strict one-event bound.
3. Record the exact newly captured event UUID from sanitized operator output. Do not run an unscoped sync if the queue contains unrelated events.
4. Deliver just that event and request its post-receipt LCD display. On the Pi, use the deployed CLI's exact flags:

   ```sh
   node scripts/rfid-gateway/cli.mjs sync-v2 --local-only \
     --target http://127.0.0.1:<PI_LOOPBACK_PORT> \
     --database <EXISTING_IGNORED_GATEWAY_SQLITE_PATH> \
     --device-key-file <EXISTING_PRIVATE_DEVICE_KEY_PATH> \
     --lcd-event-id <NEW_EVENT_UUID> \
     --lcd-device-id <REGISTERED_PHYSICAL_DEVICE_UUID> \
     --lcd-port '/dev/serial/by-id/<EXACT_CONFIRMED_USB_DEVICE>' \
     --lcd-usb-id '<VENDOR:PRODUCT:SERIAL>' \
     --ack-lcd-reset-risk --confirm-monitor-closed
   ```

   Substitute values privately after verifying them; do not paste the private key path's contents or any capability into chat/logs. Keep `--target` loopback-only and the tunnel active. The LCD serial open may reset the Nano, so the CLI requires explicit reset-risk and closed-monitor confirmations. A missing display/ACK leaves the event delivered and reports a display issue; it does not justify replaying or recapturing the event.
5. Verify the same event appears as school-entry evidence for the authorized Principal, assigned Teacher and linked Parent, and is absent for an unlinked Parent. Separately query/inspect classroom attendance and confirm it did not change. The Teacher panel refresh is bounded; if it is not immediately visible, wait for the normal refresh/reconnect cycle and refresh the page.

The above is a command template, not approval to capture or deliver. No live capture, event delivery, LCD write, enrollment or backend request was performed for this change.

## Minimal remote checklist

### Competition Windows laptop

1. Preserve and reconcile Arohi's uncommitted Teacher portal refresh changes before integrating this source. The original development laptop cannot inspect those files, so no reconciliation is claimed here.
2. Install supported Node 22.x, Git, Docker Desktop with WSL2, and the project's locked dependencies. Confirm virtualization and adequate free disk/RAM before starting local Supabase. Do not attempt to run the full Supabase stack on the 4 GB Pi.
3. Clone/fetch reviewed source, run `npm ci`, use the approved local Supabase init/migration and synthetic-data preparation instructions, then use the repository's guarded local app launcher. Keep secrets and destination-specific keys local and ignored.
4. Verify the app and local Auth, then start the strict-host-key SSH tunnel. Do not import the development database or developer environment.

### Raspberry Pi

1. Confirm the exact checkout revision and preserve any Pi working-tree changes. Install supported Node 22.x and Python 3 from approved packages; no Supabase Docker stack is needed on the Pi.
2. Deploy reviewed source without copying `.env*`, Windows `node_modules`, database files, device private keys or approval artifacts. Use the existing private gateway SQLite DB and registered key/capability in place.
3. Confirm the existing gateway/tunnel endpoints and serial by-id identity. Do not change firmware, USB permissions, network profiles, hotspot, or persistent services without separate review.
4. Run mocked tests on the deployed source if its development dependencies are available. Only then execute the separately reviewed physical one-event capture and exact-event delivery sequence.

## Evidence and remaining acceptance

The local changes passed 55 focused Vitest tests, 4 Python LCD-worker validation tests, TypeScript, and ESLint. The API/database integration suite, production build, Arduino compile/upload, Windows cold start, Internet-disconnected rehearsal, direct-Ethernet persistence, and physical Nano/RC522/LCD scan are not claimed as run or passed here. Arohi's laptop changes must be reconciled before deployment. Competition readiness remains conditional on those target-device and physical acceptance steps.
