# AUD-04 — RFID local launcher environment isolation

9 November 2026. **AUD-04: FULLY FIXED within the local-launcher scope.** This report covers the laptop-local launcher and synthetic QA only. It does not certify physical RFID hardware, Raspberry Pi operation or public deployment.

## Root cause and change

The original launcher wrote selected local values into `process.env`, removed only the two shell issuer-key fields, and spawned Next.js with `env: process.env`. Unrelated shell credentials, provider selection, public variables, proxy configuration and Node runtime options could therefore enter Next and its workers. The original audit observed credential variable names, not proof of a leaked credential or paid request.

`scripts/dev-rfid-local.mjs` now constructs a separate environment object. It copies only the same eleven OS variables used by the guarded account launcher, adds explicit local configuration, and obtains optional synthetic issuer material from the existing ignored local keypair. It no longer mutates or forwards the complete parent environment. The account launcher itself is unchanged.

The launcher also reuses the account launcher's protection against Next dotenv discovery: only `.env.test.local`, `.env.development.local` and non-loaded `*.example` templates are permitted. The development file may contain only the two approved public Supabase values. The existing `.env.local` existence refusal occurs before any environment-file content read. Matching HTTP loopback URLs/keys and the local test-mode guard remain mandatory.

Arguments are restricted to an optional `--port <1024-65535>`. The bind remains `127.0.0.1`; a later `--hostname` argument can no longer override it. `windowsHide: true` matches the account launcher. No Host/Origin/API authorization check was changed.

## Environment allowlist

| Source / variable names | Purpose |
|---|---|
| Parent: `PATH`, `Path`, `PATHEXT` | Windows command/tool lookup, including case variants |
| Parent: `SystemRoot`, `WINDIR`, `ComSpec` | Windows system binaries and subprocess support |
| Parent: `TEMP`, `TMP` | Node/Next/native tooling temporary storage |
| Parent: `LOCALAPPDATA`, `APPDATA`, `USERPROFILE` | Windows/browser/native tooling user paths |
| Approved local files: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching loopback API/public client configuration |
| Approved test file: `SUPABASE_SERVICE_ROLE_KEY` | Existing guarded server-side synthetic/local API operations; never copied from the shell |
| Fixed: `SCHOVERA_TEST_MODE`, `SCHOVERA_RFID_API_MODE`, `SCHOVERA_FALLBACK_MODE`, `NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE` | Preserve existing local API/simulator gates |
| Fixed: `NEXT_PUBLIC_SCHOVERA_DEMO` | Preserve the launcher's existing public flag and behavior; no UI wording change |
| Fixed: `NEXT_TELEMETRY_DISABLED` | Disable Next telemetry for this local launcher |
| Fixed: `TEACHER_AI_PROVIDER`, `OLLAMA_BASE_URL` | Select Ollama at the existing HTTP loopback endpoint; no shell-selected paid/cloud provider |
| Existing ignored keypair only: `SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY`, `SCHOVERA_RFID_CAPABILITY_KEY_ID` | Preserve optional local v2 capability issuance; missing files leave issuance disabled as before |

No values or credentials are reproduced here. No arbitrary `OPENAI_API_KEY`, `GEMINI_API_KEY`, cloud credential, `NEXT_PUBLIC_*`, `NODE_OPTIONS`, `NODE_PATH`, proxy setting, account-management flag or model override is inherited. The application's existing default local Teacher model and translation model remain in place. Custom shell model/provider/endpoint overrides are deliberately unsupported by this guarded launcher; an extension needs an explicit reviewed local setting rather than broad inheritance.

## Before and after

| Case | Before | After |
|---|---|---|
| Unrelated API key in parent shell | Forwarded to Next | Absent from spawned Next environment |
| Local OS startup paths | Retained through broad inheritance | Retained explicitly, with exact values checked |
| Supabase/service configuration supplied by shell | Known values overwritten, other names retained | Only approved local-file values forwarded |
| Issuer key in shell | Deleted before launch | Never copied; ignored keypair remains sole source |
| Shell-selected AI/provider endpoint | Could be inherited | Explicit loopback Ollama configuration |
| Extra Next env file / development-file private key | Could be discovered by Next | Startup refused without displaying values |
| Hostname override in CLI arguments | Arbitrary arguments forwarded | Rejected; loopback bind preserved |

## Isolation, preservation and files

Repository: `D:\Notes\Degree\Projects\Schovera`; branch `feat/simpler-demo-and-workspaces`; HEAD `aac3a7c77d11518dc0654e3f89381f472943b064`. All existing AUD-01/AUD-03 work was uncommitted and preserved. No staging, commit, reset, clean, stash, push or deployment was performed.

Files introduced or changed by this task:

- `scripts/dev-rfid-local.mjs`: environment construction and startup guards above.
- `scripts/test/rfid-launcher.test.ts`: nine new subprocess/guard tests. Existing test assertions are unchanged.
- `docs/56_AUD04_RFID_LAUNCHER_SECURITY.md`: this report.

No dependency, package script, migration, existing account/password, UI, attendance, communication or general offline-sync implementation changed. Synthetic test accounts are scoped and cleaned by the existing suites. The production `.env.local` was not opened, copied, hashed or modified. Existence/name checks are not reads of its contents.

QA uses `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, its existing approved local-only files, local Supabase API on `127.0.0.1:54321`, and web origin `http://127.0.0.1:3104`. No reset or seed command is used. The QA installation retains Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5. The root package/lockfile are preserved; as documented in AUD-03, other existing installations are not automatically reinstalled or restarted.

Evidence is Git-ignored at `.local/schovera-manual-demo/aud04-20261109/`. Before-file hashes cover the existing tracked/current source. The only existing file intentionally changed by AUD-04 is the RFID launcher. The runner uses the existing local test commands with an OS allowlist and redacts known local test credentials.

## Startup proof and tests

The new unit test copies the actual launcher and guard into an exact owned temporary directory with synthetic files and a small child executable. That child asserts required local values, exact OS-value retention, excluded credential/runtime names, issuer-file provenance and loopback arguments. Failure messages do not dump the environment. Every generated directory is removed in `finally` after checking its parent and generated prefix. The tests also refuse private/unexpected env files, extra development-file credentials, external Supabase and invalid/non-local CLI arguments.

Separately, the **real Next.js 16.4.1 server** was launched first without injected shell credentials, then with harmless API-key/public/runtime/provider/issuer sentinels in its parent. A test-only Node preload observes the actual `spawn` options without changing them, verifies the complete allowlist and required local settings, then calls the real spawn. It writes only names and boolean assertions. Both server starts returned HTTP 200. Baseline/sentinel observations are retained separately; no application endpoint was added for environment inspection. The normal portal/RFID regressions run against the second server, so they exercise the fixed launcher under synthetic shell contamination.

Normal PowerShell startup, **only in the approved QA checkout** with Docker/local Supabase running:

```powershell
Set-Location "$env:TEMP\schovera-qa-41c404875fbe43209c457a7763419c3e"
npm run dev:rfid-local -- --port 3104
```

Do not copy the developer `.env.local` there. This command enables the existing simulator mode; account administration still uses the separate unchanged guarded account launcher. Start local Ollama separately if live drafting/automatic translation is needed. No extra provider credential is required by the RFID launcher.

### Failed attempts retained

- The first typecheck found a missing required `NODE_ENV` property in the **new test's** typed spawn environment. The test now supplies its test process mode; the launcher still excludes inherited `NODE_ENV`, leaving Next to choose its own development mode. Typecheck passed after this test-only type correction. No old assertion was changed.
- The first real-startup **probe** used a Windows absolute path for Node `--import`; Node requires a file URL. It exited before the launcher ran. The ignored probe now uses the URL's `href`; the original error logs remain as `baseline-first.*`, and the unchanged application launcher then started successfully. This was not a product startup defect.
- A preliminary source search used a PowerShell literal glob path and returned a path-syntax error; subsequent directory/glob-filter searches supplied the required source inspection. It changed no files.

## Regression results

**23 recorded executions: 22 PASS, 1 FAIL.** The original new-test typecheck failure is retained; final checks pass. Baseline startup/probe attempts are recorded separately above and in `startup-results.json`. All timestamps below are UTC on 9 November 2026; add 05:30 for IST. Commands run in QA except the root isolated build. The runner sets `SCHOVERA_TEST_URL=http://127.0.0.1:3104`; live AI acceptance additionally sets `VERIFY_TEACHER_AI_LIVE=1`.

| # | Exact command | Start (UTC) | Exit | Result | Evidence log |
|---:|---|---|---:|---|---|
| 1 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 14:07:11.232 | 0 | PASS | `01-units.log` |
| 2 | `npm run typecheck` | 14:07:44.891 | 2 | FAIL | `02-typecheck.log` |
| 3 | `npm run lint` | 14:07:49.004 | 0 | PASS | `03-lint.log` |
| 4 | `npm run typecheck` | 14:08:18.105 | 0 | PASS | `04-typecheck.log` |
| 5 | `node --env-file=.env.test.local .local/aud04-20261109/preserve-school.mjs` | 14:09:02.462 | 0 | PASS | `05-preserve-school.log` |
| 6 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 14:10:15.471 | 0 | PASS | `06-units.log` |
| 7 | `npm run verify:role-navigation` | 14:10:44.334 | 0 | PASS | `08-verify-role-navigation.log` |
| 8 | `npm run typecheck` | 14:10:52.331 | 0 | PASS | `07-typecheck.log` |
| 9 | `npm run lint` | 14:10:58.894 | 0 | PASS | `11-lint.log` |
| 10 | `npm run verify:attendance` | 14:11:13.149 | 0 | PASS | `09-verify-attendance.log` |
| 11 | `npm run verify:assignments` | 14:11:15.551 | 0 | PASS | `10-verify-assignments.log` |
| 12 | `npm run verify:phase1` | 14:11:16.671 | 0 | PASS | `12-verify-phase1.log` |
| 13 | `npm run verify:principal-communication` | 14:11:30.162 | 0 | PASS | `13-verify-principal-communication.log` |
| 14 | `npm run verify:final-journeys` | 14:11:58.102 | 0 | PASS | `14-verify-final-journeys.log` |
| 15 | `npm run test:rfid:integration` | 14:12:42.519 | 0 | PASS | `15-test-rfid-integration.log` |
| 16 | `npm run test:gateway:local-integration` | 14:12:48.534 | 0 | PASS | `16-test-gateway-local-integration.log` |
| 17 | `npm run verify:reconnect` | 14:13:12.188 | 0 | PASS | `17-verify-reconnect.log` |
| 18 | `npm run test:translations:db` | 14:13:40.687 | 0 | PASS | `18-test-translations-db.log` |
| 19 | `npm run verify:teacher-ai` | 14:13:43.444 | 0 | PASS | `19-verify-teacher-ai.log` |
| 20 | `npm run verify:communication-local` | 14:15:21.582 | 0 | PASS | `20-verify-communication-local.log` |
| 21 | `npm run verify:simple-voice` | 14:15:59.613 | 0 | PASS | `21-verify-simple-voice.log` |
| 22 | `npm run build:isolated -- --working-tree` | 14:16:28.630 | 0 | PASS | `22-build-isolated.log` |
| 23 | `node --env-file=.env.test.local .local/aud04-20261109/preserve-school.mjs` | 14:17:47.391 | 0 | PASS | `23-preserve-school.log` |

- **Final units:** 315 tests in 36 files passed, comprising the existing 306 plus nine new launcher tests. Repeated executions are not independent coverage totals. Existing RFID/gateway/attribution unit subsets are included, not counted again.
- **RFID/offline:** both Vitest integration scenarios passed. Actual synthetic v2 submission, signature/capability/revocation/idempotency/nonce/role denial, durable queue persistence, process restart, retry/replay and local synchronization passed. Parent/Teacher/Principal views and unrelated/unlinked denial were verified, with classroom attendance unchanged by gate events. No hardware claim follows.
- **Portals:** navigation/account switching/role denial, Teacher attendance and homework persistence, Teacher-to-Parent communication, Parent acknowledgement, Principal translation review/approval and the connected journey passed. Reconnect passed on its first attempt in this phase. Existing test assertions and UI/application logic were unchanged. The separately guarded account-administration mode was not independently retested or changed here.
- **AUD-01:** 0/1/999/1000/1001/1002/2005 boundary sizes and a 2007-row correction dataset passed SQL/oracle/UI agreement, mixed acknowledgement counts, correction chains, pagination, refresh/error recovery and school isolation. Its migration, implementation, tests, script and documentation hashes remain unchanged.
- **AUD-03:** QA installed versions are Next/eslint-config-next **16.4.1**, Zod **4.6.6**, sharp **0.35.5**. The dependency manifests/lockfile are unchanged from AUD-03. No new dependency audit or upgrade is claimed in this phase; the prior eight moderate lint-tool findings remain open.
- **Ollama/voice/translation:** actual Teacher drafting and four live form types passed with local gemma3:1b, including editable output and workbook edit/export. Invalid/anonymous/Parent requests were rejected. Synthetic shell OpenAI selection did not reach the server. Local automatic Hindi/Marathi/Korean translation and English/Hindi/Marathi/Korean WAV generation passed; Parent/Teacher media controls and original preservation passed. Clipboard branches used a stub; fluent pronunciation and actual speaker acceptance remain manual.
- **Build:** optimized Next 16.4.1 production compilation, TypeScript and all expected application/API routes passed. The snapshot contained only generated `.env.production`; private sentinels were absent, inputs unchanged and the exact owned temporary snapshot removed. Only allowlisted Google Fonts hosts were observed through the limited build proxy. Source fingerprint: `ba2ae36386eb1c4518979d0e60a86db3d597a86132d21229df5561ebe574312f`, 175 approved files, uncommitted working tree.
- **Logs/data/preservation:** final scan found neither injected sentinels nor known approved local service/private-issuer material in retained execution logs. No actual production secret was deliberately read or compared. All **20 protected-school dataset hashes are unchanged**. Owned connected-journey/AUD-01 fixture schools/users and translation fixtures were cleaned and verified by their suites; existing account passwords were not rotated. The local migration count remains **35**. All 173 current executable source/script inputs match QA.

Startup evidence commands were `node .local/schovera-manual-demo/aud04-20261109/launch.mjs baseline` and the same command with `sentinel`. Both returned HTTP 200 readiness and passed the actual-child observation. They were intentionally stopped after use, not reported as naturally exited CLI commands. The owned QA/Ollama process trees were identity-checked and stopped after tests; Docker was left running as found. The existing QA checkout, test captures and ignored audit evidence were retained. Unit-generated exact temporary directories and the production-build snapshot were cleaned.

**Local software presentation: conditionally ready within the tested synthetic/local boundary.** All three tested portal workflows and the RFID simulator/queue remain functional. This closes AUD-04 only; it does not remove the broader hosting, dependency, general offline-sync, hardware or human-acceptance limitations.

## Limitations

The fix constrains the Next child environment of this launcher. It is not an OS sandbox, protection against malicious local code, or proof that an already compromised parent process cannot execute code before the launcher. The approved local env/key files, OS search paths and installed dependencies remain trusted inputs. It does not sanitize other launchers, existing running servers or older copied installations.

AUD-03's eight moderate lint-tool findings remain unresolved; no dependency was upgraded here. AUD-02 general durable attendance/notice-to-cloud synchronization is outside scope. Hosting, hardware, school-network testing, real SMS/IVR and fluent language/audio acceptance remain separate. A successful synthetic local run cannot certify a physical tap, Raspberry Pi storage durability, public deployment security or real recipient delivery.

## Final Git status

HEAD unchanged; nothing staged or committed. All pre-existing changes are preserved except the intentional RFID launcher patch.

```text
 M package-lock.json
 M package.json
 M scripts/dev-rfid-local.mjs
 M src/components/schovera-app.tsx
 M src/lib/ui-copy-extra.mjs
?? CLAUDE.md
?? docs/54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md
?? docs/55_AUD03_DEPENDENCY_SECURITY_REMEDIATION.md
?? docs/56_AUD04_RFID_LAUNCHER_SECURITY.md
?? local-dev.err
?? local-dev.out
?? review/
?? scripts/test/rfid-launcher.test.ts
?? scripts/verify-principal-communication.mjs
?? src/lib/principal-communication.test.ts
?? src/lib/principal-communication.ts
?? src/lib/use-principal-communication.test.tsx
?? src/lib/use-principal-communication.ts
?? supabase/migrations/20261109100000_principal_communication_summary.sql
```
