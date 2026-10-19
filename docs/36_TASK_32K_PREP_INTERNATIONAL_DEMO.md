# Task 32K-PREP — International demonstration readiness

**Scope:** a synthetic, local software demonstration guide for Robotex International 2026. It does not authorize a school pilot, real student records, RFID hardware, hosted ingestion, or production deployment.

**Starting point:** `baa18ceedb1847c374af4f809094b8fb2f922d04` on `fix/task32jsec-dependency-security`. Preparation is isolated on `feat/task32k-prep-demo-readiness`.

## What can be shown honestly

| Demonstration | Status and evidence boundary |
|---|---|
| Teacher-to-family communication and Important acknowledgement | Implemented. `npm test` (`verify:phase1`) creates a temporary synthetic Teacher/Parent/Principal scenario, persists an Important update, acknowledges it as Parent, verifies the single acknowledgement and role visibility, then cleans its records. It tests application/database behavior; it is not a human-operated stage UI walkthrough. |
| Parent multi-child context | Implemented. Role-navigation and Task 32H browser integration cover linked/unlinked child access and child switching with synthetic accounts. |
| Parent voice controls | Implemented UI controls for Listen/Pause/Resume/Stop, selected-language matching and visible fallback. Automated unit/browser tests mock speech and verify controls, not audible speech. |
| School-entry records | Implemented as a role-scoped read-only panel. Parent sees selected linked child, Teacher assigned classes, Principal same school. It is not classroom attendance, proof of physical presence, or a safety indicator. |
| Automatic refresh | Implemented bounded 20-second foreground/online polling with backoff, pause while hidden/offline, and RLS-filtered refetch. The local integration suite uses controlled browser clocks to prove new rows arrive once on already-open role dashboards. No Realtime event publication is enabled. |
| Durable offline queue and local v2 sync | Implemented simulator-only. The local integration suite commits a synthetic event to SQLite, simulates offline sync, closes/reopens the database and confirms it remains pending, then synchronizes to local Supabase after restoring local API connectivity. This is not physical power-loss or Pi evidence. |
| Duplicate and revocation safety | Implemented locally: exact retry is idempotent; changed payload conflicts; delayed event for a revoked assignment becomes unresolved and is not exposed as a named row or reassigned to another student. |
| Hardware and school pilot | **Not implemented/tested.** No RC522, ESP32/UNO, Raspberry Pi, electrical/RF behavior, key custody on hardware, real-student pilot, school consent, or hosted synchronization has been validated. |

The local integration suite is the repeatable full synthetic RFID walkthrough, including role dashboards and polling. `verify:phase1` is the synthetic communication/acknowledgement walkthrough. `verify:parent-voice` verifies browser controls with a mock engine and requires seeded local demo data. The project does not currently provide one live, human-paced browser session that runs all of these scenarios together. Do not describe separate automated checks as one physical end-to-end deployment.

## Safe local setup (Windows PowerShell)

Never use `.env.local` for this demo. This repository's `.env.local` is a hosted configuration and remains untouched. The guarded RFID launcher refuses to start in a checkout containing `.env.local`; use a disposable Git worktree, which also separates the gateway database and synthetic signing key from any existing developer data.

First confirm the local tools and Supabase instance. `supabase status` can print local keys, so inspect it privately and never paste its raw output into chat, screenshots, or logs.

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
node --version                         # gateway needs v22.13+, project supports <23
docker info --format '{{.ServerVersion}}'
npx supabase --version
npx supabase status                    # private output; verify URLs are 127.0.0.1/localhost only
npx supabase migration list --local    # local target only
```

If the local stack is not running, use the documented loopback-bound network setup in [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md), then `npx supabase start --network-id schovera-local`. Do not run `supabase link`, remote `db push`, or a database reset. A stopped optional Supabase service is not automatically a blocker; the API and database must be healthy and every migration must be applied locally.

Create a clean, disposable worktree from the reviewed Task 32K commit. This does not copy `.env.local`, ignored environment files, untracked files, local databases, or private signing keys. It does not modify the existing checkout:

```powershell
$demoRoot = Join-Path $env:TEMP ('schovera-task32k-' + [guid]::NewGuid().ToString('N'))
git worktree add --detach $demoRoot HEAD
Push-Location $demoRoot
npm ci --offline
node .\scripts\configure-local-supabase-env.mjs
git check-ignore .env.development.local .env.test.local
npm run rfid:capability-key:init
Write-Output "DEMO_ROOT=$demoRoot"
npm run dev:rfid-local
```

Keep that first PowerShell window open. The env generator reads local Supabase CLI status, validates loopback, refuses to overwrite files, writes ignored `.env.development.local` and `.env.test.local`, and never prints key values. The issuer command generates a synthetic local signing key under the worktree's ignored `.local` directory; it prints only the public key. The server must start after that key exists. The server binds to `127.0.0.1` and refuses `.env.local`.

Open a second PowerShell window at the same `$demoRoot` (copy the path printed by `Write-Output $demoRoot`, not a secret), then run:

```powershell
Set-Location $demoRoot
npm test
npm run test:rfid:integration
npm run test:gateway:local-integration
```

The first command exercises Important communication, Parent acknowledgement, role visibility and cleanup. The v2 integration command exercises local API and database policy with temporary synthetic records. The gateway browser integration exercises offline durable persistence/reopen, local sync, revocation-to-unresolved behavior, retry/deduplication, Parent/Teacher/Principal authorization and automatic refresh; it verifies its temporary database/auth records are removed in cleanup. The browser tests block non-loopback destinations. They do not use Vercel or hosted Supabase.

For the mocked Parent speech-controls browser test, it needs the deterministic local demo Parent/notice fixture. On a fresh/disposable local database only, run `npm run seed:demo` once before `npm run verify:parent-voice`. The seed creates persistent synthetic demo rows and is not part of temporary integration cleanup. Do not run it against a local database whose existing contents you need to preserve; do not run `npm run clean:demo` as casual cleanup because it removes demo fixtures. The automated speech engine is mocked and this check does not demonstrate audible playback.

When finished, stop the Next server with Ctrl+C. A generated worktree contains synthetic issuer key files and environment files; remove only the exact disposable worktree you created, after confirming the resolved path is under `$env:TEMP` and begins with `schovera-task32k-`:

```powershell
$resolvedDemoRoot = (Resolve-Path -LiteralPath $demoRoot).Path
$tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
if (-not $resolvedDemoRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $resolvedDemoRoot).StartsWith('schovera-task32k-', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing cleanup: the path is not the generated Schovera demo worktree under TEMP.'
}
Pop-Location
git -C 'D:\Notes\Degree\Projects\Schovera' worktree remove --force $resolvedDemoRoot
```

This cleanup removes that exact disposable worktree (including its generated local env/key files), not the shared local Supabase database or any other worktree. Keep or delete the local Docker database only through a separate, deliberate local-only decision.

## Preflight checklist

Before inviting judges, run these checks and stop on any failure. No check should silently fall back to a hosted service.

1. **Node/Docker:** Node is at least 22.13 and below 23; `docker info` succeeds.
2. **Local Supabase:** status shows only loopback endpoints; API and database are running; `npx supabase migration list --local` shows every repository migration applied. The local Supabase CLI status includes credentials—keep the output private.
3. **Environment isolation:** demonstration runs only inside the disposable worktree, `.env.local` is absent there, and both generated local env files are ignored. Do not open or copy the main checkout's `.env.local`.
4. **Issuer key:** the disposable worktree contains both ignored capability key files, created before starting the local RFID server. Never copy a real or developer key.
5. **App:** `npm run dev:rfid-local` reports a loopback-only server at `127.0.0.1`; root page loads locally. Never use tunnels, LAN bind addresses, port forwarding, or a public URL.
6. **SQLite gateway:** the local integration suite uses a fresh temporary SQLite database and verifies pending state across close/reopen. The ordinary `npm run gateway:status` reports the developer's retained queue; do not reuse, reset, or delete it for this demo.
7. **Browser:** Playwright Chromium is installed (`npx playwright install chromium` only if needed). The integration browser blocks external destinations and must report no non-loopback requests.
8. **Speech voices:** inspect the actual presentation browser/device using the manual guide below. Headless Chromium can have zero installed voices; a passing mocked test is not evidence of audible audio.
9. **Cleanup:** integration cleanup assertions pass; the disposable worktree is removed using the path check above. Never reset Supabase as a test cleanup shortcut.

The integration tests assert loopback target URLs and local test mode before database writes. They create uniquely named synthetic schools, profiles, students, credentials and devices; test-owned records are cleaned in `finally` with cleanup verification. If a test process is forcibly killed, do not assume cleanup ran—inspect only the local test DB using its guarded local tooling and follow the test's printed cleanup diagnostics. Do not run cleanup against production.

## Two-presenter outline

Use placeholders until presenters confirm names. Keep the demonstration under four minutes; show only synthetic data and identify all simulated hardware clearly.

**Presenter 1 — the school-family problem:** “Families can miss a message when updates are spread across notebooks, calls and apps. Schovera brings school notices and child updates into one role-specific workspace. The Parent can switch only among linked children. An Important notice asks for an acknowledgement, so staff can see that the message was acknowledged—not assume that it was read or understood.” Show a synthetic Teacher Important update and the Parent acknowledgement using the verified local UI or state that this part is automated integration evidence if no seeded interactive account is prepared.

**Presenter 2 — access and inclusion:** “Parents can choose Listen, Pause, Resume or Stop. The words on screen remain the original message. The browser needs a suitable installed language voice; this is playback, not translation.” Show English, Hindi and Marathi controls only when the actual voice is available. If Marathi is unavailable, show the visible fallback and say so plainly.

**Presenter 1 — offline concept:** “The RFID portion is a software simulation, not a reader. A synthetic scan is committed to a local SQLite queue first. While cloud sync is unavailable, it remains pending. After restarting the gateway process, the same event is still there. When local connectivity returns, it synchronizes to our isolated local Supabase and the Parent, Teacher and Principal dashboards refresh from their own authorized queries.” Use the test evidence; do not imply a Raspberry Pi, cloud service, or physical gate was involved.

**Presenter 2 — safety boundary:** “A scan record only means a registered simulator submitted a scan-shaped event. It does not prove a child personally tapped, arrived safely, or was marked present. If a credential is revoked before a delayed event arrives, the system leaves it unresolved instead of guessing the new owner. Classroom attendance remains separate.”

Close with the future-work boundary: “A school pilot would need school authorization and consent, privacy/retention approval, hardware and electrical testing, secure device enrollment, and a separately reviewed hosted service. Those are not being claimed today.” Do not invent adoption, accuracy, time saved, impact, or pilot results.

## Manual Parent voice test (actual presentation device)

Automated tests use fake voices. Do this on the laptop/browser that will be used in the presentation, with synthetic sample text only:

1. Open the operating system's speech/accessibility settings and confirm installed English (`en-*`), Hindi (`hi-*`) and Marathi (`mr-*`) voices. Browser support is platform-dependent. If needed, install language speech components through the operating system's official settings before demo day.
2. In the Parent UI, select a sample notice with known language. Auto detection only confidently chooses clear Latin-script English; for Devanagari, explicitly select Hindi or Marathi because the script is shared.
3. Use a short synthetic sample; one suggested phrase per language:
   - English: “This is a synthetic school notice. The library opens at nine.”
   - Hindi: “यह एक नमूना स्कूल सूचना है। पुस्तकालय नौ बजे खुलता है।”
   - Marathi: “ही नमुना शाळेची सूचना आहे. वाचनालय नऊ वाजता उघडते.”
4. Press Listen and confirm sound begins before the UI says it is reading. Pause mid-sentence, wait, Resume, and Stop. Start another notice and verify it cancels the prior speech. Confirm the visible source text is unchanged.
5. Record browser/version, OS/version, exact voice name/locale, selected language, whether sound was audible, pronunciation/pause/resume/stop result, and date. Record only synthetic phrases; do not capture a family's message.
6. If no Marathi voice exists, show the original text and the honest “voice unavailable” fallback. Do not use an English/Hindi voice as a Marathi substitute or claim Marathi audio passed. There is no automatic translation or hosted TTS service.

## Recovery and stop conditions

- **Docker/Supabase unavailable or migration pending:** stop the demo; diagnose local Docker/CLI only. Do not link to a hosted project or reset a database to save time.
- **Env, URL, or Host guard rejects:** stop and inspect the disposable checkout's local setup. Never weaken the guard or use `.env.local`.
- **Issuer key absent:** create a new synthetic key in the disposable worktree, then restart the local app. Do not move key material between checkouts.
- **Queue remains pending after restore:** preserve its SQLite file and diagnostic state; do not delete it to make the demonstration look successful. Retry the local-only integration after diagnosing.
- **Unresolved receipt:** show it as unresolved and explain revocation safety; do not relabel it as arrival/attendance.
- **Voice unavailable or poor:** use visible text and explain device/browser voice availability. Do not claim audible validation.
- **Any non-loopback request, external target, unexpected secret/configuration, or unclear student data:** stop immediately. No production or Vercel fallback is permitted.

## Verification record and limitations

The repository already contains verified local tests for these paths. This Task 32K-PREP documentation does not add schema, routes, data, dependencies or hardware. Run the sequence above on the current branch before a live demonstration; record results from that run rather than reusing historical evidence as if it were new.

### Task 32K-PREP run (2026-10-20)

- Baseline `baa18ceedb1847c374af4f809094b8fb2f922d04`; branch `feat/task32k-prep-demo-readiness`. Final runbook commit is recorded in Git history.
- Node `22.18.0`, Docker Engine `27.4.0`, Supabase CLI `2.121.0`. Local API and database were available on loopback; all migrations listed by `migration list --local` were applied. Optional imgproxy, edge-runtime and pooler services were stopped; they were not needed by the checks.
- RFID unit/security tests: passed, 22 tests. Gateway tests: passed, 43 tests. Credential-attribution tests: passed, 20 tests. Polling scheduler tests: passed, 4 tests. Parent voice unit tests: passed, 13 tests. TypeScript and lint passed.
- `npm test` first encountered a transient Realtime subscription preflight timeout. Its independent rerun passed persistence, Important-update acknowledgement, acknowledgement delivery, role/tenant checks and cleanup.
- `npm run test:rfid:integration`: passed with temporary synthetic records and cleanup. `npm run test:gateway:local-integration`: passed the complete offline/reopen/local-sync/revocation/idempotency/RLS/browser-polling sequence; it reported no external browser targets and verified cleanup.
- Student Profile, reconnect, accessibility/i18n, role navigation and role visuals passed. The role visual audit covered 22 destinations at 1440, 1024, 768 and 390 pixels.
- Parent voice browser controls passed at 390 pixels using a mock engine. Headless Chromium exposed the speech APIs but reported **zero installed voice locales**; audible English/Hindi/Marathi playback was not verified.
- `npm run build:isolated`: passed on code-equivalent commit `5d3846e846bc8741f0eae7369abaec9a96e7cf02`, before this verification-record-only documentation edit. It reported only generated `.env.production`, verified expected application/API routes and TypeScript, found no synthetic private-variable sentinels in output, allowed only Google Fonts egress through its loopback proxy, and cleaned its isolated snapshot. This is local compilation evidence, not hosted deployment/security evidence.
- Browser/database verification ran from a disposable detached worktree with generated loopback-only env files and a synthetic issuer key. The server was stopped and the exact temporary worktree removed. Test-owned synthetic DB records were cleaned. Existing shared local demo fixtures, local Supabase data, pre-existing gateway queue and `.env.local` were preserved; `.env.local` was not opened, loaded, copied or modified. No Supabase production or Vercel request was made.
- Generated visual screenshots remain under the operating-system temporary directory, outside the repository. No package, schema, route, or production files changed.

The safe isolated build (`npm run build:isolated`) compiles a committed tracked-file snapshot with synthetic local settings, checks routes and secret sentinels, and removes its generated temporary directory. It is local compilation evidence only, not hosted deployment review. The dependency audit history still records an unresolved development-only `braces@3.0.3` advisory; review [Task 32J-SEC](35_TASK_32JSEC_DEPENDENCY_SECURITY.md) and re-audit before release. This preparation does not claim the app is production-secure or competition-validated.

### Manual tasks still required

- [ ] Perform and record audible English, Hindi and Marathi voice testing on the actual presentation laptop; install/select Marathi voice if available.
- [ ] Rehearse the two-presenter script and verify the demo labels simulation accurately.
- [ ] Confirm the local synthetic walkthrough and cleanup on the day of the presentation.
- [ ] Keep physical hardware validation, school authorization/consent, privacy review, hosted security review and any real-student pilot out of this demo; they require separate approval and work.
