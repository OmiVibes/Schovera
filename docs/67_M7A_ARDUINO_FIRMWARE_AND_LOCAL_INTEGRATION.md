# M7A — Arduino UNO R4 WiFi firmware and safe local integration

18 November 2026. **M7A firmware and the permitted synthetic dry-run fallback are implemented and tested. Real Arduino-to-gateway ingestion remains blocked pending reviewed physical transport/enrollment/restart handling.** Both firmware configurations compile. No upload or physical hardware result is claimed. The full dependency audit is non-green; its new development-tool finding is recorded below. This is not production acceptance.

## Baseline, inventory and preservation

Fetched `main`/`origin/main` baseline: **`d0e2c6b6e51ab625104b77f22b731755e1471bbf`**. It includes the supplied M6 final `7a1e88a16d743a9b2b37dc2e6b7bc9fcfef7b306` plus the later local-account handoff documentation. M3, M5 and M6 reports, acquisition mapping, HMAC ingress, immutable signed v2 transport/capabilities, queue ownership/retry and credential enrollment boundaries were inspected. No old migration/contract was changed.

Owner-reported inventory: UNO R4 WiFi; optional Nano (unused); RC522-style HW-126 module with unsoldered header; white card and blue fob. No markings, electrical behavior, UID/frequency/compatibility, USB port, upload, Serial output, Wi-Fi link or scan was physically inspected or verified. Raspberry Pi is deferred.

The existing unrelated doc 45 edit, `CLAUDE.md`, `review/`, protected school and previous fictional rehearsal are preserved. The developer `.env.local` was not opened/copied/modified/renamed/hashed. The previous QA retains its dated rehearsal; it was not cleaned or adopted by M7A. A separately owned isolated QA checkout uses approved loopback-only test configuration, fresh scoped test fixtures and the existing local database. No reset, broad seed, real-school enrollment, hosted operation, public exposure or paid provider is used.

Private ignored evidence **E**: `.local/schovera-manual-demo/m7a-20261118/`. It includes code hashes, toolchain/install/compile logs, exact test ledger, owned QA/process paths and protected-data checks. Generated toolchains, binaries, local configuration/passwords/keys and SQLite files are excluded from Git. Docker was stopped initially and started to restore its existing local stack. Its known Vector restarting condition remains an auxiliary-service limit.

## Architecture and deliberate blocker

Existing M3 acquisition shape is `{acquisitionId, sequence, observedAt, eventType}`. The existing trusted host adds reviewed reader/device identity, assignment ID/version, opaque credential reference and signed capability, authenticates durable ingress, commits SQLite before local acknowledgement, and signs/replays immutable v2 events to the authorized local destination. Those responsibilities remain there. A raw UID is not student identity, a scan is not classroom presence/safety, and no reader path confirms attendance.

The new firmware produces only **synthetic observations** over Serial. The new PC endpoint validates them only. It does not instantiate a Supabase client, use a signing key, open a queue, map a child, deliver an event or issue a durable acknowledgement. Its bounded in-memory duplicate/order history is a validation cache, not a second outbox; restart loses it and provisions a new session. It returns `outcome: validated_only`, `durable: false`, `destinationDelivered: false` and `physicalHardwareVerified: false`.

Why no live bridge: the current host boundary is localhost-only, unreachable from a separate Arduino over Wi-Fi. There is no reviewed board authentication/acquisition-to-enrollment mapping, verified clock or restart-persistent sequence/identity/pending storage. USB enumeration/serial origin is not authenticated hardware identity either. Simply adding a LAN listener, copying the v2 signing secret to a board or treating a card UID as a student would bypass required boundaries. M7A does none of these.

The validated message projects into the existing acquisition contract. A focused **unit fixture only** demonstrates unchanged SQLite capture/reopen/duplicate/revoked-reader behavior with synthetic test enrollment. Existing independent gateway/reader integration suites test the signed destination path. These are not proof that the dry-run endpoint, Arduino or a real card delivered to PostgreSQL. Real binding/capability checks are not replaced by the unit fixture's placeholder capability.

## Firmware and protocol

Files live in `hardware/arduino-uno-r4-wifi/`: `diagnostics/diagnostics.ino`, portable `Protocol.h`, empty private-config example, local ignore rules, native assertion program and README. No third-party RFID/JSON library is added. `WiFiS3` comes from the Arduino UNO R4 core.

The sketch initializes Serial at 115200, bounds the initial Serial wait at 1.5 seconds, and schedules built-in LED toggles at 500ms. Serial processing is bounded per loop and commands at 256 bytes; overflow/NUL input is discarded. Wi-Fi is opt-in, status polled every second, with a five-attempt/30-second retry budget. It prints status codes/attempt counts, never SSID/password/key material. Library connection calls can block; actual LED/Serial/Wi-Fi timing and behavior were not measured on a board. No HTTP/DNS/NTP test request or physical reader code exists.

Version 1 JSON, at most 512 UTF-8 bytes:

```json
{"schema":"schovera.arduino.acquisition","version":1,"kind":"synthetic","device":"uno-r4-wifi-phase1","session_id":"00000000-0000-4000-8000-000000000001","acquisition_id":"00000000-0000-4000-8000-000000000002","sequence":1,"observed_at":"2026-11-18T09:00:00.000Z","event_type":"check_in"}
```

These are deterministic **test** values, not a real acquisition. The operator supplies a generated per-run session, unique v4 acquisition UUID, positive sequence (1–2,147,483,647) and canonical UTC millisecond timestamp in years 2000–2099. Firmware/host validate their formats/calendar bounds. The timestamp is host-supplied synthetic input, not a measured card time. Preserve all fields on retry. `ARM` refuses replacement while pending, `RETRY` emits cached bytes, and matching `CLEAR` explicitly discards RAM-only synthetic work. There is no receipt/ACK command and no reboot durability claim. A future real source must persist identity, sequence and time until genuine durable host acceptance.

The host rejects extra fields (including UID/student/enrollment fields), unsupported versions, physical-kind claims, invalid IDs/times/sequences, oversized/malformed bodies and changed-content replay. Same-ID/same-content retry is a duplicate only within that live validation session. Sequence reuse conflicts; gaps/out-of-order remain labelled. A host session expires after 15 minutes, has capacity 128 and can be revoked. The device tag is a declared test label, **not cryptographic board attestation**.

## Local dry-run security and procedure

CLI requires `SCHOVERA_TEST_MODE=local`, approved loopback test files, no `.env.local`, and explicit `SCHOVERA_ARDUINO_TEST_MODE=synthetic`. It binds only **127.0.0.1:3187**. Incoming requests require matching Host, Origin, endpoint, method/content type and a random per-session host-only bearer token. The token is stored in an ignored private file, never printed/compiled into firmware. No CORS wildcard, credentials cookie or public bind option is provided. Body/header/time/session limits and generic failure classes are tested. Trusted local OS/filesystem access remains an assumption, not a sandbox.

Use only the approved isolated QA directory with its explicit local test files; do not run in a developer directory containing production configuration. The actual M7A QA path is recorded in E/qa.json. In terminal 1:

```powershell
Set-Location '<approved isolated QA path>'
$env:SCHOVERA_ARDUINO_TEST_MODE = 'synthetic'
npm run arduino:dry-run
```

The startup line gives an owned sample path and private host-access path, without printing the token. In a second private PowerShell terminal, substitute those exact paths:

```powershell
$access = Get-Content -LiteralPath '<privateHostAccessFile>' -Raw | ConvertFrom-Json
if ($access.endpoint -ne 'http://127.0.0.1:3187/v1/dry-run') { throw 'Unexpected target; stop.' }
$sample = Get-Content -LiteralPath '<sampleFile>' -Raw
Invoke-RestMethod -Uri $access.endpoint -Method Post -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3187';Authorization=('Bearer '+$access.token)} -Body $sample
```

Repeat the identical request to observe `duplicate: true` while it still says not durable/delivered. Stop only terminal 1's own server with Ctrl+C. A restart creates a new session/token; old observations are not silently adopted. No database cleanup is required for this dry-run; its private session files are retained for local review. Do not publish host-access files, firmware config or compiler artifacts.

You may copy the sample's **non-secret observation fields** into Serial `ARM` input, then inspect/retry the emitted JSON manually. Do not copy the host token, Supabase credentials or capability/signing files onto the board. M7A has no automatic COM-port reader and does not certify a physical Serial-to-HTTP path. Status/diagnostic text is not an acquisition message.

## IDE, compilation and physical checks

Use Arduino IDE's board manager to select **Arduino UNO R4 Boards → Arduino UNO R4 WiFi**, open `diagnostics/diagnostics.ino` and choose Verify. [Arduino's board manual](https://docs.arduino.cc/tutorials/uno-r4-wifi/cheat-sheet) documents the bundled WiFiS3 support; the [official core examples](https://github.com/arduino/ArduinoCore-renesas/blob/main/.github/workflows/compile-examples.yml) identify FQBN `arduino:renesas_uno:unor4wifi`. [CLI compile reference](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile).

When CLI is on PATH:

```powershell
arduino-cli core update-index
arduino-cli core install arduino:renesas_uno@1.6.0
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi hardware/arduino-uno-r4-wifi/diagnostics
```

This session instead used the IDE-bundled executable at `C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`, an explicit private `--config-file`, and isolated core/tool/download directories. Arduino CLI **1.6.0**, UNO R4 core **1.6.0**, native MinGW g++ **6.3.0**, Node **22.18.0**. The user's global Arduino cores/configuration were not upgraded. No board enumeration, USB open, upload, radio scan or firmware update was performed.

Upload template for a **later, separately observed USB-only board check**, not executed here:

```powershell
arduino-cli upload --fqbn arduino:renesas_uno:unor4wifi --port '<verified COM port>' hardware/arduino-uno-r4-wifi/diagnostics
```

Never guess the port, select an unrelated device, attach the RC522 or infer upload success from compilation. First establish a suitable data USB cable, correct board/port enumeration and board-only power under supervision. Observe boot text/LED/STATUS at 115200; compare exact repeated JSON; verify overflow/busy/CLEAR behavior. For an approved test network, privately create ignored `local_config.h`, enable Wi-Fi diagnostics, enter its credentials and repeat Verify before any approved upload. Observe connected/disconnected/reconnect statuses separately. An enabled **compile** is not a Wi-Fi test. Binary images may embed Wi-Fi credentials and remain private.

## Electrical restrictions and M7B prerequisites

No RFID wiring or soldering is part of M7A. Keep HW-126 disconnected. The [UNO R4 WiFi official specification](https://docs.arduino.cc/hardware/uno-r4-wifi) states the RA4M1/GPIO side operates at 5V; the [NXP MFRC522 chip datasheet](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf) specifies typical 3.3V supply operation, with relevant maxima around 3.6V. That chip document does **not** establish this unverified HW-126 module's regulator, pinout, genuine IC, level shifting or 5V tolerance. Do not directly connect assumed 5V logic or try loose jumpers in an unsoldered header. No pin map, voltage measurement or electrical compatibility is certified here.

M7B must first identify the exact module/markings, card technology/frequency, board pinout, power/logic limits, required level conversion, properly assembled header and supervised safe power procedure. Then review authenticated Serial/LAN transport, physical acquisition-to-enrollment mapping, private key custody, persistent acquisition ID/sequence/time/pending state, genuine durable acknowledgement and restart recovery. Keep signing, capability/assignment validation and delivery on the trusted host. Test unknown/revoked/lost cards, cloning limitations, clock uncertainty, separate scans versus retry and power/storage failure using synthetic enrollment before any real-school data. Existing manual attendance must remain independent. Raspberry Pi, public hosting, real SMS/calls and school deployment remain deferred.

## Verification, failures and publication

Tests ran in the separately owned QA checkout `C:/Users/Om/AppData/Local/Temp/schovera-m7a-qa-b5bad848`, with loopback Supabase and owned web ports 3106/3105. The old QA rehearsal was preserved. Source and executable configuration comparison found **281 files, zero mismatches**. Existing tracked-file hashes are unchanged except for the three intended package scripts. All **20 protected-school dataset hashes remain unchanged**. There are still **48 migrations**; no schema change, reset or dependency upgrade was performed. Owned test fixtures were cleaned by their suites and the new QA manual-fixture pointer is absent. Owned web process trees were identity-checked and stopped; Docker was left running. QA, private evidence and isolated compiler installations remain available locally, excluded from Git.

| Area | Observed result |
|---|---|
| Default UNO R4 firmware | Compile PASS, official core 1.6.0: **54,496 bytes flash; 8,344 bytes globals** |
| Opt-in Wi-Fi firmware | Compile PASS: **58,316 bytes flash; 8,352 bytes globals**; copied identical sketch/header plus a compile-only fictional SSID, empty password, flag 1; never uploaded |
| Native serialization | PASS: exact portable C++ header executed under g++ with `-std=c++11 -Wall -Wextra -Werror`; actual emitted JSON independently checked by host validator |
| Host validation | Ten targeted tests PASS; malformed/oversized/unknown/raw-UID/physical messages, Host/Origin/auth denial, duplicates/conflicts, ordering, expiry/revocation, client reconnect and SQLite unit projection checked |
| Actual dry-run CLI | PASS: missing-mode refusal, private session files, loopback binding, exact retry, unauthorized denial and fresh session after process restart; no durable/delivery claim |
| Unit/component regression | **376 tests in 48 files PASS**; the ten new tests are included, not additional independent coverage |
| M1/M2 | Attendance draft/final/history/revision/role isolation and review rules PASS; legacy attendance save/history/Principal overview PASS after startup rerun |
| M3/M4 | Reader enrollment/signature/capability/revocation checks, reconciliation, held resolutions, second-tab and reconnect PASS; existing RFID v2 and gateway integration scenarios PASS |
| Offline and portals | School-operation capture, actual process restart, authorized replay/receipt, conflict holds and all three mobile role views PASS; AUD-01 exact communication totals and connected journeys PASS |
| Interface regressions | Staff localization and accessibility/i18n PASS; no UI code changed. Not a fresh exhaustive screenshot/physical-audio audit |
| TypeScript/lint/schema | PASS; no existing assertion or rule weakened; schema lint reports no errors |
| Isolated Next build | PASS with Next **16.4.5**, TypeScript and expected routes; generated `.env.production` only, secret sentinels absent, unchanged-input guard and owned snapshot cleanup passed |
| Dependency audits | Production graph: **0 findings, exit 0**. All dependencies: **16 high development-tool package entries, exit 1**, still open |

Next/eslint-config-next **16.4.5**, Zod **4.6.6** and sharp **0.35.5** were independently checked in QA. Package dependencies, lockfile, migrations, existing attendance/communication writers, RFID signing/transport/enrollment and UI are unchanged. M5 human rehearsal, fluent speech and actual output-device checks were not repeated; Ollama was not started for this phase. These are relevant software regressions, not a complete new M1–M6 release certification.

Build source fingerprint: **`2fd042f68b1f686bb48efc9d438ffe7b74ffa8b48b82345f1902912502a80445`**, 228 approved files. The existing app build snapshot does not compile Arduino firmware; the separate ARM/native checks above provide that evidence. Only `fonts.googleapis.com` and `fonts.gstatic.com` were observed through the limited build proxy, which is not an OS network sandbox.

### Security finding left open

The fresh full npm audit reports **16 affected package entries, all high**, propagated from [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), picomatch repeated-extglob denial of service. The advisory page consulted on 18 November lists affected versions through 4.0.7 and no patched version. The affected direct development dependencies are `eslint-config-next` and `vitest`; this audit's production graph is empty. These entries are not 16 separate exploits, and no application exploit was attempted. No attacker-controlled glob was added by M7A. This is a new current audit result, not a rewrite of M6's historical audit. No blind fix, downgrade, override or warning suppression was applied. A compatible dependency review remains separate; **do not describe all security checks as passing**.

### Failed attempts and reruns

1. The first native compiler invocation rejected misleading indentation in the new serializer under `-Werror`; its formatting was corrected. Warning flags were retained. Subsequent native execution and both ARM configurations pass.
2. The first ARM build under the long isolated toolchain directory failed to locate `bits/c++config.h`, although the file existed. Reusing the isolated toolchain under the shorter owned `%TEMP%/s7a-13dbdb96` path resolved compilation. A path-related tooling problem is suspected; the exact Windows/compiler cause was not independently proved. No global core/configuration was replaced. The failed log remains `E/firmware-compile.log`.
3. Initial new host tests returned 200 for a deliberately invalid Host because the Fetch client did not transmit that override as intended. That same probe failed the targeted run (9/10) and first full run (375/376). The test now uses raw Node HTTP for header-spoof requests and retains the exact 403 expectation. Targeted 10/10 and full 376/376 pass; production authorization code was not weakened.
4. The initial protected-status preparation could not reach stopped Docker. The existing local stack was started. A first QA copier also assumed a `public/` directory that this project does not have; a fresh code-only QA directory corrected preparation. The unused partial directory was not adopted or recursively deleted. Neither attempt seeded/reset the database or read production env contents.
5. The final additional `verify:attendance` was mistakenly started after stopping its owned web server for the other offline test. It failed with `ECONNREFUSED 127.0.0.1:3106`; owned fixture cleanup succeeded. A private restart helper initially attempted to initialize an already existing issuer and correctly refused overwrite. The helper now checks paired file existence and reuses it without reading/rotating the key. After actual HTTP 200 readiness, the unchanged attendance check passed. No application launcher or attendance assertion was changed.
6. One private integrity probe initially expected a README in the executable-only QA copy. It now compares executable/configuration files and records firmware documentation hashes separately; 281 comparisons pass. A process-stop guard initially refused a timestamp-conversion mismatch; exact recorded UTC identity was checked before any process was stopped. These are evidence-helper issues, not product fixes.
7. The full dependency audit remains failed as described above. It was not rerun with excluded dev dependencies and relabelled as a passing full audit; the separate production-only audit is explicitly identified.

### Files changed and handoff

- `hardware/arduino-uno-r4-wifi/`: six files for sketch, portable protocol, private configuration example, ignore rules, native assertions and setup README.
- `scripts/arduino-local/`: protocol/session validator, localhost server, guarded CLI and ten new tests.
- `scripts/verify-arduino-protocol.mjs`: native compiler/execution/independent JSON check, with guarded temporary cleanup.
- `package.json`: only `arduino:dry-run`, `test:arduino`, `verify:arduino-protocol` scripts added.
- This report: setup, boundaries, evidence, failures and M7B handoff.

Credentials/real student data, private configuration, binaries, databases, installer/toolchain downloads and evidence logs are excluded. Pattern scan plus manual review of the 13 candidate files found only explicit fictional samples/unit credentials, not real firmware passwords or privileged tokens. This is a scoped publication review, not proof that arbitrary files elsewhere in the repository contain no secrets.

**Ready for M7A software review using the documented dry-run fallback. Not ready for real reader acceptance.** Remaining work belongs to M7B and separate security/manual acceptance; no physical work or automatic milestone advancement is authorized by this result.

### Exact execution ledger

**38 recorded executions: 34 PASS, 4 FAIL.** Preparation/compiler experiments outside this runner are described above and are not added to these totals. Timestamps are UTC on 18 November 2026; add 05:30 for IST. `E` is the ignored evidence directory specified earlier; firmware commands substitute its absolute path. All commands use the owned QA checkout except native protocol, firmware compilation and the root isolated build. Full working directories, end times and redacted output are retained in `E/results.json` and the named logs.

| # | Command | UTC start | Exit | Result | Log under E |
|---:|---|---|---:|---|---|
| 1 | `npm ci --offline --no-audit --no-fund` | 05:19:06.148 | 0 | PASS | `01-install-qa-1794979197523.log` |
| 2 | `node --env-file=.env.test.local .local/m7a/preserve.mjs` | 05:19:57.639 | 0 | PASS | `02-m7a-preserve-1794979198743.log` |
| 3 | `npm run test:arduino` | 05:19:58.797 | 1 | FAIL | `03-test-arduino-1794979201425.log` |
| 4 | `npm run verify:arduino-protocol` | 05:20:01.467 | 0 | PASS | `04-verify-arduino-protocol-1794979203939.log` |
| 5 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 05:20:03.977 | 1 | FAIL | `05-units-1794979251309.log` |
| 6 | `npm run typecheck` | 05:20:51.385 | 0 | PASS | `06-typecheck-1794979263480.log` |
| 7 | `npm run lint` | 05:21:03.532 | 0 | PASS | `07-lint-1794979285012.log` |
| 8 | `npm run test:arduino` | 05:21:32.970 | 0 | PASS | `08-test-arduino-1794979294919.log` |
| 9 | `node --env-file=.env.test.local .local/m7a/cli-smoke.mjs` | 05:22:46.893 | 0 | PASS | `09-m7a-cli-smoke-1794979367434.log` |
| 10 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 05:22:47.514 | 0 | PASS | `10-units-1794979413571.log` |
| 11 | `npm run typecheck` | 05:23:33.617 | 0 | PASS | `11-typecheck-1794979425856.log` |
| 12 | `npm run lint` | 05:23:45.905 | 0 | PASS | `12-lint-1794979445095.log` |
| 13 | `npm run verify:arduino-protocol` | 05:24:05.141 | 0 | PASS | `13-verify-arduino-protocol-1794979447153.log` |
| 14 | `npm run verify:attendance-integrity` | 05:24:07.204 | 0 | PASS | `14-verify-attendance-integrity-1794979469375.log` |
| 15 | `npm run verify:attendance-review` | 05:24:29.951 | 0 | PASS | `15-verify-attendance-review-1794979494415.log` |
| 16 | `npm run verify:reader-readiness` | 05:24:54.858 | 0 | PASS | `16-verify-reader-readiness-1794979513677.log` |
| 17 | `npm run verify:held-resolutions` | 05:25:13.764 | 0 | PASS | `17-verify-held-resolutions-1794979522905.log` |
| 18 | `npm run verify:second-tab` | 05:25:22.945 | 0 | PASS | `18-verify-second-tab-1794979530320.log` |
| 19 | `npm run verify:reconnect` | 05:25:30.370 | 0 | PASS | `19-verify-reconnect-1794979560175.log` |
| 20 | `npm run verify:principal-communication` | 05:26:00.546 | 0 | PASS | `20-verify-principal-communication-1794979594954.log` |
| 21 | `npm run verify:final-journeys` | 05:26:35.141 | 0 | PASS | `21-verify-final-journeys-1794979639730.log` |
| 22 | `npm run test:rfid:integration` | 05:27:20.248 | 0 | PASS | `22-test-rfid-integration-1794979644944.log` |
| 23 | `npm run test:gateway:local-integration` | 05:27:24.986 | 0 | PASS | `23-test-gateway-local-integration-1794979666435.log` |
| 24 | `npm run verify:staff-localization` | 05:27:46.476 | 0 | PASS | `24-verify-staff-localization-1794979685424.log` |
| 25 | `npm run verify:accessibility-i18n` | 05:28:05.500 | 0 | PASS | `25-verify-accessibility-i18n-1794979693834.log` |
| 26 | `node --env-file=.env.test.local .local/m7a/preserve.mjs` | 05:28:13.873 | 0 | PASS | `26-m7a-preserve-1794979694233.log` |
| 27 | `npm run verify:school-operations` | 05:31:21.220 | 0 | PASS | `27-verify-school-operations-1794979917923.log` |
| 28 | `npx --no-install supabase db lint --local` | 05:31:57.967 | 0 | PASS | `28-schema-lint-1794979922086.log` |
| 29 | `"C:/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe" --config-file E/arduino-short.yaml compile --fqbn arduino:renesas_uno:unor4wifi --build-path E/firmware-build-short hardware/arduino-uno-r4-wifi/diagnostics` | 05:32:02.129 | 0 | PASS | `29-firmware-default-1794979934705.log` |
| 30 | `"C:/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe" --config-file E/arduino-short.yaml compile --fqbn arduino:renesas_uno:unor4wifi --build-path E/firmware-wifi-build E/wifi-compile-only/diagnostics` | 05:32:14.743 | 0 | PASS | `30-firmware-wifi-1794979948104.log` |
| 31 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 05:32:28.144 | 0 | PASS | `31-audit-production-1794979949973.log` |
| 32 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 05:32:30.018 | 1 | FAIL | `32-audit-dependencies-1794980022816.log` |
| 33 | `npm run build:isolated -- --working-tree` | 05:33:42.860 | 0 | PASS | `33-build-isolated-1794980094838.log` |
| 34 | `node --env-file=.env.test.local .local/m7a/preserve.mjs` | 05:34:54.938 | 0 | PASS | `34-m7a-preserve-1794980096011.log` |
| 35 | `npm run verify:attendance` | 05:35:02.178 | 1 | FAIL | `35-verify-attendance-1794980105393.log` |
| 36 | `node --env-file=.env.test.local .local/m7a/preserve.mjs` | 05:35:05.435 | 0 | PASS | `36-m7a-preserve-1794980105795.log` |
| 37 | `npm run verify:attendance` | 05:36:18.261 | 0 | PASS | `37-verify-attendance-1794980182958.log` |
| 38 | `node --env-file=.env.test.local .local/m7a/preserve.mjs` | 05:36:23.005 | 0 | PASS | `38-m7a-preserve-1794980183460.log` |

Private integrity command: `node .local/schovera-manual-demo/m7a-20261118/integrity.mjs` - final exit 0, preservation and 281 executable/config comparisons passed. Native/toolchain temp paths, owned startup/shutdown observations and source-review manifest remain in E. No test assertion was weakened to obtain a pass.

### Git checkpoint

Implementation and executed verification report published to `origin/main`: **[`4e2e6240f05a0bf6a083ae30a343ad94511346f0`](https://github.com/OmiVibes/Schovera/commit/4e2e6240f05a0bf6a083ae30a343ad94511346f0)**. `git push origin main` succeeded; `git ls-remote origin refs/heads/main` matched the local SHA, and the GitHub connector independently returned that exact commit and canonical URL. This publication-evidence addition is a separate documentation checkpoint; its final SHA is provided in the handoff. No force-push, merge bypass, deployment, empty commit or artificial activity was used.

After the implementation push, remaining working-tree entries were exactly the pre-existing unrelated work below. They are preserved and excluded from both M7A commits. The only subsequent change is this documentation evidence, with no executable changes after testing.

```text
 M docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md
?? CLAUDE.md
?? review/
```

Local compilation and publication do not imply production security acceptance. The development-tool audit finding, actual device checks and secure physical ingestion remain pending as described above. Stop at M7A; do not wire, upload or begin M7B from these software results.
