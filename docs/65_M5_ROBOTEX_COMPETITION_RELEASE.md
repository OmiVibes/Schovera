# M5 — Robotex competition software and business handoff

Prepared 17 November 2026. **M5 is complete for local software review; presentation readiness remains conditional on human rehearsal, language and device-audio acceptance.** This is a fictional, laptop-local software competition pack, not a production release, hardware certificate, customer validation or fluent-language acceptance.

## Scope and baseline

Repository `OmiVibes/Schovera`, working directory `D:\Notes\Degree\Projects\Schovera`, branch `main`. Starting HEAD and fetched `origin/main`: `6d04c609c69e314dea3b19e432428fad9a9e3b5f`; M4 implementation `40704b89b6098c01ae839db84bd84ac6f8368b51`. M1–M4 contracts and their historical reports remain intact. No M6, physical hardware, public deployment, real notifications or paid provider is included.

Pre-existing `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, `CLAUDE.md` and `review/` are preserved and excluded from this task's commits. The developer `.env.local` was not opened, copied, hashed or modified. Configuration/data actions run only in the previously approved isolated QA directory, with its existing explicit local files and fictional fixtures. No database reset, seed, migration, password rotation or protected-school edit was performed.

## What changed

The new `competition` command consolidates the existing M3 fixture/mock-reader and guarded RFID server. It does not add another attendance writer, reader driver, seed database or production server. The source checkout never loads dotenv through this entrypoint.

| Files | Purpose |
|---|---|
| `scripts/competition/guard.mjs` | Exact approved QA path, private-env existence refusal, explicit child environment, ownership marker and approved-source fingerprint |
| `scripts/competition/server.mjs` | Owned background wrapper around the unchanged guarded local launcher |
| `scripts/competition/cli.mjs` | Prerequisites; start/status/rehearse/credentials/stop/clean; process PID, command line, token and creation-time checks |
| `scripts/competition/qa.mjs` | Explicit QA-only configuration; journaled fictional fixture, current-day readiness and real role login checks; scoped cleanup |
| `scripts/competition/rehearse.mjs` | Actual browser/database/gateway scenario, repeated read-only verification, screenshots/gallery/ZIP |
| `scripts/competition/guard.test.mjs` | Three focused ownership/environment/fingerprint tests |
| `scripts/verify-competition.mjs` | Full start/login/repeat/scenario/stop/restart/cleanup acceptance and unowned-port refusal |
| `package.json` | Two commands only; dependency specifications, overrides and existing commands unchanged |
| `docs/competition/` | Two pitches, assumptions/arithmetic, sourced comparison, 42 judge answers, evidence categories and backup/hardware checklist |
| This report | Executed evidence, failures, limitations and publication handoff |

No application UI, attendance/communication logic, existing test assertion, database migration or lockfile changed. The only screenshot-specific styling hides the development toolbar and prevents the sticky header obscuring a full-page capture; application controls/data are not hidden. This is capture formatting, not an application redesign.

## Exact local operation

Prerequisites are an existing approved QA checkout, installed reviewed lockfile, Docker/local Supabase, 48 migrations, Node 22.13+ (tested 22.18.0) and Windows. This is not a one-command installation on a fresh laptop. QA source must already match the approved source; the command refuses differences rather than overwriting work or copying private configuration. The workflow does not start Docker, migrate or reinstall dependencies automatically.

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
npm run competition -- start
npm run competition -- status
npm run competition -- credentials
npm run competition -- rehearse

# Retain the same fictional fixture while stopping only its owned server:
npm run competition -- stop
npm run competition -- start

# After inspecting pending work, explicit owned-fictional cleanup:
npm run competition -- clean --discard-pending
```

Website: **http://127.0.0.1:3104**. Isolated QA: `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`; local Supabase API `127.0.0.1:54321`, DB binding `127.0.0.1:54322`. Start verifies database binding/running state, Auth 200, reviewed migration count, Next/Zod versions, source fingerprint, owned school/date, exactly three fictional students and actual Teacher/Parent/Principal sign-ins. Existing launcher Host/Origin/localhost guards are unchanged. Arbitrary shell provider keys/runtime options are not passed to children.

`credentials` privately displays freshly generated fictional sign-ins. Start/status never print passwords. Do not paste credentials into this report, Git, slides or screenshots. Three browser profiles avoid account switching during the pitch. Choose Grade 8-A / Synthetic Child A; the second student is Synthetic Manual Fallback. A dated fixture is refused on a later day until its owner explicitly cleans it. Repeated start keeps the same school/students. Repeated completed rehearsal checks saved state without duplicating data; clean/start is required for a new live action sequence.

An unowned server/fixture is never adopted or killed. Process stopping checks PID, wrapper command/path, owner UUID and process creation time. Unknown/mismatched markers are refused. `clean` without discard refuses unresolved work; explicit discard touches only this journaled fictional school/actor and the M3-owned fixture. It does not clear the school's general queue. Backups survive cleanup. These guards trust the local OS/filesystem; they are not a sandbox against a malicious local administrator or race-proof multi-operator orchestration.

## Scenario and evidence categories

See the [feature evidence matrix](competition/FEATURE_STATUS.md) for **WORKING AND TESTED / WORKING WITH LIMITATIONS / SIMULATED / PLANNED / NOT IMPLEMENTED**. Historical implementation evidence is in [M1](61_M1_ATTENDANCE_INTEGRITY.md), [M2](62_M2_SMART_ATTENDANCE_AND_EXCEPTION_MANAGEMENT.md), [M3](63_M3_RFID_SOFTWARE_READINESS.md) and [M4](64_M4_SOFTWARE_RELIABILITY_AND_COMPLETION.md).

The current competition acceptance exercises the three-minute core and five-minute extensions as one coherent software journey:

1. Teacher sends an original Important notebook reminder through the form. Exact saved original is checked independently.
2. Parent receives and acknowledges it **before** optional Principal translation approval. An acknowledgement proves a button action, not comprehension.
3. Principal saves/submits/approves a separate fictional Marathi version. Parent selects that version; actual audio progress and Pause/Resume/Stop are checked. Original remains selectable. This does not certify a fluent review merely because a synthetic test actor checks the review box.
4. M3 mock input commits a signed immutable event through the durable SQLite gateway and local v2 API. An exact duplicate remains one gate event; classroom row count remains zero.
5. Teacher sees unconfirmed gate evidence, explicitly finalizes two classroom marks, and Parent sees the saved current-class status. Manual Fallback remains valid without a scan.
6. An adapter outage captures a second separate event on disk with pending count one; another process reopens/syncs it. Confirmed gate count becomes two and classroom records remain unchanged. This is transport injection, not a Wi-Fi disconnection or hosted cloud replica.
7. Principal communication/attendance and Teacher/Parent views are captured at 1440px and 390px. Repeat, server stop/restart and identity-preserving cleanup are checked.

Held-work behavior is covered separately by the existing M4 acceptance. The normal competition scenario does not manufacture a conflict simply for appearance; the pitch explains it or labels a retained synthetic capture as recorded evidence. Separate gate events/sequence warnings remain evidence, not duplicate deliveries or confirmed safety incidents.

The [three-minute](competition/PITCH_3_MINUTES.md) and [five-minute](competition/PITCH_5_MINUTES.md) timings are practice targets. The automated journey verifies actions, not Arohi's speaking speed, rehearsal, understanding or a fluent person's pronunciation/meaning judgement. Complete the [presentation checklist](competition/PRESENTATION_CHECKLIST.md) on the actual speakers/projector before presenting.

## Business and comparative material

[Business assumptions](competition/BUSINESS_MODEL.md): proposed B2B annual school subscription, alternative per-student/school pricing, optional setup/training and future hardware support. Chosen example USD 3/student/year and illustrative **USD 1 = INR 85**, not current FX or validated pricing.

| Hypothetical school | Annual revenue | Assumed operating cost | Contribution before excluded costs/tax | Margin |
|---|---:|---:|---:|---:|
| 200 students | USD 600 / INR 51,000 | USD 537 / INR 45,645 | USD 63 / INR 5,355 | 10.5% |
| 800 students | USD 2,400 / INR 204,000 | USD 1,419 / INR 120,615 | USD 981 / INR 83,385 | 40.875% |

Costs separately include hosting/domain/internet/electricity/support/maintenance/contingency. SMS is disabled, not assumed free sending. These are contribution examples, not net profit; exclusions and sensitivity are explicit. Hypothetical materials: USD 135/gate kit; cards USD .50 each; with chosen 10% materials contingency, one-gate/200-card capital USD 258.50 / INR 21,972.50; two-gate/800-card USD 737 / INR 62,645. These are unverified budgets, not procurement quotes, installed prices or certified components. Software operating costs and hardware capital are not mixed.

The [competitor sheet](competition/COMPETITORS.md) cites official ClassDojo, ParentSquare and MyClassboard pages checked on 17 November. It explicitly avoids “first/only multilingual”, invented comparative absences, unverified tiers/prices and false hosted/SMS equivalence. The [42 judge answers](competition/JUDGE_QA.md) cover business, privacy, signatures/replay, attendance, language/AI and remaining hardware/pilot work. No customers, testimonials, sales, surveys, demand or savings are invented.

## Synthetic backup and visual review

Successful final backup: `C:\Users\Om\Downloads\Schovera_M5_Competition_2026-11-17.zip`.

Source capture directory: `%TEMP%\schovera-competition-backups\c188ab7a-5e45-46d6-857a-165794cd8346\177cc706-504b-48c6-977c-7362fbaeedeb\`.

ZIP SHA-256: `e49b7fb408f484c7b2154e61c2ee4a6f4807d37d82f30045f4a38fadaf3b186e`; 2,809,544 bytes; 16 files: 13 PNGs, a gallery and two sanitized JSON evidence files. Downloads copy hash matches. No database, private journal, environment file, account manifest, key or dependency bundle is included. Text credential-pattern/type checks passed. Parent updates mobile, Principal communication mobile and Teacher attendance desktop were visually inspected; a prior Parent attendance mobile capture was also inspected. This is selected-view coverage, not every pixel of every route or all expanded states.

Extract and open `OPEN_GALLERY.html` for an internet-independent backup. Introduce it as recorded fictional evidence, never as a live reader. No new video was produced. Keep large generated screenshots/ZIPs outside Git. Earlier failed-attempt captures are preserved privately, not substituted for the successful final pack.

## Environment, tests and preservation

Evidence directory **E**: `.local/schovera-manual-demo/m5-20261116/` (Git-ignored). Work began 16 November and resumed 17 November after an environment interruption; ledger dates are actual UTC execution dates. The JSON ledger retains commands, cwd, timestamps, exits and redacted logs. No claim of OS-wide packet capture or sandbox is made. Tests use synthetic loopback fixtures and independent persisted-state assertions.

The restarted Docker stack has healthy core Auth/API/PostgreSQL. The pre-existing Vector restart problem remains an auxiliary-service limitation, not repaired here. The QA dependency installation was missing files after the interruption. An OS-allowlisted `npm ci --offline --no-audit --no-fund` restored its **unchanged** lockfile (478 packages). It warned that ESLint 9.39.5 is unsupported. QA's lockfile initially differed only in formatting; semantic equality was checked before copying approved bytes. No root dependency installation or version upgrade was performed.

### Failures and reruns retained

- Initial lint failed before application checks because `eslint-import-resolver-node/index.js` was absent. Initial units failed at startup because Vite's client file was absent. Restoring QA dependencies resolved both; original failures remain.
- First competition acceptance stopped because the source fingerprint detected the lockfile formatting mismatch before it reached the intended unowned-port refusal. No server/fixture was adopted.
- The next new rehearsal locator filtered a card by its English title; selecting the translated title invalidated that locator. It now uses the stable first recent card after the exact original was verified. Application translation logic and assertions were not weakened.
- A subsequent scenario completed but ZIP creation locked the gallery inside Next's watched tree, causing a Turbopack panic and failed repeat. Backups now live outside the watched tree; full repeat/restart/cleanup reruns passed. A final capture-only change hides the development toolbar; the full acceptance was rerun again.
- The initial unexecuted probe design used a synchronous child while serving its synthetic unowned listener in the same process. Inspection caught this event-loop block before that design was run; the actual refusal probe uses asynchronous child execution.
- Fresh production and all-dependency audit commands remain non-green, as detailed below. Passing functional tests do not erase those findings.
- One unchanged reconnect run passed missed-update/acknowledgement, second-tab, flapping, logout, child isolation and Principal profile recovery, then timed out at line 492 waiting for its later normal update. Its owned cleanup passed. The cause is unconfirmed; the unchanged rerun result is recorded in the ledger. No timeout, existing assertion or application code was changed to obtain a pass.
- An extra pitch word-count inspection initially failed because PowerShell's piped Unicode quote characters did not survive the Python input encoding. A code-point-based rerun measured approximately 302 spoken words for the short script and 545 for the extended script. These counts are planning aids, not actual speaking-time acceptance.
- One preliminary source search passed a PowerShell literal `next.config.*` path to ripgrep and received a path-syntax error. Repeating it with `next.config.ts` completed the inspected cache-API search; it changed no files.

### Current dependency finding

No dependencies changed in M5. Installed Next/eslint-config-next **16.4.1**, Zod **4.6.6**, sharp **0.35.5**, with 48 unchanged migrations. The historical eight development-tool entries remain historical results, not today's exact count.

On 17 November, fresh `npm audit --omit=dev` reports **one moderate Next.js entry**, zero critical/high. Full audit reports **eight moderate package entries**: seven propagated minimatch/TypeScript-ESLint entries plus Next.js, zero critical/high. No blind audit fix, downgrade, override or suppression was applied.

The newly reported [Next.js advisory GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h) concerns a cache race involving a `use cache` function nested through `unstable_cache()` and root parameters. The reviewed advisory identifies 16.4.5 as patched; npm's current direct-update suggestion is 16.4.6. A source/config scan found none of `use cache`, `unstable_cache` or `rootParams`. **Inference:** the documented trigger was not identified in this application; this is not proof of universal framework safety. Plan a compatible reviewed patch/regression separately before any hosted release. The existing minimatch [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) lint-tool risk remains open. No application exploit was attempted.

### Execution ledger

**46 recorded executions: 38 PASS, 8 FAIL.** These include failed attempts and repeated checks, not 46 independent features. Latest required functional checks, TypeScript, lint, schema lint and isolated build pass. Both fresh dependency audits remain non-green. The unchanged reconnect rerun passed fully; its earlier failure and unconfirmed timing cause remain a reliability limit.

- **Unit/components:** 364 passing tests in 47 files, including three new competition guards. RFID/gateway/attribution subsets are included, not counted again.
- **M1/M2:** draft/final/reason/history/concurrency/idempotency and legacy/offline contracts; Parent final-only visibility; signed gate separation, exception review, current-roster limitations, large counts and tenant/session denial passed.
- **M3/M4:** durable mock-reader capture/restart/delivery, revoked/unresolved evidence, immutable envelopes, same-Teacher held resolution/closure, stale revision denial, controlled second-tab join recovery and unchanged reconnect rerun passed.
- **Communication/totals:** connected Teacher/Parent/Principal journey and AUD-01 boundary sizes through 2,005, 2,007-row correction dataset, mixed acknowledgements, complete keyset traversal, SQL/oracle/UI agreement and role isolation passed.
- **Competition:** two final full executions passed start/login/readiness, unowned-port refusal, repeat without duplication, scenario/audio/captures, stop/restart and owned cleanup. The final ZIP described above is from the capture-format rerun.
- **UI/languages:** role navigation, 23 destinations at 1440/1024/768/390px, 96 staff language/page/width combinations, accessibility/i18n and Parent/Teacher playback geometry/keyboard/navigation-stop passed. This is not every state, every contrast pair or a screen-reader session.
- **Voice/translation:** ten native samples matched en/hi/mr/ko, original text, volume and start/end. Actual local Hindi/Marathi/Korean automatic translation preserved tested date/time and source identity; real WAV generation and browser Pause/Resume/Stop passed. No new fluent-listener approval or physical speaker acceptance is claimed. Local Ollama was started only for these checks and its owned process tree stopped afterward; no model was installed and no cloud fallback enabled. Live teaching-draft generation was not freshly rerun in M5; its existing evidence remains historical.
- **Offline operations:** actual HTTP/SQLite capture, three pending operations through real Next restart, authorized replay/receipts, lost response/concurrent retry, conflicts/revocation/Origin denial, private staff state and three-portal mobile checks passed. Original envelopes were not changed.
- **Build:** Next 16.4.1 optimized compilation, TypeScript and all expected routes passed. Snapshot SHA-256 **`1229b693762513783c449379bef2e034c6c23471775ff3d90ec99140c2460d9c`**, **223 approved files**. Only generated `.env.production`; private sentinels absent; loopback config, unchanged-source verification and exact snapshot cleanup passed. Only `fonts.googleapis.com` and `fonts.gstatic.com` were observed through the limited build proxy, not an OS sandbox. This was a working-tree build of the approved inputs before commit, not hosted runtime acceptance.
- **Integrity:** all **20 protected-school dataset hashes unchanged** after tests; no protected-school register/review/resolution state added. All 349 protected existing tracked-file hashes are unchanged, including unrelated doc 45; 264 executable inputs match QA; lockfile/dependency specifications unchanged; 48 migrations remain. Owned competition/suite fixtures and queues were cleaned, private backups retained. Competition state and manual fixture pointers are absent. Owned QA and Ollama process trees were creation/command checked before stopping; ports 3104/3105/11434 are no longer listening. Docker remains running; no unrelated process tree was stopped.
- **Publication hygiene:** relevant-file type/secret-pattern checks, known approved QA secret-value checks, Markdown links, 42-question count and `git diff --check` passed. No production secret was read or compared. Generated binaries/private logs/configuration are excluded from staging.

Commands below ran in QA unless labelled by their existing wrapper: `verify:competition` and `build:isolated` run from the developer repository without loading its environment; QA helpers use only the approved explicit local file. Times are UTC; IST adds 05:30. Preparation (`npm ci`) and source/ZIP/document inspections described above are separate from this ledger.

| # | Exact command | UTC start | UTC end | Exit | Result | E/log |
|---:|---|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m5/preserve.mjs` | 2026-11-16 12:13:40.703 | 2026-11-16 12:13:41.442 | 0 | PASS | `01-m5-preserve-1794831221432.log` |
| 2 | `npm run typecheck` | 2026-11-16 12:20:44.200 | 2026-11-16 12:20:54.278 | 0 | PASS | `02-typecheck-1794831654277.log` |
| 3 | `npm run lint` | 2026-11-17 05:27:50.501 | 2026-11-17 05:28:22.681 | 2 | FAIL | `03-lint-1794893302478.log` |
| 4 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 2026-11-17 05:28:22.737 | 2026-11-17 05:28:25.228 | 1 | FAIL | `04-units-1794893305213.log` |
| 5 | `npm run verify:competition` | 2026-11-17 05:36:30.413 | 2026-11-17 05:36:34.595 | 1 | FAIL | `05-verify-competition-1794893794594.log` |
| 6 | `npm run lint` | 2026-11-17 05:36:26.827 | 2026-11-17 05:36:46.378 | 0 | PASS | `06-lint-1794893806377.log` |
| 7 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 2026-11-17 05:36:46.378 | 2026-11-17 05:37:30.476 | 0 | PASS | `07-units-1794893850455.log` |
| 8 | `npm run typecheck` | 2026-11-17 05:37:30.477 | 2026-11-17 05:37:37.166 | 0 | PASS | `08-typecheck-1794893857165.log` |
| 9 | `node --env-file=.env.test.local .local/m5/business-math.mjs` | 2026-11-17 05:37:53.148 | 2026-11-17 05:37:53.306 | 0 | PASS | `09-m5-business-math-1794893873306.log` |
| 10 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 2026-11-17 05:37:53.324 | 2026-11-17 05:37:58.784 | 1 | FAIL | `10-audit-production-1794893878783.log` |
| 11 | `npm run verify:competition` | 2026-11-17 05:37:25.512 | 2026-11-17 05:38:32.020 | 1 | FAIL | `11-verify-competition-1794893912006.log` |
| 12 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 2026-11-17 05:37:58.785 | 2026-11-17 05:38:41.872 | 1 | FAIL | `12-audit-dependencies-1794893921871.log` |
| 13 | `npx --no-install supabase db lint --local` | 2026-11-17 05:38:41.873 | 2026-11-17 05:38:45.688 | 0 | PASS | `13-schema-lint-1794893925687.log` |
| 14 | `npm run verify:competition` | 2026-11-17 05:38:57.435 | 2026-11-17 05:40:05.820 | 1 | FAIL | `14-verify-competition-1794894005647.log` |
| 15 | `npm run verify:competition` | 2026-11-17 05:40:22.356 | 2026-11-17 05:41:38.156 | 0 | PASS | `15-verify-competition-1794894098065.log` |
| 16 | `npm run verify:competition` | 2026-11-17 05:41:49.879 | 2026-11-17 05:42:54.213 | 0 | PASS | `16-verify-competition-1794894174205.log` |
| 17 | `npm run lint` | 2026-11-17 05:43:05.122 | 2026-11-17 05:43:22.171 | 0 | PASS | `17-lint-1794894202160.log` |
| 18 | `npm run typecheck` | 2026-11-17 05:43:22.172 | 2026-11-17 05:43:26.661 | 0 | PASS | `18-typecheck-1794894206660.log` |
| 19 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 2026-11-17 05:43:26.661 | 2026-11-17 05:44:12.519 | 0 | PASS | `19-units-1794894252519.log` |
| 20 | `node --env-file=.env.test.local .local/m5/integrity.mjs` | 2026-11-17 05:44:12.520 | 2026-11-17 05:44:16.674 | 0 | PASS | `20-m5-integrity-1794894256674.log` |
| 21 | `npm run verify:attendance-integrity` | 2026-11-17 05:44:16.676 | 2026-11-17 05:44:36.488 | 0 | PASS | `21-verify-attendance-integrity-1794894276439.log` |
| 22 | `npm run verify:attendance` | 2026-11-17 05:44:36.527 | 2026-11-17 05:44:40.072 | 0 | PASS | `22-verify-attendance-1794894280071.log` |
| 23 | `npm run verify:attendance-review` | 2026-11-17 05:44:40.072 | 2026-11-17 05:45:02.223 | 0 | PASS | `23-verify-attendance-review-1794894302215.log` |
| 24 | `npm run verify:reader-readiness` | 2026-11-17 05:45:02.224 | 2026-11-17 05:45:20.141 | 0 | PASS | `24-verify-reader-readiness-1794894320140.log` |
| 25 | `npm run verify:held-resolutions` | 2026-11-17 05:45:20.142 | 2026-11-17 05:45:35.810 | 0 | PASS | `25-verify-held-resolutions-1794894335809.log` |
| 26 | `npm run verify:second-tab` | 2026-11-17 05:45:35.810 | 2026-11-17 05:45:44.145 | 0 | PASS | `26-verify-second-tab-1794894344145.log` |
| 27 | `npm run verify:reconnect` | 2026-11-17 05:45:44.146 | 2026-11-17 05:46:22.196 | 1 | FAIL | `27-verify-reconnect-1794894382196.log` |
| 28 | `npm run verify:principal-communication` | 2026-11-17 05:46:22.198 | 2026-11-17 05:46:50.333 | 0 | PASS | `28-verify-principal-communication-1794894410332.log` |
| 29 | `npm run verify:final-journeys` | 2026-11-17 05:46:50.333 | 2026-11-17 05:47:25.819 | 0 | PASS | `29-verify-final-journeys-1794894445818.log` |
| 30 | `npm run test:rfid:integration` | 2026-11-17 05:47:25.820 | 2026-11-17 05:47:29.837 | 0 | PASS | `30-test-rfid-integration-1794894449821.log` |
| 31 | `npm run test:gateway:local-integration` | 2026-11-17 05:47:29.837 | 2026-11-17 05:47:50.992 | 0 | PASS | `31-test-gateway-local-integration-1794894470894.log` |
| 32 | `npm run verify:role-navigation` | 2026-11-17 05:47:50.993 | 2026-11-17 05:48:09.595 | 0 | PASS | `32-verify-role-navigation-1794894489595.log` |
| 33 | `npm run verify:role-visuals` | 2026-11-17 05:48:09.596 | 2026-11-17 05:48:28.515 | 0 | PASS | `33-verify-role-visuals-1794894508514.log` |
| 34 | `npm run verify:staff-localization` | 2026-11-17 05:48:28.515 | 2026-11-17 05:48:46.265 | 0 | PASS | `34-verify-staff-localization-1794894526253.log` |
| 35 | `npm run verify:accessibility-i18n` | 2026-11-17 05:48:46.265 | 2026-11-17 05:48:53.916 | 0 | PASS | `35-verify-accessibility-i18n-1794894533916.log` |
| 36 | `npm run verify:simple-voice` | 2026-11-17 05:48:53.917 | 2026-11-17 05:49:10.080 | 0 | PASS | `36-verify-simple-voice-1794894550080.log` |
| 37 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 2026-11-17 05:49:10.081 | 2026-11-17 05:50:01.605 | 0 | PASS | `37-voice-all-1794894601605.log` |
| 38 | `npm run verify:communication-local` | 2026-11-17 05:50:01.606 | 2026-11-17 05:50:36.471 | 0 | PASS | `38-verify-communication-local-1794894636435.log` |
| 39 | `node --env-file=.env.test.local .local/m5/preserve.mjs` | 2026-11-17 05:50:36.492 | 2026-11-17 05:50:36.930 | 0 | PASS | `39-m5-preserve-1794894636929.log` |
| 40 | `npm run verify:reconnect` | 2026-11-17 05:50:51.469 | 2026-11-17 05:51:18.688 | 0 | PASS | `40-verify-reconnect-1794894678676.log` |
| 41 | `node --env-file=.env.test.local .local/m5/integrity.mjs` | 2026-11-17 05:51:18.689 | 2026-11-17 05:51:22.603 | 0 | PASS | `41-m5-integrity-1794894682593.log` |
| 42 | `npm run verify:school-operations` | 2026-11-17 05:52:07.215 | 2026-11-17 05:52:49.374 | 0 | PASS | `42-verify-school-operations-1794894769373.log` |
| 43 | `npx --no-install supabase db lint --local` | 2026-11-17 05:52:49.375 | 2026-11-17 05:52:52.430 | 0 | PASS | `43-schema-lint-1794894772429.log` |
| 44 | `npm run build:isolated -- --working-tree` | 2026-11-17 05:52:52.431 | 2026-11-17 05:53:54.651 | 0 | PASS | `44-build-isolated-1794894834597.log` |
| 45 | `node --env-file=.env.test.local .local/m5/integrity.mjs` | 2026-11-17 05:53:54.664 | 2026-11-17 05:53:58.283 | 0 | PASS | `45-m5-integrity-1794894838269.log` |
| 46 | `node --env-file=.env.test.local .local/m5/preserve.mjs` | 2026-11-17 05:53:58.284 | 2026-11-17 05:53:58.754 | 0 | PASS | `46-m5-preserve-1794894838753.log` |


## Remaining limits and release boundary

This release is for a rehearsed fictional laptop-local presentation. Human speaker/fluency/translation/educational review, screen-reader/family usability, physical Pi/reader/power/storage/network acceptance, real recipient delivery and hosted operational/privacy/security acceptance remain pending. Native callbacks and advancing WAV clocks do not establish audible, correct pronunciation. The existing English/Hindi/Marathi interface remains unchanged; Korean is message translation/speech only. Optional Ollama is laptop-local, not hosted production AI.

Excused attendance remains deferred pending policy, reporting and old-client compatibility. No fourth status was silently added. General browser/PWA offline boot, unattended Teacher replay after logout and a separately hosted cloud replica are not promised. Capture authorization expiry/revocation and held-work procedures retain M1–M4 boundaries. Draft defaults never confirm presence; gate evidence never proves attendance or safety.

Before travel: rehearse the exact dated fixture, use fluent listeners and actual audio output, copy/extract the successful backup, practise honest recovery, and have an adult review financial assumptions and technical answers. Keep public deployment and hardware integration as separate authorized tasks. Stop after M5.

## GitHub publication

Implementation and presentation-pack commit: **`2dec0b554af05d7c4fd0fe3903261402adaa070f`**, [verified on GitHub](https://github.com/OmiVibes/Schovera/commit/2dec0b554af05d7c4fd0fe3903261402adaa070f). Sixteen relevant files were committed with the existing OmiVibes identity and pushed normally to `origin/main`. `git ls-remote origin refs/heads/main` matched that SHA, and the independent GitHub connector returned the same commit/URL. The repository URL and authenticated OmiVibes account were verified. No force push, backdating, empty commit, merge bypass or deployment was used.

This evidence/handoff report is committed and published separately after that verified implementation. Its final remote-main SHA is provided in the completion response and ignored publication receipt, avoiding a self-referential commit hash inside its own content. All completed M5 implementation and pack files are already remote; this report is the only file staged for the final documentation commit. The final handoff verifies that documentation commit through both remote Git and GitHub as well.

Expected remaining unrelated working-tree state after publication:

```text
 M docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md
?? CLAUDE.md
?? review/
```

Private configuration, databases, account manifests, generated ZIPs/screenshots and evidence logs remain excluded. A source-pattern/value check and diff check passed before staging. This is an actual software/presentation checkpoint; contribution-graph timing is not guaranteed or manufactured. M5 ends here; no hardware integration or public launch follows automatically.
