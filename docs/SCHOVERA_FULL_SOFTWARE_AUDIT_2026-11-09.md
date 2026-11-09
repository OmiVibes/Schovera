# Schovera independent software audit — 9 November 2026

This report records executed local checks, defects and coverage limits. It is not a production security certificate. Application fixes were not authorized or made. During the audit, the owner explicitly approved the test-provider/zoom harness repairs and a later audit-probe locator repair; all original failures are retained.

## 1. Executive summary

| Intended use | Verdict | Evidence and condition |
|---|---|---|
| Local software demonstration | **Conditionally ready** | Three-portal connected workflows, local RFID synchronization, speech and live Ollama passed. Use synthetic accounts and a rehearsed, running local stack. The Principal totals defect below remains. |
| Grade 7 student presentation | **MANUAL REVIEW REQUIRED** | The software can support a supervised presentation. Student rehearsal, fluent-language listening, factual AI review and an accurate explanation of offline limitations were not certified by these tests. |
| Offline laptop demonstration | **Partially ready** | Durable RFID queue/restart/replay to local Supabase passed. A durable, automatically synchronized attendance/notice school-to-cloud outbox is **not implemented**. Local database availability and remote delivery are different things. |
| Raspberry Pi integration | **NOT TESTED** | No Pi, reader, electrical, storage-media power-loss or school-network test. |
| Public online deployment | **NOT READY** | Fresh dependency findings; local-only account/RFID/communication services; Windows-specific speech; laptop-local Ollama; unverified hosted operational/privacy controls. No deployment attempted. |
| Real school pilot | **NOT READY** | Requires the software corrections and separately reviewed hosting, hardware, consent, enrollment, retention, incident and operating procedures. |

The most significant reproduced product defect is **incorrect Principal communication totals above the API row limit**: 1,002 important persisted updates produced a displayed total of 1,000. A passing small-fixture suite did not detect this. No confirmed unauthorized access, lost protected-school record or active exploitation was observed.

The fresh npm audit reported **10 affected package entries: 1 critical, 1 high and 8 moderate**. These are advisory findings, not proof that this application is exploitable. Applicability and existing mitigation are explained in section 8.

## 2. Environment and audit scope

- Repository: `D:\Notes\Degree\Projects\Schovera`; the unrelated default EduNexus directory was not the audit target.
- Starting revision: `5d7055f8e0b2a1465172b4811354f0b706aa905f`, branch `feat/simpler-demo-and-workspaces`.
- Initial tracked tree: clean. Pre-existing untracked `CLAUDE.md`, `local-dev.err`, `local-dev.out`, and `review/` were preserved.
- Runtime: Windows, Node **22.18.0**, Docker Engine **27.4.0**, Supabase CLI **2.121.0**, Next **16.3.8**, React **19.2.8**. CLI version was checked using `npx --no-install supabase --version`; no CLI upgrade was made.
- Isolated QA checkout: `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`; browser origin `http://127.0.0.1:3104`; Supabase API `http://127.0.0.1:54321`, PostgreSQL port `54322`.
- Tracked source/scripts/config were synchronized into the existing QA checkout without copying private root environment files. A subsequent comparison found **171 compared files, zero mismatches**. QA retained its existing local-only env files and synthetic seed data; there was no seed/reset/migration run.
- Auth health: **HTTP 200**. API and database effective Docker bindings are **127.0.0.1**, including the network's `host_binding_ipv4` option. **34 migrations** were already recorded locally. Running Auth reports public signup disabled.
- The Vector logging container was restarting/unhealthy and the edge-runtime container was exited. Core API/Auth/database tests succeeded. These auxiliary service failures were not repaired or diagnosed to a root cause.
- Both web ports were initially stopped. Only owned QA server processes were started: account-management mode first, simulator mode next. At completion the owned QA server was stopped, restoring the initial web-server state; Docker/Ollama were left running as found. No hosted Supabase or Vercel target was used.

**Source identity:** the first isolated build fingerprint was `82eb7f1c560a9f8bc6812bfda70fe09fe09969d621b9e908c485ac9c519c549c` for 169 approved files. After the approved test-only repair, the final build fingerprint was `81e0677be394af15659c1c76307cfa5214b9c05d71ea598dbcfe7903587229e6`, also 169 files. Application implementation files did not change. Only `src/components/assignment-editor.test.tsx` changed in tracked test code: it now supplies the actual language provider; its stale-edit assertions remain intact.

**Environment limitation:** the first simulator launcher inherited shell variable names `OPENAI_API_KEY` and `GEMINI_API_KEY`. Their values and provenance were not inspected. Consequently, that initial server process cannot be certified credential-free. The configured application branches used local Ollama; no paid provider was selected. Later audit launches used an OS-variable allowlist. The existing RFID launcher itself was left unchanged and is a recorded finding. The production `.env.local` was never opened, copied or modified by this audit.

Evidence directory, abbreviated **E** throughout:

`.local/schovera-manual-demo/audits/2026-11-09-5d7055f-01/`

It is Git-ignored. `results.json` contains commands, checkout, timestamps, exits, expectations and limitations; `manifest.json` contains file hashes. `environment.json`, `large-feed.json`, `fixed-layout.json`, and `login-and-layout.json` retain measured details. The executable ledger is reproduced in section 12 so this report remains useful without the private checkout. Evidence hashes establish identity, not correctness.

Both isolated build snapshots and the successful external zoom profile were cleaned. The pre-existing QA checkout, browser profiles, private account files and unrelated artifacts were preserved. The ignored audit evidence directory is intentionally retained for review. The tests span approximately **14:19–14:51 IST**; report/evidence validation follows that execution window.

Audit result categories: **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED**, **MANUAL REVIEW REQUIRED**. A section below may have passing verified behavior and explicitly untested subcases; it is not a claim that every possible button/state was exercised.

## 3. Section-by-section test matrix

All 23 destinations rendered and passed navigation/width checks at 320, 390, 768, 1024 and 1440 CSS pixels. Four selected pages per role also passed actual 200% browser zoom. The functional and authorization evidence below is separate from page rendering.

Evidence aliases: **NAV** `06-verify-role-navigation.log`; **VIS** `21-verify-role-visuals.log`; **320** `16-probe-verify-refinement.log`; **LOC** `20-verify-staff-localization.log`; **JOURNEY** `26-verify-final-journeys.log`; **DB** logs 07–15; **FAMILY** `18-probe-verify-family.log`; **AUTH** `40-probe-login-and-layout.log`; **HW/OFFLINE** `39-probe-offline-and-homework.log`; **NOTICE** `53-probe-school-notice.log`; **LARGE** `48-probe-large-feed.log`.

| Portal / route | Functional check and result | Authorization check | UI / outstanding scope |
|---|---|---|---|
| All: sign-in | **PASS:** wrong passwords rejected, correct sign-in, refresh persistence, logout and protected-page denial; AUTH | Role mismatch/account switching: NAV; account session revocation: account suite | Keyboard and en/hi/mr sign-in checks: accessibility suite. Account recovery/password-reset email delivery **NOT TESTED**. |
| Parent `/parent/home` | **PASS:** linked-child context, important/update panels, acknowledgement, child switching; FAMILY/JOURNEY | Linked versus unrelated children: FAMILY, profile/RFID suites | VIS/320; acknowledgement action is below first viewport in measured mobile fixture. See P3 touch-size finding. |
| Parent `/parent/profile` | **PASS:** child profile and persisted attendance/homework/communication aggregates; profile DB/JOURNEY/reconnect | Linked/unlinked/cross-school/anonymous profile queries checked | VIS/320; completeness of real enrollment data **NOT TESTED**. |
| Parent `/parent/updates` | **PASS:** teacher original arrives, approved translation selection, media controls, acknowledgement persists; JOURNEY | Translation draft/write and foreign-child denial: translation DB suite | VIS/320; all authored-language combinations require human review. |
| Parent `/parent/attendance` | **PASS:** stored history, status totals against PostgreSQL, child changes, empty child, period/year controls; FAMILY/blue UI/attendance DB | Other-family reads denied | VIS/320; trends tested with saved records, not inferred RFID attendance. Large multi-year datasets **NOT TESTED**. |
| Parent `/parent/homework` | **PASS:** correct-class assignment visibility and persisted content; assignments DB/JOURNEY | Parent create/edit and unrelated class access denied by DB/RLS suites | VIS/320; every historical due-date boundary not exercised in browser. |
| Parent `/parent/timetable` | **PASS:** authorized persisted timetable and reconnect/remount; timetable DB/JOURNEY/reconnect | Class/school-scoped visibility checked | VIS/320; timetable data completeness remains an operator responsibility. |
| Parent `/parent/notices` | **PASS:** school notice published through Principal UI appears with exact original; NOTICE; Listen/Pause/Resume/Stop and repeat: speech suites | Unlinked/foreign notice access and cache RLS denied | VIS/320; real SMS/call delivery absent by design. Failed first UI probe retained. |
| Teacher `/teacher/home` | **PASS:** assigned-class selection, active selection retained, routed workspace; NAV/JOURNEY/blue UI | Unassigned teacher empty context: JOURNEY | VIS/320/LOC; not every optional shortcut has an independent click assertion. |
| Teacher `/teacher/students` | **PASS:** choose assigned student, send original, safe retry, exact persisted message; JOURNEY/HW/OFFLINE | Wrong-class/school and direct write denial: phase1/idempotency/profile suites | VIS/320/LOC; arbitrary search strings and all validation permutations **NOT TESTED**. |
| Teacher `/teacher/profile` | **PASS:** selected-student aggregates and stale/context response protection; profile DB/reconnect | Unassigned/cross-school/anonymous denied | VIS/320/LOC; no new student records were edited. |
| Teacher `/teacher/attendance` | **PASS:** Present/Absent/Late database save/update, no duplicate row, Parent/Principal views; attendance DB; actual UI correction: JOURNEY | Unassigned/foreign roster and writes rejected | VIS/320/LOC; **FAIL against durable-offline requirement:** disconnected save is not queued. |
| Teacher `/teacher/homework` | **PASS:** actual 390px form create/edit persisted one revised assignment; HW/OFFLINE. RPC retry/conflict and role denial: assignments DB | Parent/non-author writes checked; approved editor stale-edit unit now passes | VIS/320/LOC; complete simultaneous two-browser edit journey **NOT TESTED**. |
| Teacher `/teacher/timetable` | **PASS:** assigned schedule/read recovery; timetable DB/reconnect | Teacher cannot take Principal timetable-write authority | VIS/320/LOC; all timetable conflict scenarios were database-level rather than UI form tests. |
| Teacher `/teacher/ai` | **PASS:** live local generation, editable output, workbook upload/edit/export/reopen, invalid upload and input, simulated error recovery | Anonymous 401, Parent/Principal 403 | VIS/320/LOC; actual timeout, missing-model and OOM faults **NOT TESTED**. Clipboard tests use a stub. |
| Teacher `/teacher/notices` | **PASS:** exact school notice original visible; NOTICE; actual media controls: simple voice | Read-only composer absence verified; publication authority denied | VIS/320/LOC; Teacher sends student updates, Principal publishes school-wide notices. |
| Principal `/principal/home` | **PASS** small-fixture persisted/reconnect summaries; **FAIL** at 1,002 important updates: shows 1,000; LARGE | Same-school scope checked | VIS/320/LOC; totals correction required before claiming large-school accuracy. |
| Principal `/principal/students` | **PASS:** list/profile selection and persisted school-scoped inputs; VIS/profile DB | Cross-school reads denied | VIS/320/LOC; exhaustive search/filter combinations **NOT TESTED**. |
| Principal `/principal/users` | **PASS:** 18 account-management scenario groups, including actual mobile create, retry, duplicate and scope checks | Anonymous/Parent/Teacher/inactive/foreign Principal denied | Correct account-server mode required; simulator mode intentionally does not enable this API. Existing passwords were not changed. |
| Principal `/principal/communication` | **PASS:** reviewed translation approval, acknowledgement/refetch and awaiting filter; JOURNEY/reconnect/translation DB. **FAIL:** truncated full-school totals; LARGE | Principal-only approval, foreign source denial and draft invisibility checked | VIS/320/LOC; measured 21-card mobile feed is 10,021px high. |
| Principal `/principal/attendance` | **PASS:** persisted class/day overview, correction refresh, insight evidence; attendance DB/reconnect/insights integration | Own-school reads; role-specific insight loader denial | VIS/320/LOC; attendance is separate from reader observations. |
| Principal `/principal/homework` | **PASS:** persisted same-school assignments; assignments DB/JOURNEY | Foreign school/unauthorized author modifications denied | VIS/320/LOC; Principal does not acquire Teacher author-edit authority. |
| Principal `/principal/timetable` | **PASS:** create/edit/delete validation, conflict and idempotency; timetable DB/reliability; read recovery in browser | Role/school boundaries checked | VIS/320/LOC; all authoring buttons were not separately driven in browser. |
| Principal `/principal/notices` | **PASS after approved probe correction:** actual mobile form persisted one Important announcement, exact original visible in all roles; NOTICE; RPC validation also passed | Teacher/Parent composer absent; publishing and cross-school denial in announcements DB suite | VIS/320/LOC; original label-locator timeout remains failed evidence. |

## 4. Cross-portal workflow results

**Teacher → Parent → Principal: PASS within local synthetic scope.** JOURNEY created a temporary school/accounts, changed classroom attendance through the Teacher form, sent a uniquely controlled Important update, and checked the actual saved/read state. Principal saved/submitted/approved a Marathi version; Parent selected the approved version, advanced real browser audio, acknowledged, and visited homework/attendance/timetable/profile. Teacher saw the persisted acknowledgement; Principal refetched persisted communication state. Cross-role empty contexts and logout passed.

Independent attendance/assignments/profile/reconnect checks queried PostgreSQL through authorized clients, rather than accepting success messages alone. The homework probe additionally drove Teacher create/edit at 390px and queried the saved assignment. After its approved locator correction, the school-notice probe drove Principal publication and verified the exact original in all three portals and one persisted Important announcement. Translation DB tests rejected stale approval and unauthorized/draft reads and preserved originals after correction invalidated approval.

Every owned manual fixture was cleaned in `finally` and checked for removal. Other suites reported their own controlled cleanup. No existing account/password was rotated. Protected-school hashes were rechecked after the large-feed test and after subsequent fixture work.

## 5. Offline synchronization results

| Level / scenario | Result | What was actually verified |
|---|---|---|
| A. Software failure/replay simulation | **PASS** | Gateway unit/transport tests: WAL transactions, pre/post-commit failures, lost local acknowledgement, acceptance with lost response, retry/backoff, queue capacity, corruption/version failure, retained attention state. |
| B. Laptop durable RFID → local Supabase | **PASS** | JOURNEY and gateway integration reopened the queue in separate processes, kept pending data during simulated outage, synced immutable v2, persisted receipts, rejected changed replay and handled revoked assignment as unresolved. Authorized role views showed one event. |
| Browser misses remote data while offline | **PASS** | Reconnect suite used controlled browser offline state while an authorized second client changed persisted local state. Focus/reconnect recovered message/ack/profile/attendance/homework/timetable state without stale-context leaks or duplicate cards. |
| Browser attendance save with DB unavailable | **FAIL against requested offline-first capability** | Controlled RPC network abort produced an explicit save error, unchanged database, and the old Absent value after reload. No durable attendance outbox or later automatic replay was observed. |
| Browser Teacher message with DB unavailable | **PASS for limited manual recovery; not a durable sync service** | Request data/ID survived same-tab reload in `sessionStorage`; explicit Retry saved one row and cleared pending state. Tab-close/reboot durability is not established and sessionStorage is not a school-wide outbox. |
| Internet unavailable but local DB available | **BLOCKED as a school-to-cloud claim** | Existing browser harnesses block non-loopback requests and local workflows work, but there is no separate cloud attendance/notice replica/queue to verify. No WAN was disconnected. |
| C. Pi integration; D. school Wi-Fi | **NOT TESTED** | No hardware or site available. |
| E. Public online synchronization | **NOT TESTED** | No hosted resources contacted or authorized. |

RFID tests do not prove general offline attendance/notice synchronization. A locally persisted row is not evidence that a remote family received it. Device `observed_at`, local durable acceptance and server `received_at` remain distinct.

## 6. RFID software results

**PASS: software/local-only acceptance.** The v2 suite exercised signed device/capability bindings, exact immutable assignment, active-only attribution, revoked/reassigned unresolved behavior, key revocation, concurrent retries, nonce replay, altered payload, bad signature and role RLS. Gateway acceptance additionally tested persisted queue/restart/local delivery and Parent/Teacher/Principal views, unlinked/unassigned denial and unchanged classroom attendance. Simulator/unit tests reject external targets.

Unit coverage includes 22 RFID tests, 43 gateway/transport tests and 20 attribution-policy tests; these are subsets of the 295 unit tests, **not extra independent totals**. The RFID and gateway integration files each contain one large scenario test with many assertions.

Gate-scan views explicitly distinguish records from classroom attendance. Unresolved receipts are not shown as resolved child arrivals. SMS/IVR evidence is simulated only; a receipt or scan never proves physical safety, reading, or real notification delivery. The legacy v1 endpoint still exists; its reference-only attribution limitations are documented in Task 32F. This audit's positive offline attribution verdict applies to **v2**, not delayed named-student v1 use.

Physical scans, cloned-card resistance, reader authentication hardware, Pi disk-full/power-loss behavior and hosted ingestion remain **NOT TESTED**. There was no Realtime publication or security-gate change.

## 7. Voice and translation results

**Native browser voices:** real Chrome, the shipped speech controller and 10 generic samples passed matching locale, original-text preservation, volume 1 and native start/end callbacks:

| Language | Installed native voice observed | Samples | Verdict |
|---|---|---:|---|
| English | Microsoft Heera — English (India) | 1 | Software playback callbacks PASS |
| Hindi | Microsoft Hemant — Hindi (India) | 3 | Software playback callbacks PASS |
| Marathi | Marathi | 3 | Software playback callbacks PASS; basic offline voice |
| Korean | Microsoft Heami — Korean (Korean) | 3 | Software playback callbacks PASS |

The local communication route also produced actual 16-bit PCM WAVs: English 2.8s/RMS 2979; Hindi 4.6s/RMS 3217; Marathi 2.8s/RMS 5984; Korean 4.3s/RMS 2800. These are generic-sample measurements, not quality scores. Real translated-message audio advanced unmuted in Chrome at 390px; Pause/Resume/Stop passed. Parent and Teacher repeated playback, navigation-stop, keyboard controls and stable button geometry passed with English originals while cycling en/hi/mr interface labels.

Automatic translation used local `qwen3:4b-instruct`. Hindi/Marathi/Korean examples preserved tested date/time facts and original identity; cache access was reauthorized through RLS. Approved translations remained distinct from automatic output, and correction invalidation/Principal approval restrictions passed.

**MANUAL REVIEW REQUIRED:** audible speaker output on the presentation setup, pronunciation, naturalness, semantics, names/numbers/date pronunciation and fluent approval of each language. Neither callbacks, advancing media clocks nor nonzero PCM certify that a person heard or understood the correct sentence. Korean reading support does not imply a Korean interface. Actual uninstalled-voice behavior was not created by uninstalling Windows voices; missing/unavailable states have unit coverage only.

## 8. Security and privacy results

**Verified local boundaries:** Parent linked/unlinked/cross-family access; Teacher assigned/unassigned/cross-school access; Principal same/other-school account and record scope; anonymous denial; server-only account/RFID writers; unauthorized approval/draft reads; source reauthorization on translation-cache hits; Origin/Host and malformed/oversized identity-injection refusals. Browser bundle checks in the integration suites and isolated-build private sentinels passed. Account API tests also rejected a logged-out bearer session. This is not an exhaustive security assessment of every endpoint/session lifecycle.

The first simulator-launch environment inheritance issue is **AUD-04** below. Known local test credentials were redacted before audit log writes. No production env values were read or deliberately compared. No claim of a global packet capture or operating-system network sandbox is made: browser interception, inspected local provider code and a restricted build proxy have narrower coverage.

**Fresh dependency audit:** `npm audit --json` exited 1 with 10 affected package entries. Lockfile versions: Next 16.3.8, sharp 0.35.5, Zod 4.5.4; the affected minimatch path is a development-tool chain, not necessarily the root minimatch version. Eight moderate entries include its TypeScript-ESLint/Next lint dependants; they are not eight separate exploits.

- Next's aggregate critical entry includes [SVG image optimization RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [typed-array cache-function RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr), and [Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r). The advisory identifies 16.4.1 as patched. **Existing sharp 0.35.5 meets the documented image-optimization workaround.** Source scan found no `next/image`, `use cache`, or `use server` feature use. This reduces identified exposure; it does not turn npm audit green or certify every framework/runtime path. No exploit was attempted.
- [Zod collection-validation memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): installed 4.5.4 is below patched 4.6.6. Inspected account arrays have `.max(50)` and HTTP bodies are bounded; the advisory's unconstrained-array condition was not reproduced. Review and patch the dependency rather than claiming confirmed application memory exhaustion.
- [Minimatch glob amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects lint tooling paths. No request-facing user-controlled glob consumer was identified. Do not apply npm's suggested cross-major ESLint configuration downgrade blindly.

Primary advisory pages were consulted on 9 November 2026. No dependency/lockfile, Auth configuration, schema or RLS change was made. Local passing denial tests do not certify public hosting, backups, account recovery, rate limiting at scale, security monitoring, independent penetration testing or privacy compliance.

## 9. UI, mobile and accessibility results

- **PASS:** 23 routes × 4 existing visual-audit widths (1440/1024/768/390), plus all 23 at 320. No unintended page overflow was found in these executed route states. This does not cover every expanded data-dependent state.
- **PASS:** 96 staff role/page/language/width combinations; mobile More pages opening/navigation/Escape; selected route visibility; selected child/year continuity; keyboard sign-in controls, labels/focus checks and accessibility/i18n suite.
- **PASS after harness repair:** real 200% browser zoom on 12 selected views (home/attendance/notices plus profile, AI or users). Measured CSS viewport 713 versus outer 1442, device ratio 2.5. Other routes at real zoom are **NOT TESTED**; the earlier accessibility suite's 720px equivalence is not the same proof.
- Existing galleries/ZIP were located. The three overview images and full Parent home, Principal communication and Teacher workbook images were inspected; fresh Parent home and Teacher attendance images were also inspected. Full-page images were not treated as backend proof or as proof every pixel of all 153 captures was visually reviewed.
- **Evidence discrepancy confirmed:** the refined README says one overflow capture; final `pack-audit.json` says zero. Current route checks found zero overflow, and workbook edit/export at 390px passed. Historical capture descriptions were not silently rewritten. The workbook screenshot contains a small table; a maximum-size workbook at every width remains **NOT TESTED**.
- **Long-page concern:** a read-only check with existing fixed accounts measured Principal communication at **10,021px** for 21 cards at 390px. The bottom-of-page More pages control remained in the viewport and navigated successfully. This is navigable but requires substantial scanning; the all-updates query/render is not paginated. The old screenshot's 9,220px height is historical, not the current measurement.
- **Touch consistency:** measured Acknowledge height 40px, attendance window buttons 42px and Teacher class buttons 38px in selected states, despite a general 44px styling goal. This is a consistency/usability finding, **not a claim of failing WCAG's minimum target criterion**.

Screen-reader assistive-technology sessions, family usability acceptance, color-vision review, all combinations of expanded forms, all contrast pairs and fluent interface wording review remain **MANUAL REVIEW REQUIRED / NOT TESTED** as applicable. No redesign was made.

## 10. AI studio results

**PASS:** actual `Ollama · gemma3:1b` returned a 3,246-character editable worksheet draft; live syllabus, exam, worksheet and lesson-plan forms all returned successful drafts. Provider selection stayed local. Inspected successful server request durations ranged approximately **15.7–24.4s** for the first four generation requests; this is development evidence, not a throughput guarantee.

Workbook upload/edit/export/reopen and invalid-file preservation passed. Copy success and clipboard-unavailable branches used a browser clipboard stub; the operating-system clipboard was **not independently certified**. The live suite's log does not independently prove the teaching-draft Download button; that specific export is **NOT TESTED** in this run.

Anonymous API access returned 401, Parent access returned 403, invalid Teacher input returned 400. The corrected school-notice probe independently checked Principal AI denial: HTTP 403. A separate probe intercepted 503/504/insufficient-memory HTTP responses and verified visible error/re-enabled Generate controls. **That was a simulated UI error test.** Real Ollama shutdown, 150-second timeout, absent model and actual memory exhaustion were not induced on the shared laptop. No cloud fallback was enabled. Generated educational correctness, answer keys, marks and age suitability require teacher review; successful generation is not factual acceptance.

**Bounded responsiveness measurements:** 18 selected 390/1440px navigations measured 631–850ms (median 742.5ms), including an explicit 200ms settling delay. Warm local development server, no simulated WAN latency, no concurrent user/load guarantee. Large attendance rosters, maximum workbooks and sustained AI concurrency were not benchmarked.

## 11. Online hosting readiness

**NOT READY for public release.** Compilation is ready; deployment acceptance is not.

Exact blockers: dependency review/patch and regression; inaccurate large-school Principal totals; local-only privileged APIs; Windows-only local speech worker; Ollama bound to the laptop; no reviewed distributed limits/provider quota system; no real SMS/IVR adapter/verified contacts/consent/cost stop; unverified hosted database migration/Auth redirect/backup/restore/monitoring procedures; unresolved pilot operations and physical device acceptance. The audit did not test hosted signup, mail recovery or hosting secrets. Local Auth's disabled signup is not evidence about any hosted project.

Keep the loopback/Host/Origin protections. Do not tunnel Ollama or expose the local device/account services as a deployment shortcut. The availability of an OpenAI branch or a cloud-labelled model in the local Ollama inventory is not authorization to use it. No hosted resources, payment method, real recipient, public endpoint or deployment was created.

## 12. Full test execution record

The table below is generated from the retained ledger. Times are **UTC on 9 November 2026**; add **05:30** for IST. Every npm/test command used the QA checkout unless explicitly labelled root build. Expectations are successful assertions and exit 0; dependency audit expects no outstanding advisory entries and therefore fails. Each log is relative to E. Automated execution counts are not counts of independent feature tests; repeated checks and overlapping suites are retained but not double-counted.

**Executed commands: 54; PASS 48; FAIL 6.** Failed attempts are retained, including subsequently passing reruns.

| # | Command | UTC start–end | Exit | Result | Evidence log |
|---:|---|---|---:|---|---|
| 1 | node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism | 08:49:16.858–08:49:50.218 | 1 | FAIL | 01-units.log |
| 2 | npm run typecheck | 08:49:50.219–08:50:00.946 | 0 | PASS | 02-typecheck.log |
| 3 | npm run lint | 08:50:00.947–08:50:23.014 | 0 | PASS | 03-lint.log |
| 4 | npm run build:isolated -- --working-tree | 08:50:23.287–08:51:33.063 | 0 | PASS | 04-build-isolated.log |
| 5 | npm audit --json | 08:51:33.065–08:52:13.850 | 1 | FAIL | 05-audit-dependencies.log |
| 6 | npm run verify:accounts | 08:51:50.442–08:52:04.537 | 0 | PASS | 05-verify-accounts.log |
| 7 | npm run verify:role-navigation | 08:52:04.538–08:52:25.046 | 0 | PASS | 06-verify-role-navigation.log |
| 8 | npm run verify:attendance | 08:52:25.047–08:52:26.399 | 0 | PASS | 07-verify-attendance.log |
| 9 | npm run verify:assignments | 08:52:26.400–08:52:27.374 | 0 | PASS | 08-verify-assignments.log |
| 10 | npm run verify:announcements | 08:52:27.375–08:52:28.348 | 0 | PASS | 09-verify-announcements.log |
| 11 | npm run verify:corrections | 08:52:28.349–08:52:41.781 | 0 | PASS | 10-verify-corrections.log |
| 12 | npm run verify:idempotency | 08:52:41.781–08:52:53.797 | 0 | PASS | 11-verify-idempotency.log |
| 13 | npm run verify:student-profile | 08:52:53.797–08:52:54.872 | 0 | PASS | 12-verify-student-profile.log |
| 14 | npm run verify:timetable | 08:52:54.873–08:53:06.249 | 0 | PASS | 13-verify-timetable.log |
| 15 | npm run verify:reliability | 08:53:06.249–08:53:17.391 | 0 | PASS | 14-verify-reliability.log |
| 16 | npm run verify:phase1 | 08:53:17.391–08:53:30.742 | 0 | PASS | 15-verify-phase1.log |
| 17 | node --env-file=.env.test.local .local/audit-20261109/verify-refinement.mjs | 08:53:45.401–08:54:09.886 | 0 | PASS | 16-probe-verify-refinement.log |
| 18 | node --env-file=.env.test.local .local/audit-20261109/verify-real-zoom.mjs | 08:54:09.886–08:54:44.913 | 1 | FAIL | 17-probe-verify-real-zoom.log |
| 19 | node --env-file=.env.test.local .local/audit-20261109/verify-family.mjs | 08:54:44.915–08:54:52.925 | 0 | PASS | 18-probe-verify-family.log |
| 20 | npm run verify:accessibility-i18n | 08:54:52.926–08:55:00.924 | 0 | PASS | 19-verify-accessibility-i18n.log |
| 21 | npm run verify:staff-localization | 08:55:00.924–08:55:19.116 | 0 | PASS | 20-verify-staff-localization.log |
| 22 | npm run verify:role-visuals | 08:55:19.117–08:55:38.293 | 0 | PASS | 21-verify-role-visuals.log |
| 23 | npm run verify:simple-blue-ui | 08:55:38.317–08:55:54.301 | 0 | PASS | 22-verify-simple-blue-ui.log |
| 24 | npm run test:homework-editor | 08:55:56.570–08:56:00.835 | 0 | PASS | 23-test-homework-editor.log |
| 25 | node --env-file=.env.test.local .local/audit-20261109/verify-real-zoom.mjs | 08:56:00.836–08:56:14.985 | 0 | PASS | 24-probe-verify-real-zoom.log |
| 26 | npm run verify:final-journeys | 08:56:53.743–08:57:40.453 | 0 | PASS | 26-verify-final-journeys.log |
| 27 | npm run test:rfid:integration | 08:57:40.454–08:57:44.570 | 0 | PASS | 27-test-rfid-integration.log |
| 28 | npm run test:gateway:local-integration | 08:57:44.591–08:58:05.480 | 0 | PASS | 28-test-gateway-local-integration.log |
| 29 | npm run test:translations:integration | 08:58:05.481–08:58:56.717 | 0 | PASS | 29-test-translations-integration.log |
| 30 | npm run test:fallback:integration | 08:58:56.725–08:59:23.775 | 0 | PASS | 30-test-fallback-integration.log |
| 31 | npm run test:attendance-insights:integration | 08:59:23.790–08:59:49.271 | 0 | PASS | 31-test-attendance-insights-integration.log |
| 32 | npm run verify:reconnect | 08:59:49.308–09:00:19.176 | 0 | PASS | 32-verify-reconnect.log |
| 33 | npm run verify:simple-voice | 09:00:19.177–09:00:40.187 | 0 | PASS | 33-verify-simple-voice.log |
| 34 | node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko | 09:00:40.188–09:01:34.608 | 0 | PASS | 35-voice-all.log |
| 35 | node --env-file=.env.test.local .local/audit-20261109/environment.mjs | 09:00:58.872–09:01:04.214 | 0 | PASS | 34-probe-environment.log |
| 36 | npm run verify:communication-local | 09:01:34.609–09:02:08.414 | 0 | PASS | 36-verify-communication-local.log |
| 37 | npm run verify:teacher-ai | 09:02:08.416–09:03:51.416 | 0 | PASS | 37-verify-teacher-ai.log |
| 38 | node --env-file=.env.test.local .local/audit-20261109/login-and-layout.mjs | 09:04:08.480–09:04:09.443 | 1 | FAIL | 38-probe-login-and-layout.log |
| 39 | node --env-file=.env.test.local .local/audit-20261109/offline-and-homework.mjs | 09:04:09.444–09:04:26.195 | 0 | PASS | 39-probe-offline-and-homework.log |
| 40 | node --env-file=.env.test.local .local/audit-20261109/login-and-layout.mjs | 09:05:01.871–09:05:27.900 | 0 | PASS | 40-probe-login-and-layout.log |
| 41 | node --env-file=.env.test.local .local/audit-20261109/fixed-layout.mjs | 09:05:27.902–09:05:36.013 | 0 | PASS | 41-probe-fixed-layout.log |
| 42 | node --env-file=.env.test.local .local/audit-20261109/preserve-school.mjs | 09:05:36.030–09:05:36.598 | 0 | PASS | 42-probe-preserve-school.log |
| 43 | node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism | 09:05:36.599–09:06:13.340 | 0 | PASS | 43-units.log |
| 44 | npm run typecheck | 09:06:13.341–09:06:18.252 | 0 | PASS | 44-typecheck.log |
| 45 | npm run lint | 09:06:18.253–09:06:37.391 | 0 | PASS | 45-lint.log |
| 46 | npm run build:isolated -- --working-tree | 09:06:37.394–09:08:18.734 | 0 | PASS | 46-build-isolated.log |
| 47 | node --env-file=.env.test.local .local/audit-20261109/ai-errors.mjs | 09:08:43.951–09:08:48.745 | 0 | PASS | 47-probe-ai-errors.log |
| 48 | node --env-file=.env.test.local .local/audit-20261109/large-feed.mjs | 09:08:48.746–09:09:04.913 | 1 | FAIL | 48-probe-large-feed.log |
| 49 | node --env-file=.env.test.local .local/audit-20261109/preserve-school.mjs | 09:09:04.914–09:09:05.603 | 0 | PASS | 49-probe-preserve-school.log |
| 50 | node --env-file=.env.test.local .local/audit-20261109/school-notice.mjs | 09:11:30.982–09:12:05.483 | 1 | FAIL | 50-probe-school-notice.log |
| 51 | node --env-file=.env.test.local .local/audit-20261109/preserve-school.mjs | 09:12:05.499–09:12:06.181 | 0 | PASS | 51-probe-preserve-school.log |
| 52 | node --env-file=.env.test.local .local/audit-20261109/notice-labels.mjs | 09:18:15.450–09:18:20.367 | 0 | PASS | 52-probe-notice-labels.log |
| 53 | node --env-file=.env.test.local .local/audit-20261109/school-notice.mjs | 09:21:16.340–09:21:29.819 | 0 | PASS | 53-probe-school-notice.log |
| 54 | node --env-file=.env.test.local .local/audit-20261109/preserve-school.mjs | 09:21:29.825–09:21:30.341 | 0 | PASS | 54-probe-preserve-school.log |

Final unique Vitest coverage: **295 passing non-integration tests in 33 files**, plus **3 passing integration scenario tests** in separate files. The original 294/295 run remains failed. Account acceptance comprises 18 scenario groups outside Vitest. Native voice comprises 10 samples. Translation/local communication runs overlap and are not independent evidence of more languages.

Historical failures retained: missing language provider; locked in-tree zoom browser profile/Turbopack panic; restarted-server startup race; npm advisory findings; large-feed total mismatch; extra school-notice probe's exact-label timeout. The first two received harness-repair approval. The startup probe was rerun without weakening assertions. A follow-up notice-form accessibility snapshot shows combobox name “Priority” but Playwright's exact `getByLabel` matches zero elements. The owner separately approved changing the audit probe to its exact accessible combobox role/name; the complete publication rerun passed. The application was not changed. No failing product assertion was changed to obtain PASS.

**Reproducibility:** use the documented isolated QA checkout/local env and correct server mode; never run DB scripts from the production-env developer checkout. Start the guarded account server for `verify:accounts`; stop that owned server and start the guarded simulator server for connected/RFID/fallback tests. Wait for HTTP 200 before testing. Run the commands in the ledger sequentially, preserving logs and synthetic cleanup. For live AI add `VERIFY_TEACHER_AI_LIVE=1`; for native four-language samples use `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko`. In the developer checkout use only `npm run build:isolated -- --working-tree`, never raw `next build`.

Audit-specific probes are archived in `E/probes/` with hashes. They are not new product features or established release gates. The large-feed probe intentionally exits 1 on the current defect and cleans its exact 1,001 inserted rows before normal fixture cleanup. Do not use unfiltered `verify:website`, which includes seeding. Legacy `verify:presentation` was **NOT TESTED**: inspection found obsolete Demo-campus and Teacher manual-translation expectations and a default persistent fixture path. These should be reviewed separately, not silently trusted or repaired during this audit.

## 13. Bugs and risks, ranked

### AUD-01 — P1: Principal communication totals silently truncate

- **Portal/routes:** Principal home and communication; `src/components/schovera-app.tsx` Principal `refresh`/`important`/`communicationCoverage`; `supabase/config.toml` API `max_rows=1000`.
- **Reproduce:** isolated synthetic school; create 1,001 extra Important messages alongside its one original Important message; query exact persisted count; sign in as that school's Principal and read Important sent.
- **Expected:** 1,002. **Actual:** principal query returns 1,000 and rendered metric says 1,000. No warning that the count is partial. Acknowledged/awaiting/coverage also derive from that limited array and can be affected; those alternative distributions were not separately reproduced.
- **Evidence:** LARGE, `large-feed.json`, probe source/hash. Temporary rows/accounts cleaned; protected hashes unchanged.
- **Confirmed cause:** client computes whole-school statistics from an unpaginated SELECT subject to the API row cap.
- **Recommended fix:** authorized exact server-side aggregates or complete bounded pagination with explicit coverage semantics; paginate the feed separately. Preserve correction-effective and acknowledgement rules/RLS. Add >1,000-row regression including acknowledged/corrected distributions. **Effort: Medium.** Not fixed.

### AUD-02 — P1 requirement gap: attendance/notice durable offline synchronization is absent

- **Affected:** Teacher attendance/send; requested offline school-server/cloud architecture.
- **Reproduce:** abort attendance RPC in the owned synthetic browser, edit Present, Save, reload. Abort send RPC, send, reload, explicitly retry.
- **Expected under the requested offline-first requirement:** durable queued attendance/notices, pending sync status, restart recovery and later replica synchronization.
- **Actual:** attendance save fails and reload restores persisted Absent. Message recovery is manual same-tab sessionStorage; no school-to-cloud outbox. No false save success was observed.
- **Evidence:** HW/OFFLINE; source `saveAttendance`, `persistPendingSend`; gateway tests demonstrate the separate RFID implementation only.
- **Confirmed cause:** direct Supabase RPC attendance writes and per-tab pending send state; no general durable replication service.
- **Recommended fix:** first agree whether this is required for competition. Explain the supported RFID-only offline boundary now; if general offline writes are required, design/implement separately with conflicts, authorization, retention and restart tests. **Effort: Large.** Not implemented in this audit.

### AUD-03 — P1 release risk: dependency audit remains non-green

- **Affected:** framework/validation/toolchain, all public deployments.
- **Reproduce:** `npm audit --json` with current lockfile.
- **Expected:** reviewed, patched dependencies; no unexplained critical/high findings. **Actual:** 1 critical/1 high/8 moderate package entries, exit 1.
- **Evidence:** `05-audit-dependencies.log`; primary advisories and applicability in section 8.
- **Confirmed cause:** installed version ranges; application exploitability is **not confirmed**. Existing sharp override mitigates the advisory's image path; no cache/Server Action feature use was found.
- **Recommended fix:** separately approved compatible patch review, lockfile update and full regression; do not downgrade ESLint config or run blind audit-fix. **Effort: Medium.** No patch made.

### AUD-04 — P2: RFID development launcher inherits unrelated shell credentials

- **Affected:** `scripts/dev-rfid-local.mjs` launcher/environment isolation.
- **Reproduce safely:** set a harmless synthetic shell API-key sentinel; inspect the launcher source's `env: process.env` inheritance. This audit observed inherited API-key variable **names**, without reading values.
- **Expected:** OS allowlist plus explicit approved local values. **Actual:** arbitrary shell names can enter the server. Source confirms the account launcher already uses an allowlist.
- **Evidence:** launcher source; audit controlled-launcher archive. No claim of a leaked key or paid request.
- **Confirmed cause:** wholesale child environment inheritance.
- **Recommended fix:** apply an allowlist and synthetic sentinel regression to the existing launcher in a separate approved change. Audit-only controlled launch mitigated later runs. **Effort: Small.** Product launcher unchanged.

### AUD-05 — P2: mobile full communication feed requires excessive scanning

- **Affected:** Principal `/principal/communication`, 390px.
- **Reproduce:** existing fixed account, 21 records, scroll full feed. **Expected:** bounded/discoverable review. **Actual:** 10,021px page; no pagination/search through this feed. Sticky More pages works at the bottom, so navigation is not broken.
- **Evidence:** `fixed-layout.json`; old 9,220px screenshot inspected separately; source renders all communication rows.
- **Confirmed cause:** full-array mobile card layout. Recommend bounded pagination and preserve accessible filters, sharing the AUD-01 data-access correction. **Effort: Medium.** No redesign made.

### AUD-06 — P2 environment risk: auxiliary local services unhealthy

- **Affected:** local Vector logging; exited edge runtime.
- **Reproduce:** Docker inspect. **Expected:** intended stack health known. **Actual:** Vector restarting/unhealthy, edge runtime exited; API/Auth/PostgreSQL remained healthy.
- **Evidence:** `environment.json`. **Cause: unknown**, no log-content or configuration repair attempted.
- **Recommended fix:** diagnose required auxiliary services separately before operational acceptance; do not claim healthy logging from core API success. **Effort: Small/unknown pending diagnosis.**

### AUD-07 — P3: screenshot evidence descriptions disagree

- **Affected:** refined `README_FOR_GPT.md` versus `pack-audit.json`.
- **Reproduce:** compare overflow counts. **Expected:** same final-run metadata. **Actual:** README 1, final pack audit 0; current executed route checks found 0.
- **Evidence:** original files/hashes; VIS and 320; actual workbook export test.
- **Confirmed observation:** the counts disagree. **Suspected cause:** README reflects an earlier capture stage; exact generation order was not re-executed. Regenerate metadata from one final manifest. **Effort: Small.** Files preserved.

### AUD-08 — P3: touch-control heights are inconsistent

- **Affected:** Parent acknowledge/period controls; Teacher class choices.
- **Reproduce:** inspect measured 390px controls. **Expected design goal:** consistent 44px primary touch controls. **Actual:** selected buttons 38–42px; no overlap observed.
- **Evidence:** `login-and-layout.json`, current screenshots. **Confirmed cause:** computed control geometry; exact winning CSS declarations not exhaustively traced. Review targeted selectors without changing all spacing blindly. **Effort: Small.** Not a demonstrated WCAG minimum-target violation.

### Resolved harness findings; not product fixes

**H-01:** homework-editor test lacked `I18nProvider`, failing before its assertions; approved provider wrapper restored the unchanged stale-edit test. Original 294/295, targeted 1/1 and final 295/295 runs retained. **H-02:** zoom browser profile under the watched source tree caused a locked-file Turbopack panic; approved external owned temp profile resolved it and was cleaned. **H-03:** an audit probe raced QA restart, got connection refused, then passed after readiness. **H-04:** the extra notice probe's exact-label locator failed despite the live accessibility tree naming the combobox Priority; the approved exact role/name locator passed the complete publication rerun. No application code change was used for these runs. The stale legacy presentation harness remains unexecuted/unrepaired.

**P0:** no confirmed breach, record loss or severe integrity incident was found in the tested scope. This is not proof that none exists outside that scope.

## 14. Pending work

- **Software:** AUD-01 exact totals; AUD-03 dependency review; AUD-04 launcher allowlist; decide AUD-02 requirement. Smaller usability/evidence issues AUD-05/07/08. Review legacy presentation assertions and required auxiliary services. Only approved harness fixes were made.
- **Manual acceptance:** student rehearsal; actual speaker/headset/projector sound; fluent Hindi/Marathi/Korean semantics and pronunciation; teacher review of generated materials; screen-reader/family usability; final presentation wording clearly separating simulation from physical evidence.
- **Hardware:** Pi/reader/board/voltage/key custody/storage/power/network and synthetic bench acceptance; none supplied or tested.
- **Hosting:** separately authorized projects/resources/secrets, signup/redirect/recovery, secure account administration, hosted speech/AI choices, limits/monitoring/backup/restore/retention and independent security acceptance. Do not remove loopback gates.
- **Optional future scope:** real SMS/IVR and additional automation only after provider/consent/cost approval. They are unnecessary for an honest laptop-local software presentation and are not activated here.

## 15. Recommended next actions — maximum five

1. **Fix and regression-test AUD-01** before claiming accurate school-wide communication totals; include >1,000 records, corrections and acknowledgement distributions.
2. **Approve a focused dependency patch** and re-audit/regress. Keep public deployment blocked meanwhile; retain the existing sharp mitigation.
3. **Agree the offline presentation boundary:** demonstrate the tested durable RFID queue and local database workflow; do not promise queued cloud attendance/notices unless separately implemented and accepted.
4. **Finish a supervised presentation rehearsal:** fluent four-language listening/translation checks, sound-output check, teacher factual review and student explanation of local/simulated limitations. Use the protected presentation accounts, not accumulated QA fixture classes.
5. **Harden the local handoff:** approved launcher allowlist, known required service health, reproducible startup, synchronized evidence metadata and bounded mobile communication review. Keep hosted/pilot work separate unless explicitly required and authorized.

## 16. Final verdict

**What works:** local role-scoped communication, acknowledgement/reconnect, authorized attendance/homework/timetable, account creation in its guarded mode, reviewed/automatic translation with tested safeguards, actual local/native speech execution, live Ollama drafts, workbook edit/export, and durable synthetic RFID v2 synchronization to local Supabase.

**What fails:** Principal large-school message totals; dependency audit acceptance; the requested general attendance/notice durable offline-to-cloud capability is absent. Auxiliary service health is incomplete. Initial harness/startup failures are retained even though approved repairs/rerun succeeded.

**What is untested:** physical hardware/site operation, public deployment/sync, real SMS/IVR, real AI failure exhaustion, every possible form/filter/data-size state, full assistive-technology acceptance and human language/pronunciation quality.

**Can a Grade 7 student demonstrate it safely?** Yes, conditionally, with synthetic local accounts, supervision, rehearsed services/audio and honest scope. Do not call it a real student pilot or claim accurate unlimited school-wide totals.

**Can offline software be demonstrated without hardware?** Yes: synthetic durable RFID queue/restart/replay to the isolated local API/database. That is not public cloud synchronization or Pi durability evidence.

**Minimum remaining competition work:** address or explicitly disclose the Principal totals defect, resolve the dependency release risk, confirm which offline claim is required, and complete human language/audio/student rehearsal. A public launch, paid notification provider and physical pilot are separate decisions, not prerequisites for showing the tested local software honestly.

No application fix, schema change, reset, production environment access, password rotation, hosted write, push or deployment was performed. The owner-approved test provider repair and this report are the intended tracked checkpoint; ignored evidence and unrelated files stay out of the commit.
