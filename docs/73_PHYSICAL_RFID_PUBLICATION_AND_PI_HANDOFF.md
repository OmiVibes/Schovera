# Physical RFID read-only capture publication and Pi handoff

20 November 2026. Publication checkpoint for the existing Stage 1 implementation;
not physical RFID acceptance, a Pi port, or a production release.

## Reviewed scope

The six new read-only files and the physical adapter README are published with
the owner's unchanged Nano sketch and a source-status README. The capture path
reuses the existing bounded physical parser and adds explicit Windows COM/PnP
selection, a maximum 30-second lifetime, sanitized observation counts and bounded
shutdown. It has no serial payload writer or backend/database integration.
Existing M7 synthetic safeguards and files are unchanged.

The Nano sketch is source supplied by the owner. It was inspected, not modified,
compiled, uploaded or independently matched to the flashed firmware. Arduino CLI
was not available on PATH during this checkpoint. No serial port or hardware was
opened. No schema, protected school record, password or account was changed.

## Publication safety review

The starting branch was `main`, with HEAD and fetched `origin/main` both at
`992dca5aecc82957e31248ca2f435f1821e357e8`. Both origin URLs were verified as
`https://github.com/OmiVibes/Schovera.git`.

All 418 tracked paths and 10 initially untracked files were inventoried, including
the pre-existing UI review drafts and local instruction file. Filename checks
found no tracked private environment, key, database, log or runtime-artifact file.
The existing tracked environment examples contain placeholders only. Content
checks for private-key blocks, common GitHub/cloud/provider token formats and the
known real test-card identifier found no matches. New code uses fictional UID and
PnP examples; diagnostics never print the observed UID. This is a scoped manual
and pattern review, not proof that every possible secret format is detectable.
The developer `.env.local` was not opened, copied, modified or hashed.

`.gitignore` was reviewed and retained: private environment files, `.local/`,
dependencies, Next output, test reports, screenshots and local server logs already
have exclusions. Tracked files were checked separately; ignore rules alone were
not treated as protection. No source directory was newly hidden.

Excluded and preserved locally:

- `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`: unrelated existing typo edit.
- `CLAUDE.md`: pre-existing local instruction pointer.
- `review/FINAL_UI_GAP_ANALYSIS.md` and
  `review/SCHOOL_CONNECT_UI_REFERENCE_AUDIT.md`: unrelated local design studies.
- Ignored environment/configuration values, account journals, issuer keys, SQLite
  databases, execution logs, captures, dependencies and build/runtime artifacts.

## Verification

Physical adapter files in the existing isolated QA checkout were byte-compared
with the source before testing. A broader comparison found two committed timetable
source/test files lagging in QA; only those files were synchronized from source,
then TypeScript and lint were rerun. QA commands used an OS-environment allowlist;
private root environment files were not copied. No hardware or database tests
were invoked. Commands and final results:

| Command | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run scripts/physical-rfid --maxWorkers=2 --no-file-parallelism` | PASS: 60 tests, including 31 original and 29 read-only tests |
| `node node_modules/vitest/vitest.mjs run scripts/arduino-local/serial.test.mjs --maxWorkers=2 --no-file-parallelism` | PASS: 22 existing tests |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| `node node_modules/eslint/bin/eslint.js src scripts --no-cache --concurrency 1` | PASS |
| `npm run build:isolated -- --working-tree` | PASS: Next 16.4.5, TypeScript, expected routes, private-sentinel scan, stable inputs and temporary cleanup |

The Windows-specific tests parse the worker and execute its isolated pure identity
comparison with mock descriptors. They do not execute its hardware discovery or
SerialPort.Open code. No physical scan, three-tap result, DTR/reset behavior or
disconnect result is claimed.

One initial build attempt invoked `node scripts/build-isolated.mjs --working-tree`
directly. It exited 1 before compilation because the wrapper requires npm's
installer location; its temporary snapshot was cleaned. The rerun uses the
required npm command without changing the wrapper or weakening checks. The
earlier implementation's two mock-test failures and corrections remain recorded
in the physical adapter README. No fresh dependency audit, full application
journey suite or firmware compile was run for this narrow publication.

The passing build reported npm EPERM cleanup warnings in its temporary dependency
installation; npm installation still exited successfully, compilation passed and
the outer wrapper confirmed snapshot cleanup. Source fingerprint:
`63306b88553818eb5fc0e5fe3b0937ad06cbeb6c752c16412cf67cee3bb3b2f0`
(257 approved build inputs). Only generated `.env.production` was loaded, and the
limited build proxy observed the two allowlisted Google Fonts hosts. The proxy
is not an OS network sandbox. The isolated app build does not compile Arduino
firmware or certify native serial hardware behavior.

Private command logs and the timestamped ledger are retained under ignored
`.local/schovera-manual-demo/publish-readonly-20261120/`.

## Raspberry Pi 5 handoff

The Pi can clone the source from GitHub using an account with repository access:

```sh
git clone --branch main https://github.com/OmiVibes/Schovera.git
cd Schovera
git rev-parse HEAD
```

Use a 64-bit Raspberry Pi OS/Linux development environment, Git, and a compatible
Node 22 runtime (22.13+ for the existing SQLite APIs; Windows QA used 22.18.0).
Install dependencies from the committed lockfile with `npm ci` on the Pi; do not
copy Windows `node_modules`. ARM64 dependency availability and compilation must
be verified on that machine. Keep credentials outside Git.

The new native capture transport deliberately supports Windows only. COM11,
Windows PnP matching, PowerShell/.NET serial workers and Windows speech are not
Pi implementations. A separately reviewed Linux read-only transport needs exact
USB identity/device-path confirmation, explicit DTR/RTS review, device permission
setup, bounded reads and equivalent shutdown/no-write tests before any real port
is opened. Do not bypass the existing Windows guard or synthetic-only M7 CLI.

Cloning does not transfer this laptop's accounts, database, issuer keys, SQLite
queue, Ollama models or running services. Pi app operation needs separately
reviewed local Supabase/container support, loopback configuration and synthetic
account provisioning; AI needs an appropriate local provider/model and resource
check. The existing Windows setup/process scripts are reference material, not a
verified Linux installer. Never copy developer `.env.local` or protected school
data to make the new machine work.

RFID enrollment, trusted durable physical ingestion, cloud synchronization,
electrical acceptance and classroom attendance integration remain separate work.
The legacy CSV cannot prove acquisition identity or distinguish every retap from
retransmission. A gate observation must never automatically finalize attendance.
