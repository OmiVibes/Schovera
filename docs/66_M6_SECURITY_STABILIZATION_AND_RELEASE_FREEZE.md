# M6 — Security patching, stabilization and software release freeze

17 November 2026. **M6 is complete for local software review. Presentation acceptance remains conditional on human rehearsal, fluent-language and device-audio checks.** This is a fictional laptop-local software release, not hardware, school-pilot or public-production certification.

## Baseline and preserved boundaries

Repository `OmiVibes/Schovera`; working directory `D:\Notes\Degree\Projects\Schovera`; branch `main`. Starting HEAD and fetched `origin/main` matched **`bed688282ef7e8262b0d0392e0f3b013712e04c9`**. M5 implementation: `2dec0b554af05d7c4fd0fe3903261402adaa070f`. M1–M5 reports and the original failure evidence were inspected; their historical results are not rewritten by this follow-up.

Pre-existing `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, `CLAUDE.md` and `review/` are preserved/excluded. The developer `.env.local` was **never opened, copied, modified, moved, renamed, hashed or printed**. Existing passwords, protected school records, migrations, attendance writers, offline canonical envelopes/receipts and application permissions are unchanged. No reset, seed, hosted query/deployment, public tunnel, paid provider, real notification or physical device operation was performed.

Tests use only the existing approved QA checkout `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, its retained explicit local configuration, Supabase API `127.0.0.1:54321`, loopback DB `127.0.0.1:54322`, and owned web ports 3104/3105. The schema remains **48 reviewed migrations**. Docker/core Auth/API/PostgreSQL were already running. Vector's pre-existing restarting state remains unresolved; core test success does not certify operational logging.

Private Git-ignored evidence **E**: `.local/schovera-manual-demo/m6-20261117/`. It contains before hashes, audits, candidate metadata/lock comparison, installation logs, command ledger and publication receipt. Known approved QA secrets are redacted from retained test-command logs. Private files, account journals, databases, raw captures and ZIPs stay out of Git.

M6 files: `package.json`, `package-lock.json`; `scripts/competition/{cli,guard,guard.test,rehearse}.mjs`; `scripts/verify-competition.mjs`, `scripts/verify-reconnect.mjs`; `src/lib/use-realtime-resync.test.tsx`; `docs/competition/{README,FEATURE_STATUS,JUDGE_QA,PITCH_3_MINUTES,PITCH_5_MINUTES,PRESENTATION_CHECKLIST,ADULT_REHEARSAL_CHECKLIST}.md`; and this report. The existing application hook itself, Next configuration, server authorization, gateway/storage implementation and all SQL files are unchanged.

## Security findings and supported remediation

Fresh initial audits reproduced M5: production **one moderate Next.js entry**; complete graph **eight moderate entries**, zero critical/high. The complete graph comprises Next plus minimatch and propagated TypeScript-ESLint dependants; these are package entries, not eight distinct exploits.

| Dependency | Before | Tested after | Scope / compatibility |
|---|---|---|---|
| Next.js | 16.4.1 | **16.4.5**, exact direct pin | Minimum patched version identified by the reviewed advisory; Node >=20.9 and existing React 19 peers remain satisfied |
| eslint-config-next | 16.4.1 | **16.4.5**, exact direct pin | Aligned framework configuration; ESLint >=9 and TypeScript peers retained |
| typescript-eslint / @typescript-eslint family | 8.69.0 | **8.73.0**, supported transitive resolution | Within Next lint config's `^8.56.0`; current parser peers support existing TypeScript and ESLint 9 |
| Nested minimatch under typescript-estree | 10.2.6 | **11.0.9** | Parent now requests `^11.0.1`; this is a supported upstream major transition, not our override |
| @isaacs/nonrecursive-glob-match | absent | **1.1.0** | Required by the patched minimatch dependency |
| Zod / sharp | 4.6.6 / 0.35.5 | **unchanged** | Existing validated runtime dependency and override retained |
| React / React DOM | 19.2.8 | **unchanged** | No React upgrade |
| ESLint | 9.39.5 | **unchanged** | Lints successfully; npm still warns this major is unsupported; a supported-major migration is separate review |

The lockfile changes only the expected Next family (env/plugin/platform SWC), TypeScript-ESLint family, its patched minimatch/new matcher dependency and supported nested `ignore`/`semver` patch resolutions. Root minimatch 3.1.5 is unchanged. No direct TypeScript-ESLint dependency or forced override was added. Existing scripts, overrides and engine declarations are preserved. No lint rule, security check or permission was disabled. No `npm audit fix`, `--force` or incompatible downgrade was used.

- [Next.js GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h) identifies 16.4.5 as patched. It concerns a cache race involving root parameters and a `use cache` function called through `unstable_cache()`. Source/config inspection found none of those APIs. That reduces identified applicability; patching removes the reported vulnerable version regardless. This is not an exploit test or proof of universal framework safety. [Official 16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5).
- [Minimatch GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) identifies >=7 <11.0.1 as affected. Fresh official registry metadata returned typescript-estree **8.73.0** with `minimatch: ^11.0.1`; **8.72.2** still requests 10.x, and queried 8.72.3 was absent. The [8.73.0 upstream release](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.73.0) also contains other compatible 8.x parser/rule changes, so lint and TypeScript were explicitly regressed. No experimental native TypeScript parser was enabled.

These sources/registry metadata were checked on 17 November. Historical M4/M5 lack of a supported upstream fix remains accurate for those recorded inspections; current supported metadata permits this remediation.

### Lockfile preparation and installation

Only two direct specifications change: Next and its lint config. An owned candidate directory inside E contains only copies of package manifests, never environment files. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` resolves that pair; targeted `npm update typescript-eslint --package-lock-only --ignore-scripts --no-audit --no-fund` refreshes its permitted dependency subtree. Reviewed candidate manifests/lock were copied to source and QA; `npm ci --no-audit --no-fund` installed **479 packages inside QA**, using an OS-variable allowlist. The developer installation was not reinstalled and must not be described as automatically patched. Root competition commands delegate runtime work to the updated QA installation.

The first candidate command used `--prefer-offline` and failed `ETARGET` for `@next/eslint-plugin-next@16.4.5`. A fresh exact registry query returned that version with HTTP 200. Retrying with `--prefer-online` succeeded without changing the chosen versions; stale cached metadata is the likely explanation, not a confirmed missing upstream release. Both attempts/logs are retained. This failure occurred before applying the candidate to the repository or QA.

| Preparation | Exit | Evidence in E |
|---|---:|---|
| Candidate: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-offline` | 1 | `candidate-next-lock.log/.json` |
| Candidate: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online` | 0 | `candidate-next-lock-online.log/.json` |
| Candidate: `npm update typescript-eslint --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online` | 0 | `candidate-lint-lock-online.log/.json` |
| QA: `npm ci --no-audit --no-fund` | 0 | `qa-install.log/.json` |

Fresh post-install and release-freeze audit results are recorded in the ledger below. A zero npm result is a dated advisory-database result, not penetration testing, a deployment assessment or a guarantee of no undiscovered vulnerabilities.

## Competition preflight and backup verification changes

The M5 preflight hardcoded Next 16.4.1 and would reject a patched installation. It now reads **exact reviewed pins** from the source manifest, requires aligned Next/eslint-config-next versions, and verifies installed QA Next/config/Zod against them. Source fingerprints and existing localhost/Host/Origin/env/ownership guards remain intact. A focused guard test rejects ranged/misaligned metadata; runtime startup verifies the actual installed patch.

Competition acceptance now also calls `competition -- credentials`, validates that all three fictional role lines are complete **only in memory**, and never logs that output. Actual sign-in validation remains independent in startup/status. The generated gallery is opened in a browser context with networking disabled and all 13 local images must load; only then is `offlineGalleryVerified` stored and the ZIP completed. This tests the local backup, not a physical WAN outage.

No new product feature, credential endpoint or public service is added. Backups remain outside Next's watched application tree. Existing repeated preparation/read-only completed rehearsal/owned process restart and fixture cleanup assertions are retained.

## Reconnect investigation

M5's retained failed run reached the later normal-update wait (original line 492), after missed-update/acknowledgement, flapping, second-tab, logout, child isolation and Principal recovery passed. The unchanged subsequent run passed. The old evidence has no sufficient request/signal trace at that exact wait to establish whether a query failed to run, its response was rejected, or headless focus recovery failed. **Its root cause remains unconfirmed.** A successful dependency update does not prove it fixed that timeout.

Inspection covered the existing finite/coalesced first-subscription recovery, focus/visibility/online listeners, Parent latest-read and child-context guards, channel teardown, authorization and gateway worker ownership. No reproducible application synchronization defect was found in this phase, so application synchronization code was not changed and no extra polling/sleep/timeout was added.

The reconnect verifier gains failure-only, sanitized diagnostics at that same normal-update wait: browser online/visibility/focus signals, bounded update-query response statuses, selected-child match and independent destination/Parent-authorized row counts. No headers, bearer/session state, query tokens, authored text or credentials are retained. It observes real signals without injecting recovery events or altering timing. Original assertions and the 20-second wait remain unchanged. The diagnostic failure branch was not forced by hiding a real failure; its execution coverage is stated in the final results.

A focused hook test adds hidden/offline visibility suppression, visible-online reconciliation, coalescing with focus and listener removal after unmount. It complements existing finite first-join/Strict Mode tests. It is a jsdom event-contract check, not certification of every browser/window-manager visibility transition.

Controlled repetitions and final regression results are recorded below. Finite passes are confidence evidence, not an SLA. Session revocation, same-school/class permissions, logout and cross-school denial remain independently covered by M1/M2/M4 and role suites rather than inferred from a visible message.

## Presentation review

The M5 pitches had approximately 302 and 545 spoken words, leaving little click/response time at a slower student pace. M6 shortens them to approximately **244 and 437 words**, respectively, with explicit adult actions and honest recovery. At an illustrative 110 spoken words/minute, that is about 133/238 seconds of speech, leaving about 47/62 seconds for actions within the targets. This is planning arithmetic, **not a measured student rehearsal**; actual reading speed, window switching and optional audio/review may take longer.

The short version leaves optional translation/audio for the extended version. Both distinguish original delivery from translation approval, scan evidence from classroom confirmation, no-scan manual fallback, retained work from destination delivery, proposed price from actual customers/profit, and simulated input from hardware. The extended held-work explanation is narrowed to the original authorized Teacher rather than implying general staff impersonation rights.

[Adult cue sheet](competition/ADULT_REHEARSAL_CHECKLIST.md): adult prepares services/private sign-ins, runs terminals and switches role windows; Arohi follows cue words. It requires a fresh fictional fixture for live actions, actual timed/fluent/audio practice and a labelled recorded backup. The README/status/Q&A/technical checklist now point to M6's dated findings, avoiding repetition of historical advisories as current.

[Business model](competition/BUSINESS_MODEL.md) and [preliminary sourced competitor comparison](competition/COMPETITORS.md) were reviewed without inventing new market facts. Financial assumptions remain USD 3/student/year and illustrative USD 1 = INR 85; the 200/800-student arithmetic and hardware budgets were rechecked. Revenue 600/2400 less assumed costs 537/1419 leaves 63/981 contribution (10.5%/40.875%) before excluded costs/tax, not guaranteed net profit. Proposed hardware costs are not verified quotes or certified compatibility. No customer validation, novel multilingual monopoly, live FX, physical hardware result or hosted service claim was added.

## Exact local setup and successful rehearsal contract

Tested runtime is **Node 22.18.0 on Windows**; full local SQLite/gateway operation requires Node 22.13+. An existing approved QA checkout, its reviewed installed lockfile/configuration, Docker/local Supabase and 48 migrations are prerequisites. No fresh-laptop installer, automatic migration or private-env synchronization is implied.

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
npm run competition -- start
npm run competition -- status
npm run competition -- credentials
npm run competition -- rehearse
npm run competition -- stop
# Inspect pending work first; explicit cleanup of ONLY this owned rehearsal:
npm run competition -- clean --discard-pending
```

True local URL: **http://127.0.0.1:3104**. Credentials are fictional, freshly generated and privately displayed; no fixed password is published here. Use separate Teacher/Parent/Principal sessions in the same owned school, Grade 8-A / Synthetic Child A. The second student demonstrates manual fallback. Stop retains a same-day fixture; a completed repeat checks its saved result without duplicate students or writes. Explicit known-owned cleanup/start prepares a fresh action sequence. Unknown fixture/process ownership is refused.

The full rehearsal checks actual original-message form/persistence/acknowledgement before optional Principal-reviewed Marathi, real media progress/controls, signed mock input through SQLite/local v2 API, duplicate suppression, zero scan-created classroom rows, explicit Teacher finalization and Parent final-only record, a separately reopened pending queue with unchanged classroom records, Principal views, two widths and backup retention. Physical audibility and fluent meaning are not proved by clicking a synthetic approval checkbox or advancing an audio clock. M5's screenshots remain historical; the new release backup/results are recorded below.

## Verification ledger and integrity

**49 recorded verification executions: 47 PASS, 2 FAIL.** The failures are the initial production/full security audits before remediation. All post-patch audit and functional executions passed. Separately, the first candidate-lock preparation failed and its successful metadata-refresh retry remains recorded above. These are execution counts, not independent feature totals.

| Audit phase | Production graph | Complete graph | Critical / high |
|---|---|---|---|
| Initial baseline | 1 moderate, exit 1 | 8 moderate, exit 1 | 0 / 0 |
| After patched QA install | 0, exit 0 | 0, exit 0 | 0 / 0 |
| Frozen working source | 0, exit 0 | 0, exit 0 | 0 / 0 |
| Exact committed checkpoint | 0, exit 0 | 0, exit 0 | 0 / 0 |

- **Final unit/component coverage:** 366 passing tests in 47 files, including the new reviewed-version and visibility/coalescing/cleanup cases. Existing RFID/gateway/attribution subsets are included, not counted again. Two separate RFID/gateway Vitest integration scenarios passed outside that unit count.
- **Reconnect:** full existing acceptance **3/3 PASS**, controlled initial-query/channel-join gap **3/3 PASS**. No M6 timeout recurred; the new failure-only diagnostics did not execute their failure branch. Existing M5 failure remains unresolved as to cause. No recovery implementation, test timeout or readiness assertion was weakened. The units separately verify visibility state behavior; real headless focus/online recovery, logout/channel teardown and context isolation are exercised by browser suites.
- **M1?M4:** draft/final transitions and Parent draft privacy; revision/reason/history/idempotency and legacy offline replay; review flags and exact SQL totals; immutable reader/queue events and revocation; same-Teacher held correction/closure; direct role/class/school/session denial all passed. SQL migrations and canonical storage contracts are unchanged.
- **Competition:** full acceptance passed **before and after commit**. It checks all three actual fictional sign-ins, start/status/private credentials, original notice/Parent acknowledgement, optional reviewed translation/audio controls, signed durable mock scan and exact retry, explicit Teacher finalization/Parent confirmation, manual fallback, pending/reopen/replay, Principal views, 13 desktop/mobile captures, offline gallery, same-fixture repeat and owned server stop/restart/cleanup.
- **Other required acceptance:** offline school operations passed real HTTP capture, three durable pending operations through a real Next restart, fresh authorized replay, receipts, stale holds, lost-response/concurrent retry, Origin/role denial and three-portal mobile views. Connected journeys passed Teacher send/attendance, Principal translation approval, Parent media/acknowledgement/profile/homework/timetable, logout and separate RFID replay. AUD-01 boundaries through 2,005 plus the 2,007-row correction case matched SQL/oracle/UI with complete keyset traversal.
- **UI/languages/audio:** role navigation, 23 destinations at 1440/1024/768/390px, 96 staff localization combinations, accessibility/i18n and real Parent/Teacher audio controls passed. Ten native en/hi/mr/ko samples matched text/locale/start/end. Actual pronunciation, audibility, fluent semantics, every contrast pair, screen-reader session and all expanded states remain manual or untested. Korean remains message translation/speech, not a fourth global interface. Optional Ollama drafting/automatic translation was not live-generated again in M6; its M5 evidence remains historical. Ollama was not started in this milestone.
- **TypeScript/ESLint/schema:** all final checks passed; no warning/rule suppression. Supabase db lint found no schema errors. ESLint's package-support warning and existing auxiliary Vector health issue remain operational review items even with zero npm advisories.
- **Build/freeze:** both isolated builds passed Next 16.4.5 optimized compilation, TypeScript, expected routes, generated `.env.production` only, private sentinels absent, unchanged approved inputs and exact temporary-snapshot cleanup. Approved-source SHA-256 **`a0e49e5be94ffba59516298cae99adc4d7451805157264a8d92ebd5a4da971ec`**, **223 files**, is identical before/after the implementation commit. Only the two allowlisted Google Fonts hosts were observed through the limited proxy, not an OS network sandbox. Safe `--working-tree` mode was needed because unrelated documentation remains modified; application/scripts/manifests/migrations had no diff after commit. This establishes the tested committed code identity, not a hosted release certificate.
- **Preservation:** all **20 protected-school dataset hashes unchanged** after final tests; no new protected register/history/review/resolution rows. **351 existing tracked files outside the intentional changes** match exact before hashes, including unrelated doc 45; **264 executable source/script/migration inputs match QA**. All **48 migrations** remain. Owned fictional SQL/accounts/queues and fixture pointers were cleaned; backups retained. Owned QA process trees were checked before stopping; competition and offline suites clean their own workers. Ports 3104/3105/11434 are stopped at handoff; Docker is retained as found. No unrelated process was stopped.
- **Review hygiene:** source/diff checks, current QA-secret-value and private-key/token-pattern checks, document links and ZIP type/text scans passed. No production secret was opened or compared. Preliminary inspection issues (console Unicode encoding, rejected document patch format and a word-counter separator) were corrected without changing product behavior/data; they are not application acceptance failures.

The table uses exact actual commands, UTC on 17 November 2026; IST adds 05:30. QA is the cwd except root-safe competition/build wrappers. The private ledger retains each cwd and revision. Rows 44?49 explicitly record **8b7af8997275c791bfe28f2a373e872ee8bf080f**; preceding checks used its identical approved source before commit. Installation/registry/document inspection commands are separate preparation records above.

| # | Exact command | UTC start | UTC end | Exit | Result | E/log |
|---:|---|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m6/preserve.mjs` | 06:09:41.417 | 06:09:42.518 | 0 | PASS | `01-m6-preserve-1794895782517.log` |
| 2 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 06:09:42.530 | 06:09:45.414 | 1 | FAIL | `02-audit-production-1794895785413.log` |
| 3 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 06:09:45.414 | 06:09:49.716 | 1 | FAIL | `03-audit-dependencies-1794895789698.log` |
| 4 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 06:14:01.820 | 06:14:03.949 | 0 | PASS | `04-audit-production-1794896043948.log` |
| 5 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 06:14:04.049 | 06:14:05.844 | 0 | PASS | `05-audit-dependencies-1794896045761.log` |
| 6 | `npm run lint` | 06:14:05.845 | 06:14:25.487 | 0 | PASS | `06-lint-1794896065470.log` |
| 7 | `npm run typecheck` | 06:14:25.489 | 06:14:36.269 | 0 | PASS | `07-typecheck-1794896076268.log` |
| 8 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:14:36.269 | 06:15:19.654 | 0 | PASS | `08-units-1794896119653.log` |
| 9 | `npm run verify:reconnect` | 06:15:33.610 | 06:16:11.139 | 0 | PASS | `09-verify-reconnect-1794896171084.log` |
| 10 | `npm run verify:second-tab` | 06:16:11.157 | 06:16:20.534 | 0 | PASS | `10-verify-second-tab-1794896180525.log` |
| 11 | `npm run verify:reconnect` | 06:16:20.535 | 06:16:48.516 | 0 | PASS | `11-verify-reconnect-1794896208514.log` |
| 12 | `npm run verify:second-tab` | 06:16:48.517 | 06:16:55.853 | 0 | PASS | `12-verify-second-tab-1794896215853.log` |
| 13 | `npm run verify:reconnect` | 06:16:55.854 | 06:17:22.755 | 0 | PASS | `13-verify-reconnect-1794896242754.log` |
| 14 | `npm run verify:second-tab` | 06:17:22.755 | 06:17:30.845 | 0 | PASS | `14-verify-second-tab-1794896250834.log` |
| 15 | `npm run verify:attendance-integrity` | 06:19:21.700 | 06:19:37.816 | 0 | PASS | `15-verify-attendance-integrity-1794896377762.log` |
| 16 | `npm run verify:attendance-review` | 06:19:37.833 | 06:20:00.225 | 0 | PASS | `16-verify-attendance-review-1794896400181.log` |
| 17 | `npm run verify:reader-readiness` | 06:20:00.244 | 06:20:18.314 | 0 | PASS | `17-verify-reader-readiness-1794896418304.log` |
| 18 | `npm run verify:held-resolutions` | 06:20:18.315 | 06:20:35.505 | 0 | PASS | `18-verify-held-resolutions-1794896435504.log` |
| 19 | `npm run verify:principal-communication` | 06:20:35.505 | 06:21:05.646 | 0 | PASS | `19-verify-principal-communication-1794896465645.log` |
| 20 | `npm run verify:final-journeys` | 06:21:05.646 | 06:21:45.184 | 0 | PASS | `20-verify-final-journeys-1794896505149.log` |
| 21 | `npm run test:rfid:integration` | 06:21:45.206 | 06:21:49.684 | 0 | PASS | `21-test-rfid-integration-1794896509593.log` |
| 22 | `npm run test:gateway:local-integration` | 06:21:49.685 | 06:22:10.599 | 0 | PASS | `22-test-gateway-local-integration-1794896530598.log` |
| 23 | `npm run verify:role-navigation` | 06:22:10.600 | 06:22:29.367 | 0 | PASS | `23-verify-role-navigation-1794896549271.log` |
| 24 | `npm run verify:staff-localization` | 06:22:29.368 | 06:22:49.217 | 0 | PASS | `24-verify-staff-localization-1794896569217.log` |
| 25 | `npm run verify:accessibility-i18n` | 06:22:49.218 | 06:22:57.667 | 0 | PASS | `25-verify-accessibility-i18n-1794896577666.log` |
| 26 | `npm run verify:simple-voice` | 06:22:57.668 | 06:23:15.057 | 0 | PASS | `26-verify-simple-voice-1794896595049.log` |
| 27 | `npm run lint` | 06:23:15.058 | 06:23:33.134 | 0 | PASS | `27-lint-1794896613133.log` |
| 28 | `npm run typecheck` | 06:23:33.134 | 06:23:37.029 | 0 | PASS | `28-typecheck-1794896617029.log` |
| 29 | `node --env-file=.env.test.local .local/m6/preserve.mjs` | 06:23:37.030 | 06:23:37.987 | 0 | PASS | `29-m6-preserve-1794896617973.log` |
| 30 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:24:48.523 | 06:25:31.563 | 0 | PASS | `30-units-1794896731460.log` |
| 31 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 06:25:31.574 | 06:26:25.480 | 0 | PASS | `31-voice-all-1794896785463.log` |
| 32 | `npm run verify:role-visuals` | 06:26:25.497 | 06:26:47.768 | 0 | PASS | `32-verify-role-visuals-1794896807767.log` |
| 33 | `node --env-file=.env.test.local .local/m6/business-math.mjs` | 06:26:47.769 | 06:26:47.840 | 0 | PASS | `33-m6-business-math-1794896807839.log` |
| 34 | `npm run lint` | 06:26:47.840 | 06:27:05.066 | 0 | PASS | `34-lint-1794896825066.log` |
| 35 | `npm run typecheck` | 06:27:05.067 | 06:27:09.162 | 0 | PASS | `35-typecheck-1794896829162.log` |
| 36 | `npm run verify:competition` | 06:27:58.712 | 06:29:05.901 | 0 | PASS | `36-verify-competition-1794896945840.log` |
| 37 | `npm run verify:school-operations` | 06:29:05.918 | 06:29:48.092 | 0 | PASS | `37-verify-school-operations-1794896988091.log` |
| 38 | `npx --no-install supabase db lint --local` | 06:29:48.092 | 06:29:51.695 | 0 | PASS | `38-schema-lint-1794896991694.log` |
| 39 | `node --env-file=.env.test.local .local/m6/integrity.mjs` | 06:29:51.696 | 06:29:55.502 | 0 | PASS | `39-m6-integrity-1794896995493.log` |
| 40 | `node --env-file=.env.test.local .local/m6/preserve.mjs` | 06:29:55.503 | 06:29:55.878 | 0 | PASS | `40-m6-preserve-1794896995878.log` |
| 41 | `npm run build:isolated -- --working-tree` | 06:29:55.879 | 06:30:57.095 | 0 | PASS | `41-build-isolated-1794897057084.log` |
| 42 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 06:30:57.106 | 06:30:59.273 | 0 | PASS | `42-audit-production-1794897059267.log` |
| 43 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 06:30:59.274 | 06:31:01.013 | 0 | PASS | `43-audit-dependencies-1794897061013.log` |
| 44 | `npm run verify:competition` | 06:33:48.131 | 06:35:00.638 | 0 | PASS | `44-verify-competition-1794897300384.log` |
| 45 | `npm run build:isolated -- --working-tree` | 06:35:00.655 | 06:36:06.200 | 0 | PASS | `45-build-isolated-1794897366068.log` |
| 46 | `node --env-file=.env.test.local .local/m6/integrity.mjs` | 06:36:06.223 | 06:36:09.803 | 0 | PASS | `46-m6-integrity-1794897369762.log` |
| 47 | `node --env-file=.env.test.local .local/m6/preserve.mjs` | 06:36:09.804 | 06:36:10.435 | 0 | PASS | `47-m6-preserve-1794897370395.log` |
| 48 | `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` | 06:36:10.436 | 06:36:12.987 | 0 | PASS | `48-audit-production-1794897372853.log` |
| 49 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 06:36:12.987 | 06:36:15.056 | 0 | PASS | `49-audit-dependencies-1794897375008.log` |


## Frozen synthetic backup

Recommended private backup: **`C:\Users\Om\Downloads\Schovera_M6_Frozen_Competition_2026-11-17.zip`**. Its source is `%TEMP%\schovera-competition-backups\6943454e-3cff-4c41-b8eb-12c1897a8c46\977a7009-8922-4c51-81c6-889922686082.zip`, produced by the post-commit rehearsal.

SHA-256 **`0d83ba67287e35cd4e89c98598e417e67329f4d6f4fce08d62933a18957aece1`**; **2,749,848 bytes**; **16 files**: 13 fictional PNGs, `OPEN_GALLERY.html`, `result.json`, `queue-proof.json`. Downloads copy matches; allowed-type/path/credential-pattern checks passed. The actual gallery and all local images loaded with browser networking disabled. Parent attendance/Principal communication mobile views from the initial patched run and Teacher attendance mobile from the frozen run were visually inspected. This is selected-state review, not all possible screens or pixels.

Extract and open the gallery as **recorded fictional evidence**, not live hardware. No video was created. No environment, account manifest/password, database, key or dependency bundle belongs in the ZIP. The initial M6 and previous M5 backups are preserved separately, not overwritten; generated binaries remain outside Git. Practise the actual backup and audio on the presentation laptop before travel.

## Release freeze and safe rollback

Tested implementation commit: **`8b7af8997275c791bfe28f2a373e872ee8bf080f`**, [GitHub checkpoint](https://github.com/OmiVibes/Schovera/commit/8b7af8997275c791bfe28f2a373e872ee8bf080f). The competition rehearsal, isolated build, preservation and both audits were rerun after this commit. The identical approved-source fingerprint connects the full earlier suite to this exact code. No queue/storage format, SQL migration or application authorization contract changes in M6; 48 migrations remain. Only the handoff report may be committed separately after code verification/publication. Other checkouts or already running processes do not become patched merely because Git is updated: use the reviewed lockfile and guarded QA workflow, never a raw root build that might discover private configuration.

Before a separately approved rollback: stop only the known owned competition server and **all identified workers**; inspect retained pending/held work; preserve a consistent private SQLite database/WAL backup using reviewed procedures while stopped. Do not remove journals, reset queues or edit canonical payloads/receipts. Production backup/restore is not certified here.

For code review of an older revision, use a separate new detached Git worktree without private env files; do not reset, clean or overwrite this working tree. To undo a reviewed M6 implementation on the shared branch, a normal reviewed `git revert <implementation-SHA>` creates a forward commit without rewriting main. Preserve unrelated work, resolve conflicts explicitly and test before normal publication. No rollback was executed by this task.

M5's known framework/lint advisories would return if its older lockfile were restored, so it is **not an equivalent secure release fallback**. Prefer a forward fix. A temporary older-source comparison must stay isolated/local; it is not permission to expose that version publicly. An approved QA dependency reinstall must use its matched package/lock and OS allowlist. M6 requires no database downgrade or data restore; never roll protected records back to match code.

## Exact hardware handoff — next milestone only

No physical integration begins automatically. Before a separately approved bench milestone, supply/confirm:

1. Exact board model/revision, supported OS/Node/ARM runtime, correctly rated compatible power supply and safe storage. Do not infer GPIO voltage, pins, buses or reader compatibility from the hypothetical business BOM.
2. Exact reader/card technology/interface and reviewed electrical/protocol documentation, enclosure/cables and electrical supervision. The current physical driver reports `reader_not_configured`; no tap/power/network test is claimed.
3. A reviewed acquisition-to-enrollment mapping that preserves a stable acquisition UUID, positive monotonic sequence across restart, original qualified timestamp/event type until durable local acknowledgement; no guessed student identity from raw card UID.
4. Device/reader/key custody and rotation/revocation plan, authenticated local ingress, signed immutable assignment-bound v2 transport and nonce/idempotency rules. A retry retains identity/content; a separate observation remains separate evidence.
5. Synthetic bench acceptance for exact retries, separate scans, unknown/lost/revoked cards, clock uncertainty/sequence gaps, disconnected reader, gateway restart/disk-full/power loss, retained queue and lost-response replay. Preserve rejected/unresolved evidence and test live-worker exclusion; never remove safety gates to make the bench look live.
6. Three-portal reconciliation proving **zero automatic classroom attendance**, explicit Teacher finalization, manual fallback and Parent confirmed-only marks. Physical card cloning/identity/safety and site LAN/WAN reliability require independent testing.
7. Only after bench acceptance: separately reviewed school consent/enrollment, privacy/retention/encryption/backup/restore/incident operations and supervised pilot. Hosted architecture, limits/monitoring and real SMS/calls require separate design/authorization. No public tunnel shortcut.

M2's native Back/Forward unsaved-navigation limitation, current-roster rather than historical-class reconciliation and conservative review invalidation remain. Only the original authorized Teacher can resolve held work; delegation is not added. Excused policy/versioned consumer/reporting rollout remains deferred. Browser-only/PWA offline boot, unattended Teacher replay after logout, a separately accepted cloud replica, fluent language/speaker acceptance, full assistive-technology/load/usability acceptance and public production readiness remain outside this release. A green npm audit or local build does not close these limits.

## GitHub publication

Implementation **8b7af8997275c791bfe28f2a373e872ee8bf080f** was pushed normally to `origin/main` after post-commit verification. `git ls-remote origin refs/heads/main` returned that SHA and the independent GitHub connector returned the same commit and canonical URL. Sixteen relevant source/test/lock/presentation files are in that checkpoint. Existing OmiVibes authorship was retained; no fake activity or date manipulation was used.

This detailed completion report is published separately after the verified implementation. The final documentation commit SHA and verified GitHub URL are in the completion response and ignored publication receipt, avoiding a self-referential hash in its own content. Only this report is staged for that last commit; completed M6 code is already remote. The final documentation push is also independently verified through remote Git and GitHub.

Expected remaining unrelated state is only modified `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md` plus untracked `CLAUDE.md` and `review/`. Private/generated files stay excluded. No force-push, reset, stash, merge bypass or deployment occurred. M6 stops here for review; hardware, Excused and public production work do not start automatically.
