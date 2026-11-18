# UNO R4 WiFi — M7A diagnostics, no RFID wiring

Use [the M7A report](../../docs/67_M7A_ARDUINO_FIRMWARE_AND_LOCAL_INTEGRATION.md) for observed tests, limitations and handoff. This sketch uses the built-in LED and Serial. It has no RFID library, student mapping, gateway signing key, Supabase key, HTTP client or attendance writer. Wi-Fi diagnostics default **off**.

For the operator-controlled Windows USB bridge, use [M7B setup and observed results](../../docs/68_M7B_USB_SERIAL_BRIDGE.md). It validates synthetic Serial observations only; durable gateway ingestion and physical RFID remain separate work.

[M7C's explicitly fictional host integration](../../docs/69_M7C_DURABLE_USB_GATEWAY_INTEGRATION.md) reuses the existing durable gateway with reviewed test enrollment and real receipts. It does not add RFID reading or source power-loss durability to this firmware.

Open `diagnostics/diagnostics.ino` in Arduino IDE, install/select **Arduino UNO R4 Boards → Arduino UNO R4 WiFi**, and use **Verify**. Its FQBN is `arduino:renesas_uno:unor4wifi`. Compile does not require a connected board. Upload and physical checks remain separate and unverified; leave the HW-126/RC522 completely disconnected for M7A. Do not flash the ESP32-S3 separately or select a Nano/AVR target for this sketch.

Serial Monitor: **115200 baud**, newline ending. Commands:

```text
STATUS
ARM 00000000-0000-4000-8000-000000000001 00000000-0000-4000-8000-000000000002 1 2026-11-18T09:00:00.000Z
RETRY
CLEAR 00000000-0000-4000-8000-000000000002
```

Those fixed UUID/time values are a serialization example, not a fresh physical observation or a default production enrollment. Use the localhost simulator's generated session/sample for its own request. `ARM` emits one explicitly synthetic JSON line and retains it in RAM. `RETRY` emits exactly the same bytes/time/identity; a new ARM is refused while pending. `CLEAR` deliberately discards that fake RAM observation. **No command acknowledges a durable host save. A reboot loses RAM state.** No real-card source is supported.

For a separately approved Wi-Fi diagnostic, copy `local_config.example.h` to ignored `local_config.h`, set the flag to `1`, and enter only that test network's SSID/password privately. The sketch reports status transitions and at most five connection attempts, at least 30 seconds apart; `WIFI_RETRY` resets that diagnostic attempt budget. Status is polled at one-second intervals. `WiFi.begin` may block according to the board library; runtime responsiveness has not been measured. Credentials are not printed; binaries containing credentials must also stay private.

The endpoint setting is restricted in status output to `http://127.0.0.1:3187/v1/dry-run`, belonging to the **PC**. The sketch never contacts it. An Arduino's own `127.0.0.1` is not the PC; do not change the host listener to a public/LAN bind to make Wi-Fi appear integrated. A reviewed physical transport/enrollment design is required first.

Native serializer test (if a host `g++` is available): `npm run verify:arduino-protocol`. It executes the exact portable `Protocol.h` code and validates its output independently with the host schema. Board compilation, native execution, upload, Serial output, Wi-Fi connectivity and a physical RFID scan are different evidence categories.
