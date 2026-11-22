# Nano safeguards: source-package review and response transfer

21 November 2026. **Local package review PASS; Pi source verification PASS; scoped response transfer PASS.** This checkpoint covered review/check-only and one fictional scoped-response transfer. No patch application, physical card mapping, capture, event delivery, firmware/network/service change, commit or push has occurred.

**Status update:** the reviewed safeguards were subsequently applied to the Pi with the required immediate checksum/baseline/apply-check gate and focused non-live tests. See [Milestone 80](80_NANO_BOUNDED_SAFEGUARDS_PI_DEPLOYMENT.md). The review/check results below remain historical evidence for the package and its pre-deployment baseline.

## Exact source package

Archive: `.local/schovera-manual-demo/nano-source-review-20261120/Schovera_Nano_Safeguards_REVIEW_ONLY_2026-11-20.zip`

Size: **9961 bytes**. Archive SHA-256:

`050c482ccca4bd9055a85bc8431b1b7f18489c8be257d594de37162655524793`

Patch SHA-256: `d4cf5ba5b804b939937b9e1c72a00928b4ac7a637a237ddb699bb5b1b55685f8`.

The ZIP has exactly three regular entries: `source-changes.patch`, `manifest.json`, `README.txt`. The patch changes exactly six logical source/test paths. It includes no firmware, migration, environment, database, runtime configuration, key, account journal or signed capability. The private enrollment response is deliberately separate.

Exact patch diffstat: **256 insertions, 8 deletions**. Per-file counts are 70/0, 64/0, 107/0, 8/4, 2/1 and 5/3 in the table order below. The unabridged unified diff is linked below; this count is from `git apply --numstat` on the same patch bytes whose SHA is recorded above.

The complete, unabridged diff is provided as [COMPLETE_SOURCE_DIFF.txt](../.local/schovera-manual-demo/nano-source-review-20261120/COMPLETE_SOURCE_DIFF.txt) and [source-changes.patch](../.local/schovera-manual-demo/nano-source-review-20261120/source-changes.patch). Review those artifacts in full before application approval.

| Exact path | Before SHA-256 (absent means new) | After SHA-256 |
|---|---|---|
| `scripts/physical-rfid/bounded-gateway.mjs` | **Absent** | `e87e8f5ff1789e0762536fa8a2c84b75bd6a74d84c047bf08cdb4e87fb78d2df` |
| `scripts/physical-rfid/bounded-test-cli.mjs` | **Absent** | `33344f9a244db91642d6b616e7e140557dd183c76ad9a1ea909535747653b10f` |
| `scripts/physical-rfid/bounded-gateway.test.mjs` | **Absent** | `99db5fa52d45e7261c38cc7eb0290256a13eb49d478d928c9a731b8e2a361351` |
| `scripts/physical-rfid/linux-gateway-capture.mjs` | `9879cc26f828e51991ef0136f3f5ede94b13c41138838f0324b897d61bb32c23` | `641c4caa44c753601a940e9c48286bc064d9b6bcaf46adc9f02c0fa90d8a8062` |
| `scripts/physical-rfid/legacy-gateway.mjs` | `d3c22153ec5999912bd45634ecf0e6d2edf13b8f21620f8a1c3dc5c164902be7` | `3f6c3234c09b65f956361772238416fa0919fe63d9c45cfbdc65c76627b842c5` |
| `scripts/rfid-gateway/storage.mjs` | `987bf76ec56118e26c32664e948a95301e6109e5b9e7ad26e9c1bfecb1e674fe` | `3f938c6ea44022753ba12906e2260983a8a03900a7887ee7a5650b9105bbd16d` |

## Local checks actually executed

- Original deployed 17-file ZIP verified unchanged at SHA-256 `3a0457d0d6cb1884dec54ffb48678fb992aeaed191e8a39d9ac88f59a9924435`. The old package was not regenerated.
- Existing-file baselines reconstructed without applying a patch: the frozen original new-file additions provide legacy/capture baseline bytes; storage comes from the recorded Git base `7f22280d083102dbef1ca3f906d71b4392e484e0`. All recorded before-hashes matched.
- New source LF hashes match both the six-file plan and isolated QA copies from the final 184-test run. This is provenance verification, not a new test-suite execution.
- `git apply --check` and `git apply --numstat` passed in an owned temporary source-only baseline. No candidate patch was applied, even in that temporary tree. Source/absence was checked unchanged after the check; the exact owned temporary directory was removed.
- Archive entries, patch bytes/hash and exact six-path scope verified. Entire diff is retained in the linked artifacts.
- The first response transfer helper incorrectly sent Base64 through PowerShell's text pipeline; GNU `base64` rejected the CRLF stream. The response was not installed on the Pi. After explicit owner approval, the original fictional device was revoked and a new device/capability and response were issued in the same synthetic school/class/student scope. The replacement response remained fictional and carried false live-capture, delivery and source-deployment flags.
- After the owner reported both final and staging paths absent, the corrected PowerShell helper used SCP for binary transfer into a unique mode-0700 staging directory. Pi-side checks verified the 1603-byte response checksum and scope, then atomically linked it to the final path with no-overwrite semantics, set mode 0600, verified owner/mode/content, and removed the staging file/directory. The owner reported: `REPLACEMENT RESPONSE TRANSFER VERIFIED: size, checksum, scope, owner and mode 600 passed.` The response contents and capability were not placed in the report or terminal output.
- The transfer helper's first SSH-code invocation also failed from remote-shell quoting before its preflight executed; the owner then confirmed the final and failed-attempt staging paths absent. The helper was corrected to pipe only Base64-encoded validation code through a `pipefail`-guarded remote decoder. PowerShell parser validation passed. The subsequent complete transfer succeeded. No response payload was Base64-decoded by the Pi; SCP carried the response as bytes.
- Final read-only Windows queries verified unchanged simulator event/receipt/hash/assignment and all **20 protected-school dataset hashes**. No old-account sign-ins or event submissions were used.
- Python handoff snippets were compiled for syntax only, and the PowerShell transfer script was parsed without execution. `git diff --check` passed; prior line-ending warnings remain. No application source was changed for package review.

Controlled local commands: `python -I -B .local/schovera-manual-demo/nano-enrollment-20261120/build-review.py`; `python -I -B .local/schovera-manual-demo/nano-source-review-20261120/prepare-handoff.py`; `node .local/schovera-manual-demo/physical-preparation-20261120/run.mjs preserve-readonly`. The builders refuse/review existing destination artifacts rather than overwriting the frozen source ZIP.

## Pi-side review and transfer results

The owner ran the prepared read-only Pi preflight in the existing authenticated terminal. It confirmed the original deployed ZIP SHA and all 17 manifest files, full Git base `7f22280d083102dbef1ca3f906d71b4392e484e0`, expected current storage hash, all three new source paths absent, and private enrollment directory/file metadata without reading the private key. Output: `PREFLIGHT PASS: source baseline, private key-directory metadata and destinations verified.`

The owner transferred the review ZIP to `/home/schovera/Schovera-nano-safeguards-050c482ccca4.zip`; local SHA-256 matched `050c482ccca4bd9055a85bc8431b1b7f18489c8be257d594de37162655524793` and SCP completed. The owner then ran `PI_ARCHIVE_CHECK.txt`. Output: `REVIEW PASS: ZIP/patch checksums, six paths, before-hashes and git apply --check. Nothing extracted or applied.` This validates the Pi source baseline and patch applicability without applying it.

The replacement response was transferred only to `/home/schovera/Schovera/.local/physical-rfid/nano-enrollment-d906208d-8cc3-4220-8530-d83f1ffeb264/transfer-response.json`. Its local SHA-256 was `c52defb2ff39247e7214deca10b1684c3cd3c1d6996bbbb30abf182bb271e383`; the owner reported successful size, checksum, scope, ownership and mode-0600 checks. The Pi private key was not transferred or read, and the queue was not accessed. The Pi Supabase stack and existing network/tunnel configuration were left unchanged.

For traceability, the prepared instructions remain in the ignored evidence directory:

1. [PI_PREFLIGHT.txt](../.local/schovera-manual-demo/nano-source-review-20261120/PI_PREFLIGHT.txt) records the passed read-only baseline checks.
2. [PI_ARCHIVE_CHECK.txt](../.local/schovera-manual-demo/nano-source-review-20261120/PI_ARCHIVE_CHECK.txt) records the passed checksum/path/before-hash and `git apply --check` review. It did not extract or apply the patch.
3. The corrected [TRANSFER_RESPONSE_V2.ps1](../.local/schovera-manual-demo/nano-source-review-20261120/TRANSFER_RESPONSE_V2.ps1) is retained privately for audit. It verifies the current replacement checksum locally, uses unique staging plus SCP, validates scope/checksum remotely and uses an atomic no-overwrite finalization. Its PowerShell syntax was parsed before the successful owner-run execution.

Approved response destination: `/home/schovera/Schovera/.local/physical-rfid/nano-enrollment-d906208d-8cc3-4220-8530-d83f1ffeb264/transfer-response.json`. If it already exists, permissions differ, transfer is interrupted or a checksum differs, stop and preserve the state; do not overwrite, auto-chmod, delete or repeat blindly.

Only sanitized PASS/failure metadata should be returned. Do not paste the response, signed capability, environment files or private key. The archive has no secret enrollment material. Keep the existing SSH tunnel and Pi Supabase state unchanged.

## Current outcome and next approval

The six-file patch review, Pi source-baseline verification, Pi `git apply --check`, and fictional scoped-response transfer completed first. The owner later approved the six-file application; that deployment and its focused verification are recorded in [Milestone 80](80_NANO_BOUNDED_SAFEGUARDS_PI_DEPLOYMENT.md). The patch's complete diff and before/after hashes remain linked above. This review report does not authorize physical capture, card mapping, event delivery, firmware changes, or a Supabase restart. Nothing was committed or pushed.
