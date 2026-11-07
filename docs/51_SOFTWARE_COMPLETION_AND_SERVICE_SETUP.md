# Software completion and service setup

Updated: 7 November 2026. This records local software work and the remaining external setup. It is not a production release certificate.

## What is ready locally

- Three portals: Parent, Teacher and Principal. Existing fixed local accounts/passwords are retained. Manage users is available to the same-school Principal on the guarded local account server.
- Simpler responsive layout, mobile profile menu, recent student sorting, profile/history views and class-wise activity summaries. The current [plum-and-rose palette and fonts](52_PLUM_ROSE_VISUAL_IDENTITY.md) replace the earlier blue styling. There is no teacher ranking. History stays in PostgreSQL and uses the available academic-year metadata.
- English, Hindi and Marathi interface labels for the legacy Teacher/Principal screens, account forms, homework editor and AI studio. Switching interface language does not translate names, subjects entered by staff, homework titles, messages or AI output.
- Parent and Teacher Listen/Pause/Resume/Stop controls. English-script originals start with English selected; ambiguous original languages require a language choice. Approved translated text remains separate from the original. Playback uses the browser's available voices. See the [native voice check, website layout correction and cleanup record](52_PLUM_ROSE_VISUAL_IDENTITY.md#website-layout-and-voice-correction-follow-up) for the latest results and device-language limits.
- Teacher AI uses local Ollama by default. Generated materials remain editable drafts for teacher review; spreadsheet editing is a separate supported workflow. There is no automatic cloud-provider fallback.
- RFID event-v2, durable queue/synchronization, translation approval, fallback simulation and explainable attendance indicators have local synthetic test tooling. Local-only security gates remain in place.

## Test commands

Run browser/database checks only in the existing isolated QA checkout with its local `.env.test.local` and running local Supabase. Never copy the developer `.env.local` into it. Database checks must retain the explicit loopback/test-mode guards. The normal school's records are not test fixtures.

```powershell
# In the isolated QA checkout, after starting Docker and local Supabase:
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run test:ui-copy
npm run verify:staff-localization
npm run verify:accessibility-i18n
npm run verify:role-navigation
npm run verify:simple-voice
npm run verify:accounts
npm run verify:teacher-ai
npm run verify:simple-blue-ui
npm run verify:role-visuals
npm run test:credential-attribution
npm run test:rfid
npm run test:gateway
npm run typecheck
npm run lint
```

The staff localization browser check visits 16 Teacher/Principal destinations in three languages at 1440px and 390px (96 combinations), checks known interface copy, runtime errors and external requests. It does not certify every possible data-dependent state or linguistic quality.

From the developer repository, the safe current-source build command is:

```powershell
npm run build:isolated -- --working-tree
```

It copies approved code/configuration from the current working tree into an owned temporary directory, including new source files. It refuses linked source paths, excludes private environment files/local records/developer artifacts, installs the lockfile offline inside the snapshot, and builds with synthetic loopback values. It prints a source fingerprint and checks that the source did not change during verification. A successful working-tree build is explicitly not a committed release. Omitting `--working-tree` retains the default clean-tracked-state requirement.

Only a generated `.env.production` is allowed in the snapshot; Next must not discover `.env.local`. Checks cover expected routes and synthetic private-secret sentinels in build output. The exact generated temporary directory is removed on completion/failure. Existing Google Fonts build requests may pass through the limited proxy; the proxy is not an operating-system network sandbox. An unavailable offline dependency cache is a setup failure, not permission to load private configuration. This check does not independently audit dependency advisories or hosted runtime security.

## No paid services: integration boundary

The owner selected **no paid services yet**. No provider account, payment method, paid API key, real SMS/IVR submission or external student-data transfer is authorized by this setup. Existing simulated delivery is labelled simulated; it cannot be presented as an actual SMS/call.

### AI

The current supported no-paid option is Ollama on the application laptop. Check it without sending student data:

```powershell
ollama list
Invoke-RestMethod 'http://127.0.0.1:11434/api/tags'
```

Open Teacher → AI studio and request a generic worksheet (for example, Grade 7, Science, Plant cells). Confirm the provider is Ollama, review/edit the draft, and test Copy/Download. Close other heavy applications if the model reports insufficient memory. Check accuracy yourself; generated exam marks/answers are not guaranteed correct.

Online hosting cannot reach this laptop's `127.0.0.1`. Do not expose Ollama or the development server through a public tunnel. A later hosted AI integration needs an explicitly selected/approved inference host, server-side authentication, per-teacher/school quotas, bounded requests/concurrency, privacy/data-retention review, monitoring and a free-tier/cost stop policy. The existing OpenAI branch is opt-in server code, not permission to enable or purchase it. The hosted demonstration flag currently disables live drafting and must not simply be removed to claim readiness.

### SMS / IVR

The existing `FallbackProvider` interface and fake adapter are a tested simulation seam. A real adapter is deliberately not selected. Before implementation:

1. Select a provider and verify that its sandbox/free allowance fits the school; do not assume SMS or voice calls are free.
2. Approve the data-processing arrangement, sender/number registration, supported regions/languages and safe notification templates.
3. Obtain/record guardian contact verification and channel-specific consent/opt-out. Do not treat a Parent login as phone consent.
4. Implement a server-only adapter, a consent/contact data model, idempotent delivery queue and authenticated provider callbacks. Keep phone numbers and provider credentials out of browser bundles and logs.
5. Enforce per-school/day limits, retry caps, a global off switch and a hard cost stop before allowing submissions. A local fake receipt must never be reused as a provider receipt.
6. Test opt-out, duplicate callbacks, timeout-after-acceptance, retries, failures and privacy using provider-approved test recipients. Any actual send needs separate authorization.

Provider-specific secret names and dashboard commands cannot be accurate until a provider is chosen; no fictitious credential template is supplied.

### Hosting, accounts and RFID

The hosting choice is still pending: use separately approved non-production hosting/database projects, or retain the laptop-local setup. No hosted resources were created or changed here.

For an eventual separate online school environment: approve the project/account owner, region, free-tier limits and data policy; create the isolated database/hosting resources; apply reviewed migrations there; disable public signup and configure Auth URL/redirects; provision permanent accounts through a reviewed server-only administrator workflow; keep secrets server-only; and run the tenant/role denial suites plus a preview acceptance test before release. The local account route is intentionally loopback-gated and is not an approved hosted account administrator.

For RFID, do not remove local-only gates or publish raw event rows to make a demonstration look live. Hosted ingestion still needs the reviewed HTTPS/authentication boundary, distributed limits, key rotation/revocation, retention/backup/incident operations and separate acceptance. Real hardware and real-student pilot authorization remain separate.

## Manual final checks

On the presentation laptop, test the actual installed English/Hindi/Marathi voices and audible Pause/Resume/Stop. Ask a fluent speaker to review interface wording and approved message translations. Confirm all three fixed local accounts still work after a normal restart. These human checks and external setup are not replaced by automated browser tests.

Voice-installation follow-up (7 November 2026): Microsoft Hindi and Korean voices and an explicitly approved basic offline Marathi engine are now installed on this laptop. Real Chrome playback through the production speech controller passed for English, Hindi, Korean and Marathi. Korean playback reads original Korean text; it does not add Korean interface localization or automatic translation. Marathi has a more robotic sound and needs fluent-speaker review. See [voice setup, verification and removal commands](52_PLUM_ROSE_VISUAL_IDENTITY.md#completed-device-installation-and-marathi-fallback-7-november-2026). Restart Chrome to refresh available voices. Each presentation laptop needs its own voice installation; copying the project does not copy Windows voices.

## Verification record

Results for this continuation are recorded after the final checks complete below. Earlier failures remain failures of their recorded run; an independent passing rerun does not erase them.

Completed local checks so far:

- UI copy/build-input policy: 7 tests; attribution: 20; RFID: 22; durable gateway: 43. Parent speech and translation component suites also passed.
- Account lifecycle/permission verification, Teacher AI/workbook browser flow, blue UI controls, role navigation, accessibility/i18n and simple voice browser checks passed.
- All 23 role destinations passed the four-width audit. Representative Parent mobile, Principal account-management mobile and Teacher desktop captures were inspected. Further Hindi/Marathi visual review caught English context labels that the first heading/button-only test missed; those were corrected. The expanded staff suite then passed all 96 combinations, including class-status and timetable-class assertions. Hindi Teacher attendance and Marathi Principal timetable captures were reviewed separately.
- Translation approval/original preservation, connected final journeys and reconnect passed together in QA run `1d0e093d-8ed2-4cd2-a6a4-ba8a56fa3f06`. Account/AI/blue UI/visual regression run `7d125e87-ccbe-4624-83eb-05182a9b8659` passed 6/6.
- All three fixed local account sign-ins passed a read-only check on port 3103. The existing school's 20 business-dataset hashes remain unchanged.
- After restarting the stopped Ollama service, the actual Teacher form returned HTTP 200 from `Ollama · gemma3:1b`, with an editable 2,711-character worksheet draft in 19 seconds. It was not published/saved. The earlier stopped-service request returned HTTP 503 and is not a pass.

Initial browser attempts also could not sign in while Docker/Supabase was stopped; after startup, Auth health returned 200 and those checks ran. The first localization verifier falsely flagged an authored homework title that matched a placeholder key; it now excludes explicitly authored title fields. These changes preserve the original content rather than translating it implicitly.

No dependencies or database migrations were added in this continuation. No production environment file was opened or modified, no hosted database was queried or changed, no deployment was performed, and no passwords were rotated. Existing unrelated/untracked work remains preserved. The working tree is uncommitted.

The expanded verifier initially assumed the AI page contained the classroom panel; AI is a separate workspace, so that class-only assertion now applies to the seven classroom destinations while AI retains its heading/control, width and runtime checks. A separate test exposed that runtime `Grade 7A` text needed a single-placeholder dictionary entry; both Hindi/Marathi unit assertions and browser assertions now pass. Failed intermediate runs `8e14542d-c500-4b47-a7e1-8fea3ac18299` and `193910c0-130a-4ea3-b88b-76e44c5dc5f8` remain recorded as 3/4, not fully passing runs. The final direct expanded staff run exited 0. Final typecheck/lint and the 7-test copy/build-policy suite passed after the corrections.

Final current-source isolated build: **passed**, including TypeScript, all expected application routes, generated `.env.production` only, private sentinel scan, unchanged-input verification and temporary-snapshot cleanup. Baseline HEAD is `3ea3225cac05b0e43fa3dc797b17c357b478368f`; the verified uncommitted source fingerprint is `fe31fd6d8e2178641775895be6ace7742714e4c23b90106518370bcfb57de5b4` (158 approved files). Only the two allowlisted Google Fonts hosts were observed through the proxy. This is local compilation evidence, not a new dependency-security audit, hosted deployment test or committed release.

**Remaining external acceptance:** hosting/project choice; approved hosted AI setup if online AI is wanted; provider/consent/limits for actual SMS/IVR; reviewed hosted RFID boundary and physical hardware tests; actual audible voice and fluent-language review. No paid service is active. The updated normal local website runs on `http://127.0.0.1:3103` while its local services remain running; fixed sign-ins are unchanged.

### Sign-in language selector follow-up

The subsequent [plum-and-rose verification record](52_PLUM_ROSE_VISUAL_IDENTITY.md) includes a successful isolated build covering this selector and the new fonts/palette; the earlier fingerprints in this file remain historical.

The sign-in page now has a top bar with Schovera on the left and a blue-bordered, rounded language selector on the right. Its visible label is simply “Language” / “भाषा”; the accessible label retains the full instruction. English, Hindi and Marathi are available before signing in, and the existing preference carries into the portal. Changing language preserves typed sign-in fields. Browser checks passed for all three languages at 1440px, 390px and 320px, plus keyboard selection, reload persistence, touch-target height and absence of runtime errors. Existing Parent/Teacher/Principal sign-ins passed read-only checks. The isolated build fingerprint above predates this small sign-in follow-up; it is historical build evidence, not a build of these additional changes.
