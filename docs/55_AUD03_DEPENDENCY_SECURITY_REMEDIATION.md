# AUD-03 — Dependency security remediation

9 November 2026. **Status: PARTIALLY FIXED.** This is a local dependency patch and regression record, not production security certification. Eight moderate development-tool package entries remain unresolved; no incompatible override was applied.

## Scope and preservation

Repository: `D:\Notes\Degree\Projects\Schovera`; branch: `feat/simpler-demo-and-workspaces`; starting HEAD: `aac3a7c77d11518dc0654e3f89381f472943b064`. HEAD is unchanged. The original [independent audit](SCHOVERA_FULL_SOFTWARE_AUDIT_2026-11-09.md) is historical evidence and is not rewritten by this follow-up. [AUD-01](54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md) was already uncommitted at the start.

Only `package.json`, `package-lock.json` and this report are changed by AUD-03. Package scripts, including the new AUD-01 verifier, and all overrides are preserved. SHA-256 snapshots cover the nine existing AUD-01 implementation, test, migration and documentation files. No application implementation, UI, migration, RLS, offline architecture or password change is part of this patch. Existing `CLAUDE.md`, local logs and `review/` are preserved.

No staging, commit, push or deployment is authorized or performed. The developer `.env.local` was not opened, copied, hashed or modified. No hosted database, paid provider or public tunnel is used.

## Versions and minimal patch

| Dependency | Before lockfile / QA installation | After lockfile / QA installation | Reason |
|---|---|---|---|
| Next.js | 16.3.8 | **16.4.1**, exact direct version | Minimum verified patched 16.x release for the three reported framework advisories |
| eslint-config-next | 16.3.8 | **16.4.1**, exact direct version | Keep the framework lint configuration aligned |
| Zod | 4.5.4, direct specification `^4.1.12` | **4.6.6**, exact direct version | Fix collection-validation memory exhaustion |
| sharp | 0.35.5 | **0.35.5**, unchanged override | Retain existing SVG optimization mitigation |
| Nested minimatch | 10.2.6 | **10.2.6**, unchanged | Supported by its current parent; unresolved advisory |
| Root minimatch | 3.1.5 | **3.1.5**, unchanged | Outside this advisory's affected range |
| typescript-eslint / typescript-estree | 8.69.0 | **8.69.0**, unchanged | No compatible parent update established that removes the vulnerable minimatch range |

Only these three direct specifications change. The lockfile also updates the corresponding `@next/env`, SWC platform packages and `@next/eslint-plugin-next`; it does not churn unrelated versions. React, TypeScript and Supabase versions are unchanged. Node 22.18.0 meets Next's Node >=20.9.0 requirement; the existing React 19 and ESLint 9 satisfy the selected packages' peers. Next 16 bundled upgrade documentation and registry metadata were inspected before applying the patch. Framework compilation/routing, validation refinements and lint behavior are the primary regression risks.

The developer checkout's existing `node_modules` was deliberately not reinstalled; its installed Next/Zod remain the older versions. Updated dependencies were installed and tested in the isolated QA checkout, and the isolated build installs its own lockfile. Other existing runnable snapshots are not automatically patched. Before using another checkout to run the updated application, stop its owned server and install this lockfile there using its approved local environment/startup procedure. Merely editing the manifest does not patch an already running process.

## Security findings

| Audit | Critical | High | Moderate | Total package entries | Exit |
|---|---:|---:|---:|---:|---:|---:|
| Fresh before, all dependencies | 1 | 1 | 8 | 10 | 1 |
| After, all dependencies | 0 | 0 | 8 | 8 | 1 |
| After, production dependency graph (`--omit=dev`) | 0 | 0 | 0 | 0 | 0 |

These are npm package entries, including propagated dependant entries, not ten independent exploits. A zero production dependency-graph result is not a hosted runtime assessment.

- **Patched:** [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), Next SVG image optimization RCE. The existing sharp 0.35.5 override already met the documented workaround; Next 16.4.1 additionally removes the vulnerable framework version. No `next/image` use was found in the scanned application.
- **Patched:** [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr), Next Cache Components typed-array RCE. No application `use cache` directive was found. Absence of the identified feature reduces applicability; the framework was patched regardless.
- **Patched:** [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), Next Server Actions DoS. No application `use server` directive was found. The [official Next 16.4.1 security release](https://github.com/vercel/next.js/releases/tag/v16.4.1) identifies the three fixes.
- **Patched:** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), Zod oversized-collection memory exhaustion. Existing bounded account arrays and HTTP request limits reduce the inspected exposure, but were not treated as a substitute for 4.6.6. Zod is a direct runtime dependency and is also shared with validation/AI-related packages.
- **Unresolved:** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch glob amplification, affected >=7.0.0 <11.0.1. The path is `eslint-config-next → typescript-eslint → @typescript-eslint/typescript-estree → minimatch 10.2.6`. Its parent requests `^10.2.2`; patched [11.0.1](https://github.com/isaacs/minimatch/releases/tag/v11.0.1) is outside that supported major. Registry metadata for newer typescript-estree 8.72.1 still requests the same 10.x range. No request-facing attacker-controlled glob consumer or use of `optimizationLevel >= 2` was identified in the scanned application. This is a development-tool risk, not a demonstrated application exploit.

The eight remaining entries are minimatch and affected TypeScript-ESLint/Next lint dependants. npm suggests a cross-major downgrade to eslint-config-next 15.5.29; that was rejected. No blind `npm audit fix`, `--force`, warning suppression or unsupported minimatch override was used. Resolving the remainder needs a compatible upstream parent fix or a separately approved lint-tool major migration with its own review and regression. Keep AUD-03 open for that decision.

Installation also reported that ESLint 9.39.5 is no longer supported. It still lints successfully; a move to a supported ESLint major is a separate compatibility review, not silently included in this minimum patch.

## Isolated execution and evidence

QA: `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, browser `http://127.0.0.1:3104`, local Supabase API `http://127.0.0.1:54321`. Existing local-only QA environment files were retained; no root environment file was copied. Dependencies were installed **inside QA** with the lockfile. QA server, installation and test child processes used an OS-variable allowlist. The controlled QA launcher wraps the existing simulator launcher without changing it; AUD-04 is not repaired here. Source/script comparison found 172 files and zero QA mismatches. The local database still records 35 migrations.

Private, Git-ignored evidence: `.local/schovera-manual-demo/aud03-20261109/`. This contains before/candidate/production audit JSON, original package/lock snapshots, preservation hashes, command logs and the execution ledger. Logs redact known local test keys/passwords. Evidence never deliberately reads or compares production secrets. Registry/advisory/dependency downloads are expected external requests; browser/backend tests stay local. The isolated build's limited font proxy is not an operating-system network sandbox.

Preparation commands: `npm audit --json --fetch-retries=0 --fetch-timeout=30000` (before: exit 1); `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-offline` in the owned candidate directory (exit 0); `npm ci --no-audit --no-fund` inside QA (exit 0, 478 packages); and `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=30000` (exit 0). The candidate changed only the expected Next family and Zod versions before being copied to the repository and QA.

Preliminary inspection errors are retained: the first protected-school read raced the dependency replacement and failed module resolution before querying data; it succeeded after installation and established a fresh pre-test baseline. An initial version probe used a package's non-exported `package.json` subpath, and a QA comparison incorrectly expected the documentation file to be copied; corrected filesystem probes verified installed versions and all eight executable AUD-01 copies. A shell quoting error while editing the ignored evidence runner made no change; the edit was then applied directly. None of these issues changed product code, test assertions or data.

## Executed regression results

**23 recorded acceptance executions: 21 PASS, 2 FAIL.** The two failed executions are the expected non-green all-dependency audit and the first reconnect attempt; they remain in the ledger. Preparation/inspection commands above are separate. All dates below are 9 November 2026 UTC; add 05:30 for IST. Commands use QA except the root isolated build. The private ledger also retains end times and working directories.

| # | Command | Start (UTC) | Exit | Result | Evidence log |
|---:|---|---|---:|---|---|
| 1 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 13:54:37.246 | 0 | PASS | `01-units.log` |
| 2 | `npm run typecheck` | 13:55:12.080 | 0 | PASS | `02-typecheck.log` |
| 3 | `npm run lint` | 13:55:21.229 | 0 | PASS | `03-lint.log` |
| 4 | `npm run verify:role-navigation` | 13:55:26.782 | 0 | PASS | `05-verify-role-navigation.log` |
| 5 | `npm audit --json --fetch-retries=0 --fetch-timeout=30000` | 13:55:40.476 | 1 | FAIL | `04-audit-dependencies.log` |
| 6 | `npm run verify:attendance` | 13:55:52.237 | 0 | PASS | `06-verify-attendance.log` |
| 7 | `npm run verify:assignments` | 13:55:54.027 | 0 | PASS | `07-verify-assignments.log` |
| 8 | `npm run verify:corrections` | 13:55:55.093 | 0 | PASS | `08-verify-corrections.log` |
| 9 | `npm run verify:phase1` | 13:56:08.589 | 0 | PASS | `09-verify-phase1.log` |
| 10 | `npm run verify:principal-communication` | 13:56:21.722 | 0 | PASS | `10-verify-principal-communication.log` |
| 11 | `npm run verify:final-journeys` | 13:56:43.749 | 0 | PASS | `11-verify-final-journeys.log` |
| 12 | `npm run verify:reconnect` | 13:57:20.515 | 1 | FAIL | `12-verify-reconnect.log` |
| 13 | `npm run test:rfid:integration` | 13:57:50.526 | 0 | PASS | `13-test-rfid-integration.log` |
| 14 | `npm run test:gateway:local-integration` | 13:57:54.585 | 0 | PASS | `14-test-gateway-local-integration.log` |
| 15 | `npm run test:translations:db` | 13:58:16.333 | 0 | PASS | `15-test-translations-db.log` |
| 16 | `npm run verify:simple-voice` | 13:58:18.528 | 0 | PASS | `16-verify-simple-voice.log` |
| 17 | `npm run verify:communication-local` | 13:58:36.456 | 0 | PASS | `17-verify-communication-local.log` |
| 18 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 13:59:09.184 | 0 | PASS | `18-voice-all.log` |
| 19 | `npm run verify:role-visuals` | 14:00:00.370 | 0 | PASS | `19-verify-role-visuals.log` |
| 20 | `npm run verify:accessibility-i18n` | 14:00:19.383 | 0 | PASS | `20-verify-accessibility-i18n.log` |
| 21 | `npm run build:isolated -- --working-tree` | 14:00:25.976 | 0 | PASS | `23-build-isolated.log` |
| 22 | `npm run verify:reconnect` | 14:00:45.997 | 0 | PASS | `21-verify-reconnect.log` |
| 23 | `node --env-file=.env.test.local .local/aud03-20261109/preserve-school.mjs` | 14:01:19.264 | 0 | PASS | `22-preserve-school.log` |

- **Units/components:** 306 tests in 35 files passed. This includes the RFID, gateway and attribution unit subsets; they are not counted again as independent tests.
- **Integration:** two Vitest scenario tests passed, RFID v2 and gateway-to-local-Supabase. Separate script acceptance passed attendance save/update/RLS, homework create/retry/conflict/visibility, correction chains, Realtime communication, acknowledgements and translation approval/original preservation.
- **AUD-01:** boundary sizes 0, 1, 999, 1,000, 1,001, 1,002 and 2,005 passed, including SQL/JavaScript/UI agreement, mixed acknowledgements, multi-level corrections, full keyset traversal, school/role denial and failure recovery. Nine original file hashes are unchanged; the eight executable QA copies match. The migration and package script are preserved.
- **Browser:** all three portals passed navigation, refresh/session/role isolation and account switching; the connected journey passed Teacher attendance/send, Principal translation review/approval, Parent acknowledgement and translated media, homework/profile/timetable, and RFID offline/restart/replay. Layout checks passed 23 destinations at 1440, 1024, 768 and 390px, plus the existing accessibility/i18n check. This does not certify every possible control/data state.
- **Reconnect failure and rerun:** the first run timed out after 20 seconds at line 341 waiting for the new update in an online second Parent context. Parent offline recovery and Teacher missed-ack recovery had already passed. The exact unchanged command subsequently passed the complete suite, including second-tab acknowledgement, logout/channel teardown, flapping, multi-child/stale-context isolation, Principal totals and persisted attendance/homework/timetable recovery. No application/test fix or timeout adjustment was made. The timing/subscription cause is **unconfirmed**; the passing rerun does not erase the initial failure. An additional guarded query verified the failed run's suffix absent from updates/students/classes after cleanup.
- **Voice/translation:** actual local automatic Hindi/Marathi/Korean translation retained the tested facts and originals; real WAV output passed for en/hi/mr/ko. Parent/Teacher browser playback, Pause/Resume/Stop, fixed geometry and navigation stop passed. Ten installed native voice samples passed locale/text/start/end checks. No fluent pronunciation or physical-speaker acceptance is claimed. Ollama was initially stopped, started locally for these checks, and the owned service was stopped afterward. No model was installed and no cloud model/provider was used.
- **Build:** Next **16.4.1** compiled, completed TypeScript and generated all expected routes. Only generated `.env.production` was discovered; private sentinels were absent, loopback configuration passed and only the two allowlisted Google Fonts hosts were observed through the proxy. Source fingerprint: `75d14610ec2fd3cc9e6cc6ce380e96b960b04681473b81ca9e9b9ef1bb7b123d`, 174 approved files. Unchanged-source verification and exact temporary-snapshot cleanup passed. This is an uncommitted working-tree build.
- **Data/cleanup:** all 20 protected-school dataset hashes remain unchanged; 35 migrations remain recorded. Owned AUD-01 and connected-journey fixture cleanup was verified; translation/communication suites reported their scoped cleanup and the failed reconnect fixture was independently checked. The owned QA server and Ollama process trees were identity-checked and stopped, restoring their initial stopped state; Docker was left running as found. The existing QA checkout and generated evidence/screenshots were retained, not recursively removed.

The validated local competition workflows remain functional in the **updated QA installation**, subject to the existing presentation/audio/hardware limits. Other checkouts/processes still need this lockfile installed before they use the patched dependencies.

## Remaining limits and handoff

This patch does not resolve the general attendance/notice durable offline-to-cloud gap, local launcher credential inheritance, auxiliary service health, hosted account/RFID/AI/speech architecture, hardware acceptance, or manual language/audio review. Browser playback and nonzero WAV output cannot certify pronunciation or that a listener heard the correct sentence. Do not remove loopback guards or claim public deployment readiness from a passing local build.

AUD-03 remains **PARTIALLY FIXED** until the eight moderate lint-tool entries have a supported, reviewed remediation. No public deployment was attempted.

## Final Git status

No staged changes; HEAD unchanged. `package.json` contains both the pre-existing AUD-01 script and the three AUD-03 dependency specifications. The application/SQL/test changes below predate AUD-03 and are retained exactly.

```text
 M package-lock.json
 M package.json
 M src/components/schovera-app.tsx
 M src/lib/ui-copy-extra.mjs
?? CLAUDE.md
?? docs/54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md
?? docs/55_AUD03_DEPENDENCY_SECURITY_REMEDIATION.md
?? local-dev.err
?? local-dev.out
?? review/
?? scripts/verify-principal-communication.mjs
?? src/lib/principal-communication.test.ts
?? src/lib/principal-communication.ts
?? src/lib/use-principal-communication.test.tsx
?? src/lib/use-principal-communication.ts
?? supabase/migrations/20261109100000_principal_communication_summary.sql
```
