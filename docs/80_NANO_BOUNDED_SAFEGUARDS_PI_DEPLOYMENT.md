# Nano bounded safeguards — Raspberry Pi deployment

21 November 2026. **Six-file software deployment and non-live verification: PASS.** This milestone records the owner-approved safeguards deployed to the existing Raspberry Pi checkout. It does not certify an RFID card mapping, physical scan-to-gateway delivery, Raspberry Pi Supabase, or school operation.

## Scope and pre-apply gate

The deployment used `/home/schovera/Schovera` on the Pi and the review archive `/home/schovera/Schovera-nano-safeguards-050c482ccca4.zip`. The owner approved applying only the six paths in the reviewed package, provided the archive, patch, Git base, before-hashes and `git apply --check` all passed immediately before application.

The one-time Pi runner rechecked the archive SHA-256 `050c482ccca4bd9055a85bc8431b1b7f18489c8be257d594de37162655524793`, patch SHA-256 `d4cf5ba5b804b939937b9e1c72a00928b4ac7a637a237ddb699bb5b1b55685f8`, base revision `7f22280d083102dbef1ca3f906d71b4392e484e0`, exact six-path set, all three existing-file before-hashes, absence of the three new files and `git apply --check`. The Pi reported every gate passed immediately before application.

The deployment was applied once from the verified patch bytes. No `--reject`, reset, checkout, migration, database write or environment-file operation was used. The runner also compared Git status outside the approved paths before and after application; it reported no unrelated status changes.

## Deployed files and after-hashes

| File | SHA-256 after application |
|---|---|
| `scripts/physical-rfid/bounded-gateway.mjs` | `e87e8f5ff1789e0762536fa8a2c84b75bd6a74d84c047bf08cdb4e87fb78d2df` |
| `scripts/physical-rfid/bounded-test-cli.mjs` | `33344f9a244db91642d6b616e7e140557dd183c76ad9a1ea909535747653b10f` |
| `scripts/physical-rfid/bounded-gateway.test.mjs` | `99db5fa52d45e7261c38cc7eb0290256a13eb49d478d928c9a731b8e2a361351` |
| `scripts/physical-rfid/linux-gateway-capture.mjs` | `641c4caa44c753601a940e9c48286bc064d9b6bcaf46adc9f02c0fa90d8a8062` |
| `scripts/physical-rfid/legacy-gateway.mjs` | `3f6c3234c09b65f956361772238416fa0919fe63d9c45cfbdc65c76627b842c5` |
| `scripts/rfid-gateway/storage.mjs` | `3f938c6ea44022753ba12906e2260983a8a03900a7887ee7a5650b9105bbd16d` |

These exactly match the reviewed manifest's proposed after-hashes. The full diff, before-hashes and archive metadata remain in [Milestone 79](79_NANO_SOURCE_REVIEW_AND_RESPONSE_TRANSFER.md) and its ignored review artifact directory.

## Verification results

The owner ran `/tmp/schovera-apply-reviewed-patch-d1414d0c342b.py` after verifying its SHA-256 `d1414d0c342bd0a3479420d37c9ca4d0b9b3e99f0e31ca0c9ef34ec766234f2e`. The runner printed:

- Patch applied to the exact six reviewed paths; all six post-application SHA-256 values matched.
- Archive, patch, Git base, before-hashes, path set and pre-application `git apply --check` passed.
- `node --check` passed on all six `.mjs` files.
- `scripts/physical-rfid/bounded-gateway.test.mjs` and `scripts/physical-rfid/legacy-gateway.test.mjs`: **38 passed in 2 files** (26 and 12).
- Existing `scripts/arduino-local/serial.test.mjs`: **exit 0; 21 passed, 1 skipped out of 22**. The skip is retained as reported; this is not 22 passing tests.
- Overall runner result: `SOFTWARE VERIFICATION PASS`.

Node emitted its experimental SQLite warning during the legacy-gateway unit tests. No test assertion was changed to obtain these results.

## Safety boundary and remaining work

The runner exercised mocked gateway transports and temporary test databases only. It did not open the Nano serial port, read a card, write a gate event, deliver a queued event, contact the backend, or access the persistent SQLite gateway queue. It did not read the private key or enrollment response. Firmware, network/tunnel configuration and Pi Supabase were not changed or restarted. The source transfer response remains a separate fictional enrollment artifact.

This deployment proves software guard behavior under the focused unit tests. It does **not** prove that the current physical card has a reviewed fictional enrollment mapping, that the actual Nano acquisition will be accepted by the bounded capture configuration, or that an end-to-end event will be durably delivered and visible in the portals. No physical capture or event delivery was authorized or attempted here.

No commit or push was made. The temporary runner was transferred to `/tmp` for this approved operation; its cleanup was not reported and is not claimed.

## Next approval gate

Deployment is complete. The next separate approval must explicitly cover the fictional physical-card credential mapping and a bounded live capture/delivery test, including the exact event limit and local destination. Until then, do not capture a card or send a gate event. Pi Supabase remains stopped.
