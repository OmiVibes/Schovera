# Pi software integration milestone and controlled physical validation

20 November 2026. **Software-only integration PASS; physical RFID acceptance pending.** No serial opening, firmware change, wiring change, network reconfiguration or Pi Supabase startup is authorized by this record. No commit or push is performed.

## Completed milestone

The owner executed the approved one-shot synthetic probe on the Raspberry Pi through the existing SQLite gateway, signed v2 transport and loopback-only SSH reverse tunnel to the Windows local API/database. This was not a Nano acquisition or a real card scan. The probe device remains a local simulator; it must not be relabelled as physical hardware.

| Check | Observed result | Evidence source |
|---|---|---|
| Original submission / identical retry | HTTP 202 / 200; duplicate false / true | Owner's Pi result |
| Durable queue | One row, two attempts, delivered; identical payload | Owner's Pi result |
| Authoritative destination | One gate event and one device receipt | Saved Windows verification and owner confirmation |
| Payload / immutable assignment | Both matched | Saved Windows verification |
| Classroom attendance | Zero rows for the fictional probe scope | Saved Windows verification |
| Read authorization | Principal 1, Teacher 1, linked Parent 1, unlinked Parent 0 | Saved Windows verification |
| Protected data | All 20 protected-school dataset hashes unchanged | Owner's Windows preservation result |

The assistant inspected the retained, sanitized Windows `after-server-verification.json`; it records `authoritativeDatabaseVerified: true` and `hardwareVerified: false`. It identifies event `5153b904-2685-49ff-99e8-c0031caff4f0` and receipt `f9005978-7abd-4e06-82d5-29f1b31ce13d`. Private evidence is under ignored `.local/schovera-manual-demo/pi-software-probe-8adb602c/`; account journals, keys and capability configuration must remain private. Pi execution and preservation results are operator-reported; they were not independently executed over SSH by the assistant in this documentation step.

The retry deliberately exercised destination acceptance followed by an identical retransmission using the existing delivery mechanism. It demonstrates software authentication, persistence and idempotency within the owned fictional fixture. It does not establish Nano source durability, physical tap identity, a physical network outage or real-family delivery. Do not rerun the one-shot sender or delete its delivered queue row/marker. Retain the existing fixture and receipts until a separately reviewed cleanup.

The deployed source ZIP remains frozen at SHA-256 `3a0457d0d6cb1884dec54ffb48678fb992aeaed191e8a39d9ac88f59a9924435`, with 17 reviewed files based on `7f22280d083102dbef1ca3f906d71b4392e484e0`. This follow-up documentation is not in that ZIP. No second transfer, patch application or migration is required for this milestone record.

## Reset review: reference behavior established, actual unit unknown

Arduino documents the classic Nano's FT232RL DTR-to-reset coupling through a 100 nF capacitor. That establishes a reset risk for the reference board, not the exact wiring of this unit. FTDI metadata `0403:6001:BG02XZ38` identifies the USB interface, not the MCU variant, reset circuit or reader voltage protection. [Arduino Nano documentation](https://store.arduino.cc/products/arduino-nano).

The deployed `scripts/physical-rfid/linux-readonly.py` opens the read-only descriptor before setting DTR and RTS. Consequently, selecting DTR off cannot guarantee that the driver has not already generated a reset transition at opening; closing may also change modem-control lines. Read-only means no serial payload commands, not absence of electrical control-line effects. No reset-free claim is justified, and no automatic DTR experiment or repeated open/close loop is planned.

The inspected `hardware/arduino-nano-rc522/schovera_nano_rfid.ino` calls `SPI.begin()` and `rfid.PCD_Init()` during setup, before printing READY. Simply applying USB power runs reader initialization; withholding serial capture does not prevent this. The repository sketch is not independent proof of the currently flashed binary. A READY indication is consistent with setup execution, but its absence is not proof that opening did not reset the Nano: initial bytes can be missed, and reader initialization can affect startup.

## Electrical review: not cleared for powered reader testing

The classic Nano reference uses 5 V I/O. NXP specifies the MFRC522 digital input absolute limit relative to its I/O supply, not blanket 5 V tolerance. Direct 5 V signals into a 3.3 V-powered MFRC522 are therefore not cleared. Absolute maximum ratings are not operating targets. A module regulator alone does not establish signal-level translation. [Arduino Nano specifications](https://store.arduino.cc/products/arduino-nano), [NXP MFRC522 datasheet, sections 14–15](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf).

Before powering the connected reader, review the exact Nano/reader module and wiring, including Nano-to-reader SCK, MOSI, SS and RST, the MISO return threshold, ground reference and supply current capacity. The sketch assigns SS to D10 and RST to D9; the reference Nano uses D11/D12/D13 for MOSI/MISO/SCK. These are source/reference facts, not verified wiring instructions. Identify any translator and regulator by part number; check direction, SPI timing, output levels and power sequencing. Do not assume an unspecified bidirectional I2C level shifter is suitable for SPI, or that the Nano's 3.3 V pin has sufficient reader power capacity.

The reported unknown reader response `0x82` and intermittent reads remain unresolved observations. They do not establish correct power, compatible logic, genuine reader silicon or reliable card acceptance.

## Next controlled stages

Each gate below requires its stated evidence before advancing. This plan is not permission to start capture.

1. **Unpowered inspection first.** Disconnect USB and every other supply before touching connections. Provide clear front/back photographs of both boards, readable chip/module markings, a wire-by-wire map, supply source and any level translator/regulator part numbers. No card UID or credentials are needed. Review these against the actual board documents; unresolved electrical compatibility blocks connected-reader power-up. Do not hot-plug reader wires.
2. **Metadata-only preflight.** With reader electrically isolated and a separately agreed Nano-only setup, confirm the exact by-id path and USB identity, current permissions/groups and visible port users. Do not change permissions, kill processes or run serial-monitor/stty/capture commands. The inspection commands below do not intentionally open the serial stream.
3. **Separately approved Nano-only reset observation.** After confirming RC522 power and signal leads are disconnected with power off, obtain explicit approval for one bounded read-only opening, initially no more than 10 seconds at 115200, with reviewed DTR choice and RTS off. Close Serial Monitor/Plotter first. No serial writes, backend calls, enrollment or queue writes. Record opening/closing, sanitized READY/version counts, disconnects and any independently observed reboot indication. If evidence cannot establish reset behavior, retain UNKNOWN; do not infer reset-free operation from silence. Any reset-line instrumentation must be separately reviewed and performed by a competent operator. Do not cut reset traces, add reset-disabling components or alter firmware.
4. **Electrical acceptance before reconnecting RC522.** Resolve the board-specific supply/logic design and any necessary hardware changes separately. Only after approval, with all power removed, connect the reviewed circuit. A qualified bench check must confirm supply and signal compatibility against the actual parts' limits. Photographs alone do not certify operating voltages. Stop for unexpected heating, unstable power or unresolved wiring.
5. **Separately approved physical read-only test.** Use only the exact stable device below and the existing bounded monitor for at most 30 seconds. Operator removes and re-presents the card three times, spaced beyond the sketch's two-second cooldown. Report sanitized scan counts, legacy-format recognition, invalid/oversized frames, duplicate tuples, uptime regressions, READY markers and disconnects. Do not record raw UIDs or terminal dumps. Three CSV tuples alone do not prove three physical presentations; correlate with the operator's observations. No backend or queue writes at this stage. Stop on unexpected reset/disconnect or malformed output; do not auto-reconnect.
6. **Reviewed fictional enrollment, then separately approved end-to-end hardware test.** Establish an explicit physical-device identity, fictional student/card binding and private enrollment. Do not reuse the simulator's identity as if it were a Nano. Only then approve bounded real acquisition through the existing SQLite queue and signed v2 pipeline. Verify a durable local receipt, same-event restart/retry, destination receipt and gate row, dashboard visibility/other-family denial, unchanged classroom register and all 20 protected hashes. Plan tunnel interruption/recovery separately; retain queued work and avoid network reconfiguration.

Metadata-only commands for a later agreed Nano-only preflight:

```bash
reader='/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0'
readlink -f -- "$reader"
ls -l -- "$reader" /dev/ttyUSB0
id
udevadm info --query=property --name="$reader" | grep -E '^(ID_VENDOR_ID|ID_MODEL_ID|ID_SERIAL_SHORT)='
fuser -v /dev/ttyUSB0
printf 'fuser_exit=%s\n' "$?"
```

Expected identity is exactly `0403:6001:BG02XZ38`. A missing device, different identity, permissions error or visible port owner blocks opening. `fuser` exit 1 with no output indicates no reported visible owner; it does not prove all privileged processes were visible. Do not select another port automatically. Keep the existing SSH tunnel/network configuration unchanged and Pi Supabase stopped throughout.

## Verification of this documentation update

Only this report and the milestone links/status in docs/74 and `scripts/physical-rfid/RASPBERRY_PI.md` are changed by this follow-up. The historical staged evidence remains in docs/74. No application, gateway, firmware, database, configuration or private enrollment file is changed. The saved authoritative verification and source/reset implementation were reviewed; documentation whitespace and firmware diff checks are run locally. No application suite or hardware test is rerun for these documentation-only changes. Existing uncommitted source and unrelated files are preserved; nothing is staged, committed or pushed.

**Immediate next step: unpowered board/wiring identification. Actual reset behavior and electrical compatibility remain pending, and capture remains blocked.**

## Later physical serial checkpoint — 20 November 2026

The owner subsequently completed the separately approved Nano-only diagnostic and
30-second Nano/RC522 read-only test. The latter reported three valid distinct scan
tuples, zero repeated/invalid frames, zero serial payload/backend writes and clean
automatic closure. This advances physical serial acquisition only; it does not
certify electrical compatibility or scan-to-database/dashboard integration.
[Milestone 76](76_NANO_PHYSICAL_SERIAL_MILESTONE_AND_GATEWAY_TEST_PLAN.md)
retains the results, reset evidence limits and the next explicit approval gates.
The earlier unpowered-inspection/awaiting-capture text above records its historical
checkpoint, not a repeated photo request or a claim that no later capture occurred.
No live gateway writes or new enrollment are authorized by this update.
