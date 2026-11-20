# Nano + RC522 source reference

The owner supplied `schovera_nano_rfid.ino` from the Arduino IDE hardware work.
It is archived unchanged for development continuity. Its presence is not proof
that it matches the currently flashed device, compiles with an installed board
package, or has passed an electrical or physical-reader acceptance test.

Source requirements: SPI and the MFRC522 Arduino library; Serial is 115200 baud.
The sketch prints legacy `SCHOVERA_SCAN,<UID>,<millis>` observations. It has no
acknowledgement, durable acquisition identity, host command parser or replay
buffer. Its SS/RST constants are source settings, not approved wiring guidance.

The firmware prints raw card identifiers to its serial output. Keep Serial
Monitor output private; use the host's sanitized diagnostics for ordinary logs.
Do not commit serial recordings or real card identifiers. A UID identifies a
card and is not secure proof of a student's identity or classroom attendance.

See [the physical adapter guide](../../scripts/physical-rfid/README.md).
The reference host protocol is not implemented by this sketch. Firmware changes,
upload, wiring, enrollment and real backend writes require separate review.
No firmware compilation or upload was performed for this publication checkpoint.
