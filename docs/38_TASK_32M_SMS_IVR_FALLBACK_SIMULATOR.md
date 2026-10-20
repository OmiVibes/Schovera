# Task 32M — Local SMS / IVR fallback simulator

**Boundary:** synthetic, loopback-only demonstration. No SMS, phone calls, real numbers, paid provider, webhook, automatic background telephony, hosted migration or deployment. Simulated delivery is not real delivery, reading, understanding or Parent acknowledgement. This is not a solution for remote delivery during a total internet outage.

Baseline: `01b2ca9020483b2a61374ef527f2432a82341100`; branch `feat/task32m-sms-ivr-fallback`. Existing source notices, translations, acknowledgements, classroom attendance and RFID contracts remain separate.

## Architecture and authorization

One local migration adds `fallback_simulation_preferences` and `fallback_simulation_deliveries`. A server-only local route (`/api/fallback-simulator`) verifies a Bearer Auth token, derives the actor from that token, then calls narrow service-only RPCs. It does not accept actor, school, phone, recipient or message text from the browser. Unknown fields and bodies over 8 KiB are refused. No callback endpoint exists.

The route requires both local-mode flags, loopback request URL/Host, HTTP loopback Supabase and server credentials. The UI additionally requires an explicit local public flag and loopback browser/Supabase. Ordinary development/hosted builds do not enable the UI. Use the isolated simulator launcher, never expose it through a tunnel or LAN listener. The normal development launcher is unchanged and does not supply service credentials.

Parents can SELECT only their own preferences and delivery rows for currently linked children. Teachers can review only their own updates while assigned to the class. Principals can review their school only. Anonymous access and all direct browser writes are denied. A Teacher cannot queue school-wide announcements. RPC execution is denied to anonymous/authenticated roles; only the gated server derives the actor for service RPCs. A service-role administrator remains trusted infrastructure, not a role granted to school operators or browsers.

## Consent and revocation

Each row belongs to one school, Parent, synthetic `SIM-UUID` recipient, channel (`sms` or `ivr`) and purpose (`important_school_notice`). It stores preferred language, explicit opt-in, consent source/time, opt-out time, update time and a consent generation. No phone fields or imports exist. Unconfigured channels are ineligible.

Only the signed-in active Parent can save consent through the route. Staff cannot silently opt in a Parent. The Parent opens **School notices**, checks each desired channel independently, selects a language, and saves. The copy clearly limits consent to a fake demonstration. This is not legal consent for a real provider.

An opt-out blocks subsequent queue eligibility and dispatch. Any consent/language change advances its generation, so opting out and back in cannot revive an old queued record. Source, Parent profile/link, assignment, consent and translation are rechecked on prepare and again under transaction locks before a fake receipt is stored. A change after a dispatch transaction commits cannot undo that past simulation; the next attempt is blocked. No external side effect takes place between those checks.

## Content, queue and audit

Only current Important student updates or Important school announcements can be queued. This is an explicit staff action, not a send-on-publish hook. Eligible channel preferences are counted (not distinct families). A cohort is bounded to 100 eligible channel preferences per source; the review displays at most 200 rows.

At queue time choose the exact current Principal-approved preferred-language translation when available; otherwise choose the immutable original and label the row **Original**. Draft or withdrawn translations never qualify. Store hashes and translation identity, not duplicate notice text. A later correction, original edit, lost link, changed consent or withdrawn/changed translation blocks the old queued version rather than silently substituting content at dispatch. Staff can inspect the existing original/translation controls on that source card before queuing.

There is one stable delivery UUID per source and channel preference. Repeated queuing does not create duplicates, even after failure or re-consent. A new corrected notice is a distinct source; intentional repeat campaigns for the same original are deliberately not supported. Delivery status changes and consent/queue actions use minimal audit metadata, never notice body, names, phone numbers or tokens.

## Pure fake provider and retries

`src/lib/fallback-provider.ts` is a replaceable interface with a deterministic in-process fake implementation. It contains no HTTP/socket/dialling code, dependencies, timers or callbacks. It accepts only `SIM-UUID` recipients. All responses have `label: SIMULATED`; fake references start `SIMULATED-` and are stable hashes of the delivery idempotency key.

| Selected fake scenario | Persisted result |
|---|---|
| Delivered | `delivered`, explicitly not read/acknowledged |
| Accepted/delayed | `accepted`, not delivered; later eligible status check confirms same fake receipt |
| Temporary failure | `retry_wait`; no successful receipt |
| Permanent failure / unreachable / rejection | `failed`, terminal |
| Timeout | `uncertain`; do not claim failure or success; later check confirms same fake receipt |

An operator explicitly triggers each attempt/status check. No scheduler or real retry daemon exists. The database enforces due time: exponential 15/30/60/120/240-second retry delay capped at 300 seconds, 30 seconds for accepted confirmation, maximum five attempts. Exhausted nonterminal results become failed, retaining any uncertain receipt reference. Terminal deliveries are not processed again. Concurrent finish requests use locked state and an expected update version; only one writes the attempt. Delayed/uncertain retries confirm the existing fake receipt, not a second submission. No outcome ever inserts `acknowledgements`.

## Local Windows PowerShell demonstration

Use an exact generated disposable worktree with no private env files. Do not copy or open `.env.local` and do not run a remote Supabase command.

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
$demoDir = Join-Path $env:TEMP ('schovera-task32m-' + [guid]::NewGuid().ToString('N'))
git worktree add --detach $demoDir HEAD
Set-Location $demoDir
npm ci --offline
node scripts/configure-local-supabase-env.mjs
# Confirm local Supabase is already running and configured on loopback.
# Do not paste `supabase status` output: it includes local keys.
npx supabase migration up --local
npm run dev:simulators-local
```

In a second PowerShell window at that same disposable path:

```powershell
npm run test:fallback
npm run test:fallback:integration
```

The integration verifier provisions temporary synthetic accounts/notices, tests all three roles, and cleans its controlled records in `finally`. It does not create persistent logins or touch the seeded natural demo school. For an interactive demonstration use separately seeded **local synthetic accounts only**. Parents set preferences under School notices; Teachers open an Important student's sent update; Principals open Communication or an Important school announcement. Expand **SMS / call simulation**, review eligibility, queue, select a fake scenario, run it and refresh. The UI displays per-status counts, attempts, retry eligibility and fake receipt references. Parent activity history is intentionally omitted; the Parent controls preferences and reads existing notices.

Stop the server you started (Ctrl+C) before cleanup. From the original repository, validate that `$demoDir` resolves to the exact newly generated `schovera-task32m-*` directory under the OS temporary directory, then use `git worktree remove --force $demoDir` on **that worktree only**. Never target the repository, home directory, a shared temp root or a user-owned pre-existing path.

## Verification

`test:fallback` covers pure provider scenarios, stable timeout/delay confirmations, fake-recipient validation, no fetch calls, and production-target refusal. `test:fallback:integration` uses the existing loopback/test-mode guard before any client or request. Database-only execution is available with `node --env-file=.env.test.local scripts/verify-fallback.mjs --database-only`.

The integration verifier tests channel consent/optouts, generation invalidation, actor/RLS boundaries, approved/current translation and original fallback, lost links, source corrections, Teacher assignment expiry, Important announcements, queue/concurrent receipt deduplication, retry bounds and provider outcomes. Browser checks cover Parent preference saves, keyboard checkbox activation, English/Hindi/Marathi, Teacher queue/dispatch, Principal review and 390px overflow; non-loopback browser requests are blocked and recorded. It checks that service credentials are absent from downloaded browser scripts without printing their value, and verifies no false acknowledgement/attendance/RFID rows. Synthetic records are removed and cleanup checked.

### Recorded local verification — 2026-10-20

| Check | Result |
|---|---|
| Local migration and `supabase db lint --local` | Applied successfully to loopback Supabase; no schema lint errors. No reset or hosted operation. |
| `test:fallback` | 10 passed. |
| `test:fallback:integration` | Complete DB, HTTP and Parent/Teacher/Principal browser flow passed repeatedly, including final translated-heading assertions, contrast and cleanup. |
| `test:translations`, `test:parent-voice`, `test:entry-polling` | 2, 13 and 4 passed respectively. |
| `test:rfid`, `test:gateway`, `test:credential-attribution` | 22, 43 and 20 passed respectively. The 43 gateway tests include Node's existing experimental SQLite warning. |
| `test:translations:db` and `test:translations:integration` | Passed, including approved translated text used by mocked browser speech, original preservation and approval invalidation. |
| `test:rfid:integration`, `test:gateway:local-integration` | Both passed with isolated synthetic records. |
| `verify:parent-voice` | Passed at 390px. Browser API present but zero real voice locales; actual audible playback was not tested. |
| `verify:accessibility-i18n`, `verify:role-navigation`, `verify:student-profile` | Passed. |
| `verify:role-visuals` | Passed all 22 destinations at 1440, 1024, 768 and 390px. Separate expanded fallback-panel captures were inspected. |
| `verify:reconnect` | Initial run failed at the previously recorded final Teacher timetable-loading assertion, after earlier recovery scenarios passed. Independent rerun passed the complete suite. This existing timing flake is not claimed fixed by Task 32M. |
| `typecheck`, `lint`, `git diff --check` | Passed on the implementation; final lint/diff verification repeated after test improvements. |
| `build:isolated` | Passed at source commit `6a6120899102668acce95c9f1658293bd14dd8e2`; production compilation, TypeScript, static generation and expected route manifest all passed. |

An early database-test fixture attempted to change translation status without clearing approval metadata, violating its existing constraint; the test now uses the actual translation-save RPC to withdraw approval. Initial browser assertions used Node fetch for a forged Host (normalized by fetch) and exact status text mixed with attempt text; these harness issues were corrected with raw loopback HTTP and a distinct visible status span, then the full suite passed. Visual review found an inherited hover color that reduced Parent save-button contrast; scoped button styling and a computed minimum 4.5:1 hover-contrast assertion now pass.

The isolated build discovered **only generated `.env.production`**, verified expected routes including the disabled-by-default local simulator route, found no synthetic private sentinels in output, and cleaned its temporary snapshot. Only the existing Google Fonts build hosts were observed through the allowlisted proxy (`fonts.googleapis.com`, `fonts.gstatic.com`); this is not an OS-level network sandbox or a claim of zero external font traffic. No hosted Supabase, Vercel, SMS or voice provider was contacted. The browser harness blocked/recorded non-loopback destinations and passed with none attempted; local service credentials were absent from downloaded browser scripts.

Synthetic fallback fixtures were removed and absence verified after success and earlier failures. The loopback test server was stopped; its exact generated disposable worktree, ignored local env files and synthetic issuer key were removed after validating the temp path. Privacy-safe synthetic screenshots remain in OS temporary directories, not the repository. The original checkout's `.env.local` was never opened, copied, loaded or modified. Protected pre-existing untracked `AGENTS.md`, `CLAUDE.md`, `local-dev.err`, `local-dev.out` and `review/` were preserved. No new dependency, hosted schema/configuration, real family data, production write, push, merge to main or deployment was involved.

### Changed files

- `supabase/migrations/20261020120000_add_local_fallback_simulator.sql`: local consent, queue, authorization and audit model.
- `src/lib/fallback-provider.ts`, `src/lib/fallback-server.ts`, `src/lib/fallback-provider.test.ts`: pure fake adapter, server gate and focused tests.
- `src/app/api/fallback-simulator/route.ts`: gated authenticated local orchestration, no webhook/provider transport.
- `src/components/fallback-simulator.tsx`, `src/components/schovera-app.tsx`, `src/app/globals.css`, `src/lib/i18n.ts`: role controls, integration, responsive/contrast styling and three-language UI.
- `scripts/verify-fallback.mjs`: controlled synthetic DB/HTTP/browser acceptance and cleanup.
- `scripts/dev-rfid-local.mjs`, `scripts/build-isolated.mjs`, `package.json`: opt-in local launcher flags/alias, expected-route build verification and test scripts.
- `docs/38_TASK_32M_SMS_IVR_FALLBACK_SIMULATOR.md`: setup, evidence, limits and handoff.

## Retention and limitations

Acceptance fixtures are immediately removed; developer demo rows persist only in local Supabase until an explicitly reviewed local cleanup. No automatic retention job or production retention policy is implied. Preferences/deliveries cascade for controlled Parent/source deletion; audit rows require explicit scoped cleanup. Before any longer demo, set a short documented cleanup deadline and do not place real family data here.

Browser automation checks programmatic labels, native controls, keyboard interaction, status text and responsive layout; it is not a screen-reader user study. Translations of UI labels are not approval of free-text notices; only Task 32L's reviewed translations qualify. IVR here simulates a delivery status, not audible generated speech or a real telephone call. Existing browser voice playback is a separate accessibility layer.

A real Indian provider requires a separately authorized task, reviewed school/guardian consent and opt-outs, verified contact ownership, applicable regulatory/provider registration and approved templates, child-data/privacy/legal review, retention, secure credentials, HTTPS, callback authentication/replay protection, shared rate/cost limits, monitoring, provider-side idempotency and reconciliation, and a reviewed deployment/security boundary. Confirm current requirements with the provider and qualified school advisers; no regulatory compliance is claimed here. Never plug a real provider into this local fake route. A real external send introduces an irrevocable side effect and needs a transaction/outbox/reconciliation design beyond this two-phase pure simulation.

Task 32M is complete within the local simulation boundary. Task 32N readiness: **READY for review and a separately scoped local follow-up**; no next task is started. Real SMS/IVR integration remains **BLOCKED** on the approvals and engineering controls above. No real-family communication, hosted ingestion or deployment is authorized by Task 32M.
