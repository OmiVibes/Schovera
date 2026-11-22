# Nano fictional enrollment and registration checkpoint

20 November 2026. **Fictional fixture and separate Nano device registered; scoped response prepared and not transferred.** Enrollment-only approval does not authorize physical capture, queue access/delivery, safeguard deployment, firmware/network changes, Pi Supabase startup, commit or push. Those actions were not performed. The initial pending-public-request checkpoint below is historical; the completed registration is recorded at the end.

## Exact created scope

| Record | Value |
|---|---|
| Purpose | Fictional Nano enrollment only, separate from the simulator |
| Request ID | `d906208d-8cc3-4220-8530-d83f1ffeb264` |
| School name | Fictional Nano Rehearsal School |
| School code | `NANO-ENROLL-a6d14ede-e738-4070-a53e-df5aebb45457` |
| School ID | `08590054-3091-4bc4-a439-b8e653943633` |
| Class | Grade 8A, rehearsal-specific academic-year metadata |
| Class ID | `293b7c6d-6dbc-4577-bba4-ac4814071f13` |
| Learner | Fictional Nano Learner A, roll 01 |
| Student ID | `ea7bb3eb-c8b4-4d52-8b34-d301ade8b9de` |
| Credential assignment ID | `0fd24ca1-41da-4fca-ac84-5601df819d25` |
| Credential version | 1, active and not revoked |
| Registered device type / ID | `nano_rc522` / `fe07ab85-6143-4019-a22b-e111c6b814e4` |
| USB selection | `0403:6001:BG02XZ38`, existing exact stable by-id path |

Four new fictional accounts support Principal, assigned Teacher, linked Parent and unlinked Parent verification. Their generated passwords and the opaque credential reference remain in the ignored private journal; no sign-in details are included here. No existing account or password was changed. The opaque credential is assigned to the fictional learner; it is not yet a reviewed HMAC mapping of the physical card.

## Executed verification

The controlled Windows runner executed only the existing isolated QA checkout at `C:/Users/Om/AppData/Local/Temp/schovera-m7a-qa-b5bad848`, loading its approved `.env.test.local` with an OS-variable allowlist. Exact database origin was enforced as `http://127.0.0.1:54321`; requests refuse redirects and other origins. Developer environment files were not read or copied. No reset, seed or migration was run.

The private helper created only the journaled fictional school/accounts/class/learner/links and issued its credential through the existing Principal RPC. It re-read the assignment to verify school/student/reference/version and active state. Actual newly created account sessions verified learner visibility: Principal **1**, Teacher **1**, linked Parent **1**, unlinked Parent **0**. Those sessions were signed out afterward. These are enrollment/student-visibility checks, not gate/dashboard acceptance.

Counts in the new fictional school: **devices 0, gate events 0, classroom attendance 0**. The original simulator still has exactly one gate row and receipt with matching immutable assignment/payload and original IDs, and zero classroom attendance. All **20 protected-school dataset hashes matched** before and after fixture creation. The final preservation checks used service-client SELECTs without fresh old-account sign-ins.

Executed commands and results:

| Command | Result |
|---|---|
| Root `node .local/schovera-manual-demo/physical-preparation-20261120/run.mjs preserve-readonly` before and after | PASS: simulator event/receipt/hash unchanged; all 20 protected datasets unchanged |
| Root `node .local/schovera-manual-demo/nano-enrollment-20261120/run.mjs` | PASS: scoped fixture/credential creation and actual student RLS visibility; zero device/gate/attendance counts |
| `node --check` on the private fixture helper and prepared Pi key-request script | PASS syntax only; does not execute Pi key generation |
| `git diff --check` | PASS, pre-existing line-ending notices retained |

An initial migration-text search used a PowerShell literal wildcard directory and failed; the corrected directory search inspected the schema before provisioning. It made no changes. No enrollment execution failed and no automatic provisioning retry was used. Existing module-type warning remains unsuppressed. The 184 passing guard/M7/gateway tests in [report 77](77_NANO_BOUNDED_GATEWAY_PREPARATION.md) are prior results and were not rerun for this private fixture-only step.

Private evidence: ignored `.local/schovera-manual-demo/nano-enrollment-20261120/`, containing owner journal, sanitized summary, preparation log, key-generation command and a source-deployment review manifest. Do not repeat fixture creation; its journal refuses reuse. Retain the fixture for the approved enrollment continuation, without automatic cleanup.

## Initial checkpoint: Pi public request needed to finish registration

No key was generated on Windows. Device registration cannot honestly be completed until the new Pi-generated public key is supplied. Do not register a placeholder or reuse the earlier simulator public key. No scoped capability response has been issued yet.

The prepared one-time command is in ignored `PI_KEY_COMMAND.txt` in the evidence directory. It runs an inline Node script in `/home/schovera/Schovera`, requires Linux, checks that `.local/physical-rfid/` is ignored and owned/non-writable by other users, and creates a new private directory:

`/home/schovera/Schovera/.local/physical-rfid/nano-enrollment-d906208d-8cc3-4220-8530-d83f1ffeb264/`

It generates Ed25519 locally, writes `device-private.pem` and `public-request.json` with mode 0600 under a 0700 directory, refuses any existing destination directory, and prints only the public request. The request pins purpose/type/USB identity/request ID, includes the public PEM and its **PEM-byte SHA-256**, and signs the ordered request JSON as a public proof of possession. This fingerprint format differs from the earlier simulator request's DER fingerprint; do not mix them. It opens no serial device, queue or network connection and deploys no new safeguard source.

The next owner action is to execute that one command in the existing Pi SSH terminal and share only its public request output. Never share `device-private.pem` or any environment file. On failure, stop and retain the generated directory instead of rerunning/overwriting it.

After receiving that request, the authorized Windows continuation must verify exact request ID/type/USB/purpose, Ed25519 PEM fingerprint and proof signature, then register the new device using the fictional Principal's existing provisioner. Validate the resulting `nano_rc522` row and school/public key, issue only its assignment-bound capability through the guarded local issuer, verify signature/claims/expiry against the issuer public key, and prepare the minimum scoped response. Keep all issuer/device private keys and account credentials off transfers. Verify zero gate/attendance/device-receipt records, school/role boundaries and all 20 protected hashes again. Do not start capture or delivery.

## Next source-deployment review, not execution

The six-file `source-deployment-plan.json` records expected before/after LF-normalized hashes for:

1. `scripts/physical-rfid/bounded-gateway.mjs` — new
2. `scripts/physical-rfid/bounded-test-cli.mjs` — new
3. `scripts/physical-rfid/bounded-gateway.test.mjs` — new
4. `scripts/physical-rfid/linux-gateway-capture.mjs` — reviewed modification
5. `scripts/physical-rfid/legacy-gateway.mjs` — reviewed modification
6. `scripts/rfid-gateway/storage.mjs` — reviewed modification

Before-hashes derive from the already verified 17-file source manifest and the recorded base revision for storage. New files must be absent on the Pi. No archive has been created or transferred by this stage, and all transfer/apply/capture/delivery approval flags remain false. The previous ZIP and deployed source are unchanged.

Once separately approved, build a new source-only incremental patch/manifest with its own checksum, show the complete diff and exact file list, then verify the Pi's existing modified source against the recorded before-hashes and preserve it. Perform checksum/content checks and `git apply --check` before asking for application approval. Never overwrite the Pi's existing reviewed patch, keys, queue, environment or enrollment journals. Deployment does not authorize capture. No Pi Supabase or network change is needed.

**At this initial checkpoint:** Pi-local key generation and public request were next. The following continuation supersedes that pending-registration status; live execution is still unapproved.

## Completed registration after the Pi public request

The owner supplied the public request generated by the approved Pi command. Before any registration, eight offline checks accepted the valid proof and rejected changed purpose, request ID, hardware type, USB identity, fingerprint, signature and unexpected fields. Ed25519 public-key PEM SHA-256 verified as:

`d6665b8ee69926e35791d72c813d7564cd6b124a61298f3b81975e6fb2d4703a`

The proof verifies possession of the matching signing key by the request signer. Pi-local execution is owner-reported; Windows did not receive or generate that private key. The request fingerprint and proof do not certify sensor hardware or electrical properties.

The fictional Principal registered exactly one device through `provision_school_device`:

- Device ID: `fe07ab85-6143-4019-a22b-e111c6b814e4`.
- Hardware type: `nano_rc522`; label: Fictional Nano physical one-event rehearsal.
- School: `08590054-3091-4bc4-a439-b8e653943633` (the separately owned fixture above).
- Public key and active state re-read and matched. Neither identity nor key matches the existing simulator.
- Existing credential assignment remains `0fd24ca1-41da-4fca-ac84-5601df819d25`, version 1, assigned to Fictional Nano Learner A.

The guarded Windows local capability-key/assignment issuer was used only for this school/device/assignment. The resulting capability signature, active issuer public key, school, device, assignment ID/version, opaque credential reference and validity window verified. Its expiry is **27 November 2026, 10:32:42 UTC**. No issuer secret was read or transferred by the helper.

Actual permission checks: Teacher, linked Parent and unlinked Parent could not provision a device; all four authenticated roles were denied direct private-device-registry table reads as intended; the new Principal could not read the simulator school's student. Fictional sessions used for these authorized enrollment checks were signed out. No existing account password was changed, and no cross-school record mutation was attempted.

Counts after registration: **one new Nano device, zero new fictional gate events, zero device receipts and zero classroom attendance**. A scoped signed response is retained privately at:

`.local/schovera-manual-demo/nano-enrollment-20261120/transfer-response.json`

Response size: **1603 bytes**. SHA-256:

`14d79d1f97d9151ea1d5631bccb9d5618fbfc17e5fe4a054c502836342e6fb04`

It contains only the public-key fingerprint, opaque device/assignment/reader/session scope, signed capability, issuer public key, loopback target and false capture/delivery/deployment approval flags. No device private key, password, Supabase credential, issuer private key or raw UID is included. Do not paste the capability response into chat or commit it. No transfer has occurred, and no usable capture approval or physical-card HMAC mapping is created by this registration.

Additional commands executed:

| Command | Result |
|---|---|
| Root `node .local/schovera-manual-demo/nano-enrollment-20261120/register.mjs` | PASS: 8 offline public-request checks, then one device registration, scoped capability verification, permission/count checks and response preparation |
| Root `node .local/schovera-manual-demo/physical-preparation-20261120/run.mjs preserve-readonly` before and after | PASS: original simulator event/receipt/hash/assignment unchanged; all 20 protected-school dataset hashes unchanged |
| `node --check` on private registration/public-request validation helpers | PASS |

There were no registration failures or retries. Existing module-type warnings remain. All logs/journals are ignored private artifacts; only sanitized scope/check results were printed. No queue file or physical port was opened, no events were submitted, and no package was deployed. The six-file source review manifest from the previous section remains prepared only; separate package review/transfer/apply approvals are still needed. The old deployed ZIP remains unchanged.

**Next controlled step, awaiting separate approval:** prepare a new incremental source-only review package for those six guards, show its exact diff/file list/checksum, and separately review a transfer of only the 1603-byte scoped enrollment response to the existing Pi key directory. Response transfer or source review is not permission to apply the patch, map the physical card, capture or deliver. Preserve the existing queue and simulator evidence throughout.
