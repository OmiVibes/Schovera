# Task 32T — Bound fictional-demo provisioning and lifecycle

Status: local implementation and acceptance in progress. No cloud resources, hosted migrations/accounts, push, merge or deployment have been authorized or performed. Final observed outcomes appear in the execution record below; pending checks are not passes.

Baseline: `f9f2a822da4f9bb31c20bf3b21a891db48b4ceb0`, clean tracked state on `feat/task32s-online-demo-preflight`. Continued on `feat/task32t-hosted-demo-provisioning`. Production remains the owner-reported `https://schovera.vercel.app`; Git remote remains `https://github.com/OmiVibes/Schovera.git`. Actual production database/Vercel IDs have not been obtained from secrets or independently verified. Those non-secret dashboard identities remain an owner approval gate.

## What is implemented

`scripts/online-demo/cli.mjs` is an operator-only CLI, not a browser/API administrator. `adapter.mjs` implements Supabase Auth administration and exact-row database provisioning, verification, rotation, disablement and cleanup. `target.mjs` checks target identity and bounds network destinations. The older Task 32S `provisioning.mjs` remains its historical offline proof, not the implementation used by this CLI.

The reviewed, UTF-8 fictional bundle is tracked at `scripts/online-demo/fixtures/fictional-campus.json`. Its parsed dataset digest is `ac5db776b7d53974693a10cd888d69ae619ac90b5b35fb7597e9e365676ccb2a`. It contains logical identifiers, not exported Auth IDs, passwords, device keys, capability tokens or real families. The adapter binds the digest to the independently approved manifest before even returning a dry-run. Changing notice content requires another deliberate dataset review/approval, not silent adoption.

The fixture contains one fictional campus, 20 students, 7A/7B with ten students each, one Principal, two Teachers, ten guardians with two linked children each, 200 historical attendance rows, six homework assignments, 36 periods, communication/acknowledgements, two announcements, approved-workflow Hindi/Marathi examples, and 20 synthetic entry observations. Maya teaches A/B; Vikram teaches B: two Teachers, **three active assignment relationships**, not two isolated Teacher rows. Dates are deliberately preserved, not silently rebased. Review the historical window and homework due dates before a later event; outdated fixtures require an explicitly reviewed replacement export.

Translation fixtures reproduce a **synthetic approval workflow**, not fluent human review or automatic translation. The original communication and its source hash remain intact. Entry history uses fresh revoked/non-operational device and credential relationships; its generated signing private key is discarded. No public ingestion or functioning reader enrollment is created. SMS/IVR stays the existing honest hosted static illustration, not forged account consent/delivery rows. No real calls or messages occur.

## Identity, secrets and authorization

The operator supplies a private approval file based on [the placeholder template](templates/demo-provisioning-approval.example.json). Independently compare its project ref and origin with the NEW project's dashboard and the owner's production denylist. Record who verified it, evidence reference/date, expiry, the exact dataset digest and SHA-256 fingerprints of the NEW demo keys. Do not obtain production IDs by opening `.env.local`. The file is an operator attestation, **not cryptographic proof that its author owns the project**.

Hosted mode accepts only the exact `https://<approved-ref>.supabase.co` origin, a one-project demo allowlist, nonempty production denylist, and newly generated `sb_secret_` / `sb_publishable_` keys matching the approved fingerprints. Legacy service-role JWTs, wrong fingerprints, unknown hosts and production refs are refused before any request. Opaque keys cannot be identified by prefix alone: trusted operator verification, pinned fingerprints, TLS destination identity and successful project-local Auth/schema checks collectively establish the boundary. A falsified approval or compromised operator workstation is outside that guarantee. Never approve a production key as a demo key.

Local rehearsal is a distinct mode fixed to `http://127.0.0.1:54321` / `local-Schovera`, using CLI-generated local credentials. Existing local-only test guards are not weakened. Requests are restricted to that approval's Auth/PostgREST origin with redirects forbidden and bounded timeouts; there is no arbitrary-project URL option or Management API token. No secret enters Vercel, browser code, arguments or report output. The privileged key is necessary for Auth creation and bootstrap rows; only this standalone operator process receives it. Web hosting continues using the publishable key, RLS and checked RPCs.

Before/after provisioning, the adapter verifies Auth admin access, schema access, anonymous registry denial and the service-only `verify_demo_access_boundary()` RPC. Missing session-policy migrations fail closed. Fresh local integration separately proves role SELECT/RPC boundaries rather than treating a configuration check as RLS proof.

### New session boundary (local migrations only)

- `20261022100000_bound_demo_session_access.sql`: server-tagged demo Auth users must be unbanned, before their server-set expiry, and have a JWT `session_id` still present in `auth.sessions`. Restrictive policies cover the existing RLS tables, including policies directly using `auth.uid()`. Role/school helpers also enforce the boundary for security-definer writes. Existing, non-demo users retain their previous authorization behavior.
- `20261022101500_verify_demo_access_boundary.sql`: privileged read-only schema preflight. Anonymous/authenticated users cannot execute it. No public administration endpoint is added.

Global sign-out deletes sessions; an already-issued JWT otherwise remains usable until expiry in many deployments. The added database check addresses that gap specifically for tagged demo accounts. This follows Supabase's documented [session-ID validation model](https://supabase.com/docs/guides/auth/sessions). It is not a new HttpOnly/server-session architecture, and does not revoke knowledge of data already downloaded to a browser. New future RLS tables need the restrictive policy; the preflight refuses provisioning if one is missing. Session-table compatibility/performance must also be checked on the actual approved hosted project.

## Journal, interruption and ownership

The ignored `.local/schovera-hosted-demo/<run-uuid>.json` is a **private credential journal**. It stores generated account passwords, stable logical-to-UUID mappings, expected rows, stage and completed actions. Do not paste, commit or include it in screenshots. Files use mode 0600/directories 0700 where supported; Windows inherits directory ACLs, which the operator must review. This is not an encrypted vault or protection from a compromised administrator.

The journal is committed with file fsync and atomic rename before network mutations. Auth IDs/passwords are recorded **before** create requests; recovery looks up the exact ID and server-only run tag, never adopts an email prefix or regenerates an unknown password. Each database insert uses a stable UUID, reads an existing row before writing, compares partial-state contents, and refuses disagreement. A lost insert response is reconciled from persisted rows. There is no global upsert, truncation or reset. Completed runs verify their required rows and do not recreate a removed fixture.

A per-run exclusive lock prevents concurrent operators. A crash may leave `<run>.json.lock`; it records PID/run/start time. Do not remove it automatically by age. First verify the exact run/path, no matching operator process remains, and the journal is intact; then remove **only that exact lock file** and rerun the identical command. Do not delete the journal or `.next` recovery evidence. Physical power-loss/Windows filesystem durability is not established by injected software failures.

Operational counts are explicitly labelled as journal-manifest counts, not an unverified live database count. `prepare/verify` mark live integrity only after their checks succeed. An interrupted credential operation remains separately visible as `pendingOperation`; another prepare/verify cannot quietly declare that run complete. Resume the same account operation, or use the documented emergency disable/reset path.

Cleanup verifies the UUID/code school ownership, server-only Auth ownership tags, every recorded row's school/actor/class/child scope, and absence of unknown profiles. Browser-created classroom activity is reconciled only beneath that exact school, checked for owned actors/relationships, and captured as explicit deletion IDs before deletion. Unknown actors, cross-school rows, cycles, untracked dependencies or capacity overflow block cleanup. It disables profiles/accounts, deletes exact rows in FK order, removes the owned Auth users and verifies the school is gone. Other schools are not a cleanup target. Pending cleanup can be resumed under its original journal. Archive/purge the private removed journal securely under the operator's retention policy; reports do not print its passwords.

Credential rotation pre-journals the next password, disables the profile, globally signs out its sessions, updates Auth, saves the new credential, then re-enables the profile. A lost Auth response can be retried with the journaled old/next password. Disablement bans the account, rotates away the old password and leaves its profile inactive. Re-enabling a disabled account is not an automatic CLI action. Use a reviewed recovery procedure/new fixture rather than removing the ban in a browser. Approval expiry should extend beyond fixture expiry so scheduled teardown is still authorized; expired/mismatched approval or changed operator key requires reviewed recovery, not bypassing the identity check.

## Windows PowerShell — local acceptance

Use an isolated checkout without `.env.local`, following [safe setup](25_SAFE_SUPABASE_DEVELOPMENT.md). Do not copy the developer environment file. After local Supabase is running on its loopback-only network:

```powershell
npx supabase migration up --local
npm run test:provisioner
npm run test:online-demo
npm run test:provisioner:integration
npm run dev:simulators-local -- --port 3103
```

In another terminal in that same isolated checkout:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3103'
$env:VERIFY_TEACHER_AI_LIVE = '0'
npm run verify:provisioner:browser
npm run verify:task32r
```

The provisioner integration creates its own temporary journals and two synthetic schools; cleanup runs in `finally`. The provisioner browser command provisions another fresh 20-person fixture through the **real adapter**, runs the connected presentation journey and removes its exact fixture. It does not borrow or mutate the retained personal/presentation school. Mocked speech validates controls only: **AUDIO NOT VERIFIED**.

## Windows PowerShell — future approved operator use (NOT executed here)

Run only from a separate sanitized operator checkout. Privately load `SCHOVERA_PROVISION_URL`, `SCHOVERA_PROVISION_SECRET` and `SCHOVERA_PROVISION_PUBLIC` from the approved demo secret store, not `.env.local` or Vercel. The CLI deliberately does not discover dotenv files. Do not type a key into shell history or use a transcript. The approval file contains fingerprints, not the key itself. Example paths/variables below are placeholders, not working cloud configuration:

```powershell
$approval = '.local/schovera-hosted-demo/approved-project.json'
$dataset = 'scripts/online-demo/fixtures/fictional-campus.json'
$run = [guid]::NewGuid().ToString()
$expiry = (Get-Date).ToUniversalTime().AddDays(7).ToString('o')
# $demoRef must be read from the separately verified approval, not guessed.
$demoRef = (Get-Content -LiteralPath $approval -Raw | ConvertFrom-Json).projectRef
npm run demo:online -- prepare --approval $approval --dataset $dataset --run $run --expires $expiry
# Review the dry-run, then only after explicit write authorization:
npm run demo:online -- prepare --approval $approval --dataset $dataset --run $run --expires $expiry --confirm "prepare:${demoRef}:$run"
npm run demo:online -- verify --approval $approval --dataset $dataset --run $run --expires $expiry
npm run demo:online -- list --approval $approval --dataset $dataset --run $run --expires $expiry
npm run demo:online -- report --approval $approval --dataset $dataset --run $run --expires $expiry
```

Use the **same recorded run and exact expiry** for resume/lifecycle commands, not another generated UUID. `list/report` expose only roles/logical account IDs/counts/status, never passwords. Privately hand off the generated journal credentials via an approved channel; do not paste the journal into ChatGPT or the student guide. For one owned logical account, first dry-run by omitting confirmation:

```powershell
$account = 'profiles:REPLACE_WITH_EXACT_OWNED_LOGICAL_NUMBER'
npm run demo:online -- rotate --approval $approval --dataset $dataset --run $run --expires $expiry --account $account
npm run demo:online -- rotate --approval $approval --dataset $dataset --run $run --expires $expiry --account $account --confirm "rotate:${demoRef}:$run"
# Emergency disable: same parameters, operation disable, confirmation disable:<ref>:<run>.
# Scoped cleanup: operation reset, confirmation reset:<ref>:<run>.
# Expired fixture: operation remove-expired, confirmation remove-expired:<ref>:<run>.
```

Reset/remove-expired/disable default to dry-run too. No operation means “reset all schools.” Keep the private journal until deletion verification is complete. These commands are not authorized for a real hosted target by this report.

## Hosted feature contract

| Capability | Eventual protected web-demo contract |
|---|---|
| Three dashboards / 20 profiles | Available through individual role logins, linked children/assigned classes/same school |
| Attendance + correction + Insights | Existing classroom register and explainable recorded patterns; not dropout prediction |
| Homework / author edit / timetable | Available with checked RPCs, author/version/conflict restrictions |
| Important notices / schoolwide notices / acknowledgement | Available; acknowledgement belongs to the original update |
| Teacher translation draft / Principal review / Parent translation + original | Manual workflow; seeded examples explicitly synthetic, no automatic translation guarantee |
| Browser voice | User controlled and device dependent; visible text remains usable; real audible acceptance pending |
| Entry history | Prepared synthetic observations only; not physical presence, safety or classroom attendance |
| Workbook | Existing browser-local basic import/edit/export; not complete Excel fidelity |
| Teacher AI / local Ollama | Disabled online; no laptop tunnel |
| RFID v1/v2 / key/capability issuance / durable gateway sync | Disabled at hosted boundary; no device/issuer/service secrets in Vercel |
| SMS/IVR | Static illustrative panel only; no consent/dispatch operational controls, real call or account delivery-history claim |
| Cloud translation/TTS | Not integrated or approved |
| Public seeding/reset | No browser endpoint; standalone operator tool only |
| Internet outage | No fresh remote-data promise; use labelled recorded/text backup, avoid repeated sends |

## Exact future deployment sequence — separate approval required

1. Owner approves one independent Supabase project and one separate Vercel project, regions/plan/usage limits, operator, expiry, retention and reduced feature contract. Obtain production denylist IDs from non-secret dashboard metadata; do not open production `.env.local`.
2. Create only the NEW Supabase project after that approval. Record dashboard URL/ref and operator verification evidence privately. Create NEW project-local secret/publishable keys; record fingerprints in the reviewed approval file. Never reuse production credentials or an isolated-build synthetic fixture.
3. Use a fresh release/operator checkout of the approved commit with no private env files. Have the owner review all ordered migrations (including the two Task 32T session/preflight migrations) against the verified **empty demo project**. Apply them through an approved migration operator/dashboard tied only to that verified ref, recording each filename/result. No reset, production link or production export. This task supplies no unrestricted remote migration executor; actual hosted schema replay remains a remote acceptance gate.
4. In the new Auth dashboard disable public signup and anonymous sign-in, disable unused providers, set exact HTTPS Site URL/redirect allowlist and review Auth rate limits/JWT lifetime. Hiding signup UI is insufficient; see [Supabase configuration](https://supabase.com/docs/guides/auth/general-configuration). The database demo expiry check does not rely on paid session-duration settings.
5. Run the bound provisioner dry-run, approve its ref/run/digest/expiry, then apply and verify using the commands above. Test raw REST/RPC denials as anonymous, linked/unlinked Parent, assigned/unassigned/non-author Teacher and cross-school Principal. Test rotation, raw old JWT and refresh denial. Verify 20 students, relationships, translations/current hashes, no operational reader/provider and scoped cleanup on a throwaway run before the final presenter fixture.
6. Create the independent Vercel project only after approval. Do not attach this branch to the current production project's automatic deployments. Record its actual project ID and all aliases, preserve the production project untouched, select Node 22 and install the committed lockfile.
7. Set only the hosted allowlist in `docs/templates/demo-online.env.example`, with the verified new Supabase URL/publishable key, matching hosted flags, new app/project identities and production denylists. Enable/verify actual Vercel System Environment Variables. No service, operator, issuer, Ollama, OpenAI or private journal variables/files in any inherited build/runtime scope.
8. Configure protection **before** student access. For students without Vercel accounts, an approved private shareable link can bypass the outer Vercel gate while individual Schovera accounts/RLS still apply. It is a bearer secret, not person-specific identity. Verify quota: [Vercel currently documents one Hobby shareable link per account](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links). Paid [Password Protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection) needs separate budget approval. If no approved option works, stop; never make the demo public as a shortcut.
9. Deploy the approved commit to that protected demo/preview only; record commit/deployment ID and exact real HTTPS URL. Do not promote the current production alias. No URL is invented by this report.
10. Under separate remote-test authorization verify TLS/headers/redirects/Secure cookies, all alias protection, fresh no-Vercel-account access, signup-off, Auth rate limits, project identity, RLS/RPC/session denial, disabled APIs and absence of privileged credentials in delivered bundles/logs. Rehearse the full connected role/translation/ack/classroom flow at 390/768/1024/1440 px on the actual HTTPS deployment. Local interception does not establish this.
11. Rotate individual presenter credentials. Allocate separate existing guardian/Teacher accounts to each student and a named Principal presenter/trainer; do not share the Principal password or simultaneous browser session. If both presenters need Principal concurrently, separately provision/review distinct linked accounts rather than sharing one. Hand off the private access link and individual passwords through separate approved private channels. Test their actual laptops/phones and audible voices; keep text/recorded backup ready.
12. Monitor only privacy-safe counts/status/latency and provider usage; do not record request bodies, tokens, passwords or protection query strings. Verify managed-cloud logging/alerts, quotas/pausing, operator availability and a known-good demo-only code rollback. No success/availability/cost guarantee follows from a free plan.
13. Incident: revoke the leaked share link, disable affected demo accounts using exact journal ownership, revoke keys if exposed, stop access and preserve sanitized evidence. Unknown target identity means stop, not automatic remote cleanup. Reverting Git does not revoke credentials.
14. After the competition, revoke access, perform journal-owned reset/remove-expired with explicit confirmation, verify rows/Auth deletion, securely purge private credentials under retention policy, then delete/pause only the approved new resources after separate owner authorization. Never target production during rollback or teardown.

## Environment and remaining limitations

This task's test/build processes use a separate checkout without `.env.local`; the operator CLI and both local launchers refuse that file's presence without opening it. Vitest has `envDir:false`; synthetic sentinel tests verify disabled discovery. Isolated normal/hosted builds copy only committed allowlisted source, use minimal child environments and generated `.env.production`, scan synthetic private sentinels and remove their exact temporary directories. The build's font proxy is an application allowlist, not an OS firewall.

The original `.env.local` has not been intentionally opened, copied, loaded or modified in Task 32T. This is a workflow observation, not a retroactive filesystem audit: **Task 32S's documented uncertainty about early historical Vite discovery remains**. No actual production-secret values were inspected to investigate that history. No production endpoint or Vercel deployment is used by these acceptance tests.

Managed-cloud identities/settings/protection, fresh hosted migration replay, real HTTPS/mobile access, actual audible voices/fluent translation quality and external provider/hardware/pilot approval remain unverified. The local Docker Vector collector still restarts; core DB/Auth/REST/Realtime work, but this is not healthy logging evidence. No security was disabled to hide that limitation.

## Execution record

Initial local gate: **36/37 commands passed**; `verify:corrections` timed out waiting for its Teacher-to-Parent Realtime preflight. All other commands, including reconnect, two Phase 1 runs, translations, fallback, gateway/RFID, insights, navigation, 22×4 visual audit, final journeys, typecheck and lint passed. This first-run failure is retained, not relabelled a pass. Independent final outcomes will be recorded here.

The first provisioner integration exposed UTF-8 artifact decoding, a wrong guardian-selection assumption, and a test retaining the pre-rotation password object. These were corrected without weakening denial assertions. A subsequent real local run passed **23 scenario groups**, including lost Auth/insert/network responses, idempotency, actual relationships, role denial, raw-session rotation, disablement, server expiry and cleanup with unrelated-school survival. The expanded final raw-JWT/ownership checks are pending their final recorded run.

Continuation findings and observed fixes:

- **Real homework defect:** the persistent Realtime callback retained the initial empty assignment array. Its background refresh could show a skeleton and remount an open editor, discarding a draft. `TeacherAssignments` now reads current rows through a ref, ignores older overlapping reads and retains existing rows on fetch errors. The connected regression inserts a second homework record while the first editor contains an unsaved title, then verifies that title survives and saves. The completed journey passed this regression, author/stale/conflict/validation checks, translation/approval/original/acknowledgement, timetable/notices, child isolation, 88 responsive screenshots and rotated-session reload. Representative Parent 390px and Teacher 1440px images were visually inspected, not every screenshot.
- **Realtime verifier readiness:** several independent correction runs timed out before receiving their controlled event. Explicit token handoff alone did not fix it. The verifier now also waits for the server's positive PostgreSQL subscription-ready system message, not just the WebSocket channel-join callback, and verifies the controlled row through Parent RLS. Delivery/immutability/security assertions remain intact. Independent correction runs and the in-progress final gate then passed. This distinction follows the [official Realtime protocol](https://supabase.com/docs/guides/realtime/protocol); historical failures remain recorded rather than labelled passes.
- **Signup configuration:** local public signup was enabled. It is now globally disabled, anonymous sign-in remains disabled, and new passwords require 12 characters plus upper/lower/digit/symbol. Setting the email-specific CLI flag false initially also disabled password login (`email_provider_disabled`); it was restored to true while retaining the global signup prohibition. The Auth-server signup rejection and all 13 admin-provisioned account logins then passed. Two older negative-test fixtures used bare UUID passwords; they now append complexity characters instead of weakening Auth requirements. Existing fixture passwords were not changed.
- **Expanded lifecycle acceptance:** the final provisioner integration passed **30 scenario groups**, adding partial-content conflict refusal, extra-student/guardian-link detection, raw old-JWT plus refresh-token denial, interrupted password change and interrupted exact-row cleanup. Expiry is checked by real database authorization using past server-side metadata; scheduled cleanup uses an explicit local-test clock (not a physical wait or hosted scheduler). Both temporary schools/accounts were removed and an unrelated school survived the first cleanup.

Fresh audit initially found five high development lint-chain findings plus **two new moderate Vitest/mocker findings**. Vitest was updated from 4.1.11 to compatible 4.1.12, following the [maintainer Windows traversal advisory](https://github.com/advisories/GHSA-xp26-3454-mjgp) and [manual mock-registration advisory](https://github.com/advisories/GHSA-qxg6-89mg-rqv8). No major downgrade or new dependency was introduced. The first dependency reinstall hit a Windows native-library file lock while the owned Next server was running; that server was stopped and installation retried. Final audit/install/build evidence remains to be appended.

### Final local verification observed so far (2026-10-22)

| Check | Result |
|---|---|
| Full `verify:task32r` final gate | **37/37 passed**, including correction Realtime, both Phase 1 invocations, connected journeys, typecheck and lint |
| Existing focused suites | **154 passed** on Vitest 4.1.12; three additional Vitest DB/integration scenario tests passed |
| `test:online-demo` | **50 passed**, including hosted policy, static localized fallback, prior export/offline proof and dotenv-discovery sentinel |
| `test:provisioner` | **22 passed**, including target/key/dataset binding, production/unknown-host refusal, dry-run zero-network/no-journal proof and synthetic private-env launcher/CLI refusal |
| `test:provisioner:integration` | **30 scenario groups passed** on the final lifecycle implementation, including raw JWT/refresh denial, pending/interrupted rotation, unknown roster/links and exact cleanup; no remaining fixture accounts |
| `verify:provisioner:browser` | **Passed twice after the draft fix**; final run includes wrong-role route denial, entire revoked Parent workspace removal, fresh login/reload, Principal logout, all classroom/communication flows and 88 screenshots at four widths |
| Local schema | **33 migrations applied**, `supabase db lint --local` found no errors; no destructive reset or fresh whole-chain replay |
| Docker bindings | API `127.0.0.1:54321`, DB `127.0.0.1:54322`; no LAN bind |
| Dependency installation / audit | Final lockfile install succeeded; full audit **5 high / 0 moderate / 0 critical**, all remaining development lint chain; production-only audit **0** |
| Final standalone lint | **Passed** after the pending-operation journal hardening |
| Diff / source secret-pattern checks | **Passed**: no added private-key blocks, JWTs or long privileged keys; private journals/env/keys/screenshots are not tracked |

Focused unit/helper tests total **226** (154 + 50 + 22), plus **three** distinct Vitest integration scenarios and the separately counted **30** provisioner scenario groups. Shell/browser command counts overlap those suites; they are not added together as invented unique tests. The 37-command gate's initial failure and later independent failures remain documented above. The final gate and new-fixture browser command returned exit 0.

Final controlled slow-link evidence used the Next **development** server, 150 ms latency and 128 KiB/s down / 64 KiB/s up, cold browser cache: Parent login form 10,358 ms / key navigation 895 ms; Teacher 10,358 ms / 968 ms. These are not hosted optimized-build performance guarantees or measured optimization gains. Offline logout and reconnect left no private workspace. Real browser speech exposed zero voice locales in automated checks: **AUDIO NOT VERIFIED**; fluent language quality and real devices remain human acceptance gates.

Five residual high findings are `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`; no compatible patched resolution was selected. The audit's suggested forced major downgrade was not applied. They remain a documented development-tool risk for owner review, not zero-risk certification. Next remains 16.3.8; the Vitest patch does not resolve future Next/platform advisories.

Changed files include the new CLI/adapter/target/tests/fictional fixture/browser fixture, the two new local migrations, `package.json`/lockfile, `.gitignore`, the normal dev-launcher guard, connected presentation/hosted verifier changes if recorded, this report/template, safe-development notes and the retained Aarohi handbook. The final Git diff is authoritative. Protected untracked instructions/logs/review, private guide, personal fixture and retained presentation school remain out of scope.

### Changed-path inventory

| Group | Paths |
|---|---|
| Entry points and documentation | `.gitignore`, `START_HERE.md`, `docs/25_SAFE_SUPABASE_DEVELOPMENT.md`, `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, `docs/SCHOVERA_INTERNATIONAL_DEMO_GUIDE_FOR_AAROHI.md`, `docs/templates/demo-provisioning-approval.example.json` |
| Operator implementation / fixtures | `scripts/online-demo/adapter.mjs`, `browser-fixture.mjs`, `cli.mjs`, `integration.mjs`, `target.mjs`, `target.test.mjs`, `fixtures/fictional-campus.json` (all under `scripts/online-demo/`) |
| Existing launch / verification | `scripts/dev-local.mjs`, `scripts/verify-attendance.mjs`, `scripts/verify-corrections.mjs`, `scripts/verify-online-demo.mjs`, `scripts/verify-phase1.mjs`, `scripts/verify-presentation.mjs` |
| Application | `src/components/schovera-app.tsx` — scoped homework refresh/draft fix only |
| Local schema/config and lockfile | `supabase/config.toml`, `supabase/migrations/20261022100000_bound_demo_session_access.sql`, `supabase/migrations/20261022101500_verify_demo_access_boundary.sql`, `package.json`, `package-lock.json` |
