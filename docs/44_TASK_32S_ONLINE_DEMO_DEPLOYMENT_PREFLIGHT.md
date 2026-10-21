# Task 32S — International online-demo deployment preflight

Status: local preparation only. **No cloud action is authorized or performed.** No online demo URL exists as a result of this task. Final execution evidence is recorded at the end; pending checks are not passes.

Baseline: `feat/task32r-international-software-finalization`, `a0ff2c14b6b31145fc9d194880c8df0557bbdc69`, clean tracked state. Work branch: `feat/task32s-online-demo-preflight`. Task 32R source and reports were reviewed. Task 32Q was not found in local history by Task 32R; its local preparation is in `docs/42_ISOLATED_ONLINE_DEMO_PREPARATION.md`. This task supersedes that preliminary release checklist, not its no-production boundary.

## 1. Architecture and exact resources requiring approval

```text
Aarohi / second presenter — HTTPS, private access link + individual role login
              ↓
NEW dedicated Vercel project — Next.js, demo flags, no privileged/provider keys
              ↓ browser publishable key + authenticated session / RLS / checked RPCs
NEW independent Supabase project — Auth + schema + fictional 20-student campus
```

Request approval for **one new Vercel project**, **one new Supabase project**, the chosen regions/plan/usage limits, optional paid deployment protection only if desired, and a private trainer credential/journal store. Proposed display names can be Schovera International Demo; actual identifiers and origins must be recorded from the new projects, not guessed. No custom domain, paid AI/TTS/translation/SMS provider, device service or gateway hosting is required for this reduced web demo.

The existing `https://schovera.vercel.app` stays unchanged. Git remote metadata identifies `https://github.com/OmiVibes/Schovera.git`. No `.vercel/project.json` or linked Supabase project-reference metadata was available locally during inspection. The actual production Supabase reference and Vercel project ID are therefore **not independently established**. Obtain those **non-secret** IDs from the owner/dashboard before release; never open production `.env.local`. Comparing two caller-supplied strings is not proof of project ownership. A different preview URL alone is not database isolation.

## 2. Environment configuration and identity checks

Use [the placeholder-only template](templates/demo-online.env.example). Set values only in the separately approved demo project. The following are variable **names**, not credentials:

| Variables | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | New demo project's API origin and publishable browser key; no legacy/service key accepted by the hosted policy |
| `NEXT_PUBLIC_SCHOVERA_DEMO`, `NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO`, `SCHOVERA_HOSTED_DEMO` | Matching demo/hosted flags; visible fiction label and disabled local services |
| `SCHOVERA_DEMO_APP_ORIGIN`, `SCHOVERA_DEMO_PROJECT_REF`, `SCHOVERA_DEMO_VERCEL_PROJECT_ID` | Owner-verified dedicated demo origin and project identities |
| `SCHOVERA_PRODUCTION_PROJECT_REFS`, `SCHOVERA_PRODUCTION_VERCEL_PROJECT_IDS` | Nonempty comma-separated production identity denylists, supplied independently by owner |
| `VERCEL`, `VERCEL_PROJECT_ID` | Platform metadata; actual Vercel project must match the approved demo ID |
| `TEACHER_AI_PROVIDER` | Disabled provider in hosted mode |

Leave `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY`, `SCHOVERA_RFID_CAPABILITY_KEY_ID`, `SCHOVERA_TEST_MODE`, `SCHOVERA_RFID_API_MODE`, `SCHOVERA_FALLBACK_MODE`, `NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE`, `OLLAMA_BASE_URL` and `OLLAMA_MODEL` absent/empty in Vercel. Unknown nonempty `NEXT_PUBLIC_*` variables fail preflight. Do not import project/team-wide inherited secrets without review. Credentials for a later privileged seed operator belong outside Vercel and browser builds.

`src/lib/demo-deployment-policy.mjs` is invoked by `next.config.ts`. Hosted mode fails closed on disagreeing/mistyped flags, missing denylists, same production/demo reference or ID, production app origin, non-HTTPS/port/path/query-bearing app origins, mismatched database hostname, privileged-key prefix, inherited local adapters/provider secrets, or a missing/different actual `VERCEL_PROJECT_ID`. Enable automatic System Environment Variables on the NEW Vercel project and independently verify its platform-supplied project ID; do not substitute a copied production ID or treat a manually asserted value as ownership proof. Without demo flags, existing normal configuration is unchanged. This is a configuration check, not remote identity verification, key ownership proof, a firewall or cloud authorization.

Hosted responses add no-index/no-archive, no-referrer, no-sniff, frame-denial and private/no-store headers. Next/Vercel may specialize cache headers for assets; inspect actual deployed responses. These headers are **not access protection**. No global CSP or cross-origin allowlist was invented without a full compatibility review. No new public route was added.

## 3. Authentication, sessions and student access

- Disable **Allow new users to sign up** and anonymous sign-ins in the NEW Supabase dashboard. Keep only password/email login enabled for this demo; disable unused providers. The website has no signup form, but hiding a form does not disable the Auth API. [Supabase general configuration](https://supabase.com/docs/guides/auth/general-configuration) explains the signup control.
- Set Site URL and exact redirect allowlist to the approved HTTPS demo origin. Do not use production origins, localhost, blanket `*.vercel.app`, or an open redirect. Current password login does not require a custom OAuth callback route; no nonexistent callback is prescribed.
- Provision independently generated temporary accounts, one role account per presenter per needed role; do not share passwords or reuse local/production accounts. Keep account-to-demo-school relationships explicit. Additional presenter accounts require deliberate assignment/link rows, not role claims from a browser form.
- Hosted browser Supabase cookies now explicitly use **Secure** and **SameSite=Lax**. `@supabase/ssr` browser sessions necessarily remain JavaScript-readable, **not HttpOnly**. RLS/RPC checks remain authority; this is not a new server-side session architecture. Use dedicated browser profiles, no untrusted HTML/scripts, sign out on shared devices and do not export tokens.
- Plan a demo lifetime of at most 14 days, recorded in the provisioning journal. This planning limit does not itself expire Supabase sessions. Owner must schedule expiry/cleanup, deactivate demo profiles and revoke sessions. Time-box/session-inactivity settings are plan-dependent; do not promise a paid setting on a free plan. A changed password alone does not instantly revoke every issued access JWT; account for access-token lifetime and verify denial through inactive profiles/RLS.
- Deliver the protected link privately, and individual generated passwords through a separate private channel. Never put either bearer access links or passwords in the student handbook, screenshots, Git, build logs or a public QR code. Rotate a lost account and revoke sessions; rotate the protection link if it leaks.

## 4. Deployment protection for students without Vercel accounts

Plain Vercel Authentication/invites to a protected deployment can require Vercel login, so that is not the proposed student experience. The alternative is a **private Shareable Link that bypasses the Vercel authentication gate for viewing**, followed by the normal Schovera account login and RLS. Treat the link as a bearer secret, not an individual identity check. Vercel documents shareable links on all plans and a one-link-per-account Hobby limit; the specific dashboard and available quota still require owner verification. [Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links), [sharing deployments](https://vercel.com/docs/deployments/sharing-deployments).

Use an approved, preferably commit-specific protected preview in the **new project**, not a public production domain whose protection settings differ. Verify the preview aliases, branch URL, generated URL and project domain independently; do not assume Standard Protection covers every domain. In a fresh browser with no Vercel account, test that the private link works, the bare protected URL does not expose the app, and revocation removes access. Do not enable a blanket Deployment Protection Exception as a shortcut.

If the account has no usable shareable-link quota or the event needs per-person outer-gate identity, stop for an owner decision. Paid Password Protection is an alternative that does not require a Vercel login but needs explicit budget approval and still uses a shared outer secret plus individual app accounts. It is not available on Hobby; current plan/add-on costs must be checked at approval. [Vercel Password Protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection). No paid option was enabled here. If neither option is approved, **remote student handoff is blocked**—do not remove protection or weaken RLS.

## 5. Online feature availability

| Feature | Intended separate web-demo behavior | Acceptance condition |
|---|---|---|
| Login/roles/linked children | Individual password sessions; Parent linked children, Teacher assigned classes, Principal own school | Test direct API denials as well as UI |
| Messages/Important updates/acknowledgements | Normal checked RPCs, corrections/history, persisted coverage | Same controlled update through all three roles |
| Translation drafts/approval/original | Manual human draft and Principal review; prepared Hindi/Marathi examples | Source/version invalidation and fluent reviewer before linguistic-quality claims |
| Browser voice | Explicit play/pause/resume/stop and unavailable/error state | Actual laptop/mobile matching voice and audible check; no new provider |
| Attendance/Insights/homework/timetable | Existing saved registers, explainable rules and optimistic author-only homework edits | RLS, date/version/conflict and responsive checks |
| Entry panels | Pre-seeded fictional observations, bounded persisted reads/polling | No live hardware, no safety/attendance inference |
| Teacher AI | Disabled generation UI and immediate API unavailable response without even Auth/provider calls | Verify direct API refuses; spreadsheet remains usable |
| Spreadsheet | Basic browser-local import/edit/export | Fictional workbook only; not full Excel/macros/formula preservation |
| SMS/IVR | Honest, localized illustrative panel; no controls or phone delivery | Static examples are **not this account's delivery history**; existing local simulator stays local |
| Gateway/RFID ingestion | Disabled, including retired v1 and capability routes | Direct requests return disabled status; no service/issuer keys |
| Offline browser | No persistent private-data cache or remote-alert promise | Logout removes private content; new reads need connectivity |

Local fake delivery history is included as minimized fictional bundle examples for the future seed plan; the hosted panel does not pretend those examples are a remote live provider or a restored per-account history. A remote read-only history projection would need a separate reviewed implementation. The existing local simulation's consent/retry workflow is not weakened to enable it online.

## 6. Controlled dataset export and provisioning boundary

`scripts/online-demo/export.mjs` reads only an owned, completed Task 32R **local** fictional school through the existing loopback/mode guard. It verifies its journal-owned school code, exact 20-name roster, two classes, 13 normal role accounts and required connected records. It exports explicit columns only, replaces original UUIDs with logical references, omits emails/passwords/Auth data, and excludes device/card credentials, private/public device keys, capabilities, receipts, operational audit metadata and phone numbers. Export queries are bounded; unknown sensitive columns and unresolved relationships are rejected. Output is hash-addressed and Git-ignored, so repeated identical export reuses the same artifact.

Windows PowerShell, **from a clean isolated local worktree with local Supabase running**:

```powershell
# Source is the existing journal-owned fictional presentation checkout, never production.
npm run demo:online:export -- --source-worktree '<owned presentation checkout>'
npm run test:online-demo
```

The bundle is a **typed/validated data artifact, not runnable SQL**. `scripts/online-demo/provisioning.mjs` binds a plan to verified metadata, a run UUID, dataset hash and expiry. Its offline adapter contract proves idempotent completion/resume, exact run ownership, changed-content rejection, cleanup and credential-rotation dispatch. Tests deliberately refuse a hosted adapter. There is **no remote apply/cleanup/rotation CLI**, no remote client and no executable cloud seed in Task 32S. Do not weaken existing local mutation guards or point `presentation:prepare` at hosted Supabase.

Before remote seed approval can be exercised, implement/review a distinct privileged demo adapter that independently checks the actual project, creates fresh accounts, journals logical→new UUID mappings and private credentials before advancing, upserts only owned data, reconciles partial Auth creation, and verifies cleanup. It must reconstruct table-required school/actor fields, recreate translation approval through checked workflow with fresh source hashes, and provision new non-operational synthetic event relationships rather than copy device credentials. Dates should be reviewed/rebased explicitly, not silently turn historical attendance into future dates. Multiple presenter accounts must get independent allowed links/assignments.

Cleanup requires target identity and run journal match even after expiry; delete only owned records in reviewed FK order, revoke sessions/disable profiles, delete owned Auth users and verify zero leftovers. No database-wide reset, table truncate or arbitrary school-code prefix deletion. Rotation writes a new private credential journal and revokes sessions; do not log passwords. The offline proof is **not evidence that a real Supabase adapter performs those operations correctly**. Its local/remote acceptance is a release blocker until a separately approved implementation and isolated integration test.

## 7. Migration plan and serverless review

There are 31 existing migrations including the Task 32R homework edit RPC. No migration is added/changed in Task 32S. Review the ordered filenames exactly; do not rename historical files or export production data. After approval, use a clean release checkout and the verified NEW demo reference, inspect a remote dry-run against that empty demo only, then apply the ordered migrations. Do not link the developer worktree to production or use a global reset. A fresh database replay and Auth/RLS acceptance on the new project are required; existing local 31-migration schema success is not hosted migration proof.

Next app/API routes use the Node runtime; browser workbook code is separate from the trainer's Node/SQLite gateway. Vercel does not run the gateway or expose the laptop's localhost. Hosted mode disables local-only routes early even if local flags accidentally leak; configuration rejects those flags before build. AI is disabled before any Auth/model client, avoiding unnecessary provider/Auth work. No distributed ingest/AI limiter is claimed. Direct browser Supabase traffic still requires Auth rate limits, signup-off, RLS and usage monitoring; deployment protection alone does not hide the Supabase public API.

Set Node 22.x for consistent tool/build compatibility, install exact `package-lock.json`, and use the standard Next framework deployment only after approval. Do not use the isolated preflight fixture's synthetic project/key for a real deployment. Do not copy `node_modules` junctions, `.local`, `.env.local`, screenshots, databases, credential journals or private keys to Vercel. Logs should show statuses/counts/correlation IDs, never tokens, request message bodies, student records, passwords or bearer links. Avoid logging browser URLs containing protection query parameters; no-referrer reduces leakage, not all history/log exposure.

## 8. Local verification and evidence

Planned safe checks: new identity/provisioning/hosted-panel unit tests, existing hosted-API tests, existing regression batch, controlled read-only bundle export, local self-signed HTTPS hosted-mode browser rehearsal, typecheck, lint, audit and normal/hosted isolated builds. The HTTPS rehearsal intercepts the fixed synthetic Supabase origin before any request reaches it and serves it from local Supabase; all other external browser requests/WebSockets are blocked. It checks Secure/SameSite cookies, refresh persistence, logout, disabled API responses, secret-free JS and 22 routes at four widths. This is **not a deployed TLS certificate, real Vercel protection, remote mobile-device or hosted Realtime test**. Realtime/reconnect remain independently covered by normal local regression suites.

The HTTPS bridge permits only its loopback Next development bootstrap WebSocket; the synthetic Supabase WebSocket is closed before delivery. Its temporary self-signed certificate/key are generated with already-installed Git OpenSSL, never installed in the Windows trust store, and removed after the run. Run it from an isolated checkout with local test env files:

```powershell
npm run verify:online-demo -- --source-worktree '<owned presentation checkout>'
npm run build:isolated
npm run build:isolated:demo
```

The hosted isolated build uses only a fixed, explicitly synthetic project configuration. Its public-looking reference/key are **not owned or usable cloud credentials**, not evidence of an online demo and not values to copy into Vercel. Both build modes exclude private env files, install dependencies inside their disposable snapshot, scan synthetic secret sentinels and clean up; allowlisted font downloads are not an OS-level network sandbox.

### Important correction: test-runner dotenv discovery

Early Task 32S unit runs were launched from the original checkout. Inspection later established that Vite, unlike Next's test-mode loader, discovers `.env.local` by default; the prior Vitest config did not disable that discovery. **Automatic parsing of the original production file cannot be excluded for those early runs.** It was not manually opened, inspected, copied, printed or modified, and its actual contents have not been read to investigate this. No production endpoint was deliberately targeted and no production-secret values were printed. However, a claim of verified zero file access would be unjustified; no filesystem access trace was captured to retroactively certify it.

`vitest.config.ts` now sets `envDir: false`. A regression uses a separate temporary directory and a harmless `.env.local` sentinel: the isolated configuration does not load it, while the synthetic control demonstrates Vite's default would. It never reads the original file. Integration commands continue receiving only explicit `.env.test.local`; later browser/database tests run from clean worktrees. This discovery also qualifies Task 32R's earlier blanket zero-access claims for root Vitest runs, not the separately verified isolated-build exclusion. Owner review is required before making an assurance of zero credential exposure; do not silently convert this caveat into “NO access.”

## 9. Cost and usage controls

Owner must check current Vercel/Supabase project quotas, inactivity/pausing behavior, region, Auth/email limits, egress, logs, build/function usage, database size and the available protection option. No free-plan capacity or always-on availability is guaranteed. Keep one small fictional school, bounded polling, signup off and a short scheduled demo lifetime. No paid AI, translation, SMS, IVR, hardware purchase or background GPU service is authorized. Define a spending cap/alerts and trainer availability before the event; maintain labelled recorded backup evidence if a free service pauses.

## 10. Exact proposed deployment sequence — approval required

1. Owner approves new Supabase project, new Vercel project, limits/region, responsible operator and expiry, plus the reduced feature matrix.
2. Create **only the new Supabase project**; obtain its independent ref. Obtain actual production ref/ID denylists through non-secret dashboard metadata; verify disjointness. Stop if identity is uncertain.
3. Review/apply ordered migrations to that new database only after dry-run; verify required tables, RLS enabled, grants and RPC authorization. Do not copy production rows.
4. Separately implement/approve the bound hosted seed adapter above, test it in an isolated disposable local database, then authorize its synthetic-only execution against the verified new demo. Create independent presenter role accounts and an expiry/cleanup journal. Verify counts and negative-access cases.
5. Create the **new Vercel project** from the approved commit. Push/import/deployment is itself a separate approval; do not connect to the production project's auto-deploy settings. Record the actual new Vercel ID.
6. Configure only the allowlisted demo environment in the selected protected preview scope; no inherited production/service/provider keys. Verify build/runtime identity equality. Set exact demo Auth origins and signup controls.
7. Enable the approved protection mechanism before student access; privately generate a shareable link if available. Verify all aliases and anonymous/bare-link behavior without a Vercel account. Never use a public protection exception as a workaround.
8. Deploy the approved commit to that dedicated protected demo. Record build/deployment ID and environment ownership. No production alias promotion.
9. Run HTTPS/header/Auth/redirect/disabled-route/bundle-secret smoke checks against that actual demo under explicit remote-test authorization. Confirm no traffic targets production and no route reaches a trainer's laptop.
10. Test Parent linked/unlinked, Teacher assigned/unassigned/non-author, Principal same/cross-school, anonymous reads/writes, Important update→approval→ack, attendance correction/Insights, stale homework edit, timetable conflicts, entry scope, language, voice-unavailable and 390px/laptop on actual remote browsers. Test reconnect, expiry and protection revocation.
11. Only after acceptance, hand Aarohi and the second presenter the private link and separate individual credentials. Rehearse the online-only script, correct role sessions and fallback explanation.
12. At expiry or incident: revoke sharing link/protection access, disable demo profiles and revoke sessions, stop/pause only the new demo, preserve privacy-safe evidence, clean owned fixture accounts/rows through the reviewed journal, verify deletion, and tear down only approved demo resources. Verify project IDs before every operation.

## 11. Rollback and emergency disable

For UI regressions, restore a known-good approved commit **in the new demo project only** after confirming schema compatibility. Do not roll back database history with destructive SQL. For suspected secret exposure, revoke the affected demo key/session/link, stop access and investigate sanitized logs; a Git revert alone does not revoke credentials. For an accidental wrong project/ref, stop before migration/seeding/deployment; do not attempt automatic cleanup against an uncertain target. Production is not the rollback target.

## 12. Post-deployment acceptance checklist

- [ ] Independent project IDs verified against owner denylists; all environment scopes checked.
- [ ] Fresh schema migration, RLS/grants/RPC and signup-off verified remotely.
- [ ] Approved seed adapter journal, fresh individual accounts, counts, rotation and owned cleanup verified.
- [ ] Actual HTTPS certificate, redirects, headers and Secure cookies verified.
- [ ] No-Vercel-account private-link access works; bare aliases protected; revocation tested.
- [ ] Three roles, context switching, unauthorized REST/RPC and all core communication/classroom flows passed.
- [ ] Local-only APIs unavailable; AI unavailable gracefully; static SMS/IVR example is not mistaken for live history.
- [ ] Laptop/mobile layouts, Realtime recovery, approved-language/source display and actual device voice assessed.
- [ ] Browser bundles/logs contain no privileged credentials; no production requests or remote real-child data.
- [ ] Expiry, monitoring, budget, stop contact, rollback and teardown rehearsal recorded.

## 13. Final record and decision

Pending local verification at this checkpoint. No cloud resource, remote credential, migration, seed, push or deployment has been created or changed. Actual project identities, seed-adapter approval, access protection and remote acceptance remain external gates. Do not start deployment automatically.
