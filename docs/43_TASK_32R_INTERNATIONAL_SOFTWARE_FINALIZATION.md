# Task 32R — International software finalization

## Baseline and initial gap analysis (2026-10-21)

Initial branch `test/task32p-final-software-audit`, HEAD `af61329db694cf49533047fc4823d5a87b3b0546`; tracked state clean. Protected untracked instructions/logs/review and the ignored private credential guide are preserved. Task 32P is an ancestor. No Task 32Q branch, matching commit or implementation was found locally; its safe local preparation/online isolation design is included here, **not cloud deployment**. Branch: `feat/task32r-international-software-finalization`.

This matrix is the **initial source audit**, not a claim of new passing tests. Final evidence is added below as checks execute.

| Requirement | Initial classification | Source / test evidence to rerun | Task 32R action |
|---|---|---|---|
| Role dashboards, navigation, session/logout | Fully implemented with previous verification | Schovera shared shell; role-navigation/reconnect | Fresh connected/browser verification |
| School/class/linked-child security | Fully implemented with previous verification | RLS migrations; phase1/v2/translation/fallback/insights integration | Rerun denial cases, preserve policies |
| Student records/profile | Fully implemented with previous verification | Student overview; verify:student-profile | 20-person roster and browser checks |
| Attendance/corrections/insights | Fully implemented with previous verification | Attendance RPC; rules; verify:attendance/test:attendance-insights | Coherent fictional patterns, correction regression |
| Homework | Implemented, edit capability requires audit | Assignment RPC/UI; verify:assignments | Browser create/edit capability truthfully recorded |
| Timetable | Fully implemented with previous verification | Timetable RPC/conflicts; verify:timetable | Two-class weekly schedule; browser management |
| Important updates/corrections/acknowledgements | Fully implemented with previous verification | Immutable-update RPCs; verify:corrections/idempotency | Full three-role flow |
| Teacher draft/Principal translation approval | Fully implemented with previous verification | communication_translations RLS/version checks | Hindi/Marathi fixture workflows; original preserved |
| Fully localized entire UI | Implemented but requiring correction / partial legacy copy | i18n dictionaries versus hardcoded staff/profile strings | Record exact scope; no blanket full-localization claim |
| Browser voice | Implemented; audible output blocked by device/voice availability | parent-speech controller and mocked/browser tests | Inspect stalled/error transitions; AUDIO NOT VERIFIED unless actually heard |
| Automatic translation | Missing; local model suitability unverified | Installed Ollama model inventory; no translation endpoint | Synthetic local investigation only; block if unsuitable |
| Teacher AI / spreadsheet | Implemented with local-service dependency | Teacher-only API; lazy workbook import; verify:teacher-ai | Live local model where available; export checks |
| SMS/IVR | Simulated | Fake provider, consent/delivery tables, test:fallback | Consent/retries/scope; no actual provider |
| Offline gateway / assignment-bound v2 | Implemented local software, synthetic observations | SQLite WAL, signed endpoint, gateway/RFID suites | Restart/sync/replay/revocation; no hardware |
| Entry panels / polling | Fully implemented with previous verification | RLS reads, foreground scheduler | Fictional scans and per-role isolation |
| Low-bandwidth web performance | Missing measurements | No Task 32P throttled evidence | Measure controlled slow-link initial load and navigation |
| Offline Parent/Teacher browser | Partial in-memory loaded state; no durable offline app | No service worker/private offline cache | Test disconnect/logout; no uncontrolled personal-data caching |
| Mobile / accessibility | Implemented with previous bounded checks | 22 routes × four widths; accessibility/i18n | Fresh screenshots/keyboard/labels; no certification claim |
| Demo data | Implemented but requiring correction | Two-child manual fixture | Idempotent owned 20-fictional-student provisioning |
| Isolated build/local launcher | Fully implemented with previous verification | build:isolated / dev:simulators-local | Preserve production-env exclusion; dedicated audit server |
| Separate online demo | Documentation only / authorization blocked | No Task 32Q found | Preflight/template/runbook; no resource creation or deployment |
| Dependency/API security | Production patch present; dev advisory previously open | Next16.3.8; npm audit; endpoint guards | Fresh audit, no blind major downgrade |
| Pilot/impact/business | Documentation only | Task32O explicitly hypothetical plan | Student-friendly explanation without invented outcomes |

## Execution plan

1. Local-only 20-student demo, owned journal/reset, explicit Demo Environment label.
2. Speech failure handling and deterministic tests; local translation suitability probe.
3. Measured slow-link/browser journeys and current regression suites, with failures classified.
4. START_HERE, student handbook, online approval/preflight materials, final evidence and isolated build.

No historical migration edits, production configuration, paid service, real student, hardware, push, merge or deployment are in scope. One new, reviewed homework-edit migration was applied locally. No repository removals were justified by usage evidence.

## Implementation and CEO requirement coverage

| Area | Final software status / evidence | Boundary |
|---|---|---|
| Parent, Teacher, Principal workspaces | Existing 22 destinations checked again at four widths; separate sessions, role/account switching and linked-child context verified | Not a claim of universal usability or device certification |
| School identity | Header, page hero and student profile now use the authenticated school's RLS-readable name instead of a hardcoded school | No privileged browser reader |
| Attendance | Fixed stale focus/Realtime reads overwriting unsaved status selections; deterministic held-response regression and save/insight checks | Classroom attendance still separate from entry observations; not a new multi-editor locking policy |
| Homework | Author-only create/edit UI and transactional edit RPC; stale-version rejection, same-payload retry and concurrent edit tests | Existing author, active assignment and school checks; no browser table-write expansion |
| Timetable and notices | Principal creation/edit, conflicts, cross-role reads and school announcements verified | Owned synthetic school only |
| Important updates | Teacher send, correction history, acknowledgement once, Principal coverage and reconnect verified | Acknowledgement is not proof of understanding |
| Translation | Teacher draft, Principal review, source/version invalidation, original/approved/fallback and child isolation passed | Manual workflow; no automatic translation or linguistic-quality certification |
| Voice | Added never-start timeout, late-callback suppression and exception-safe controls; 17 tests plus browser controls passed | Browser reported zero installed voice locales: **AUDIO NOT VERIFIED** |
| Teacher AI and workbook | Existing local Ollama generation passed once with a 2,600-character draft; browser import/edit/export passed at 390px | Draft requires review; workbook is a basic local editor, not full Excel fidelity |
| AI API boundary | Strict input schema, 16 KiB streaming/declaration limit and hosted-demo disabled state; four route tests | No local-model tunnel, paid API or hosted model service |
| Entry records and polling | Synthetic signed v2 observations, role RLS, foreground polling and recovery tests passed | Not identity, presence, attendance or safety evidence; no physical reader |
| Offline gateway | Existing durable SQLite queue, restart/crash windows, signed local sync, deduplication/revocation tested again | Laptop software only, not electrical or physical power-loss durability |
| SMS/IVR | Consent, opt-out, fake delivery status, retries, deduplication and role denial passed | **SIMULATED**, no phone call or SMS sent |
| Low-bandwidth/offline browser | Controlled throttled Parent/Teacher navigation and offline logout/reconnect checked | No persistent offline school-data cache or remote-alert promise |
| Pilot/impact/business | Existing hypothetical plan preserved; handbook distinguishes objectives from measured outcomes | No school approval, measured learning benefit, partnership or validated price claimed |
| Separate hosted demo | Pure preflight, placeholder template and explicit approval checklist added | No Task 32Q implementation found locally; no cloud resources or acceptance |

### Confirmed application fixes

1. An attendance GET already in flight could return after a local choice and restore the old value before save. `attendanceDirtyRef` and request generations now protect the unsaved register; class/date/roster changes reset the scope deliberately. The presentation regression holds a real stale response, changes Absent to Present, releases the response, then saves and checks insights.
2. Homework had no supported edit journey. `20261021100000_edit_class_homework.sql` adds `edit_class_assignment` with active Teacher/author/class/school checks, row lock, school-local date validation, optimistic timestamp conflict detection, monotonic version time and audit. PUBLIC execute is revoked; authenticated callers still undergo RPC checks. Concurrent differing edits allow one winner. Identical payload retry adds no duplicate edit.
3. Background assignment refresh could remount an editor or advance its expected version. The editor retains the version captured at opening and its local draft; class changes remount intentionally. A focused component test verifies a stale save remains a conflict.
4. Speech engines that never emitted `onstart` could leave Preparing indefinitely. An eight-second startup watchdog fails honestly and ignores late callbacks; pause/resume/cancel errors are handled. This does not detect a muted speaker.
5. Hardcoded school identity was misleading for the new fictional campus. It now comes from the caller's permitted school relationship.
6. Hosted-demo preparation now explicitly disables Teacher AI on both the server and UI; malformed/extra-field/oversized requests are rejected before inference. Existing authorization remains in place.

### Fictional presentation data

`scripts/presentation-demo.mjs` provisions one journal-owned **Schovera Model School — Demo Campus**, 7A/7B with ten students each, one Principal, two Teachers, ten guardian accounts and two negative-test accounts. All 20 student names match the requested fictional roster. Guardian links are fictional wards, not a biological-family claim.

Initial provisioning creates 200 historical attendance rows (ten dates), explainable absence/late/improvement patterns, six homework assignments, 36 timetable periods, classroom communication, approved-workflow Hindi/Marathi fixtures, pending/acknowledged examples, official notices, consented fake notification history and 20 signed synthetic entry observations. The source communication is not overwritten. A repeated completed provisioning call verified exactly 20 students and made no duplicate writes. Browser QA deliberately changes this owned fixture; it is not an immutable screenshot dataset.

Generated random account passwords, device/issuer keys and manifests stay ignored under that worktree's `.local/`. They are not reproduced here or in the student handbook. `demo:credentials` is a private local command. Cleanup verifies the owned `MANUAL-<run>` school code and exact journal IDs; it does not erase another developer's school. The pre-existing personal-demo worktree and private testing guide were preserved.

## Voice and automatic-translation investigation

The real browser speech API was present but exposed **zero voice locales** in the tested automated Windows browser. Control/selection/error/state tests use a mock engine. A person has not heard English, Hindi or Marathi output: **AUDIO NOT VERIFIED**. The handbook requires actual presentation-laptop voice, output-device and volume rehearsal and provides a text fallback.

Only an already-installed loopback Ollama service was used. No model was downloaded and no cloud model was invoked. Synthetic probe source: “School is NOT closed tomorrow. Bring your library notebook at 09:00.” `gemma3:1b` returned HTTP 200 in approximately 11,189 ms, but reversed the negation (said school would not be held) and produced the same Hindi text for the Hindi and Marathi fields. This is an unacceptable semantic error. Installed `qwen2.5:7b` failed allocation (HTTP 500, approximately 2,364 ms); a CPU retry also failed, requiring 4.1 GiB with 3.9 GiB available (approximately 3,473 ms). Automatic translation was therefore **not enabled**. No inaccurate model output is presented as approved translation.

Hindi/Marathi presentation fixtures are human-entered workflow examples, not evidence of fluent human review. The actual Teacher draft → Principal approval → Parent translated/original display, acknowledgement identity, source correction invalidation and access-denial flows passed. Full legacy staff/profile copy is not entirely localized; English strings remain, including the new staff homework editor. Do not claim complete three-language coverage of every page.

## Low-bandwidth and offline evidence

CDP throttling: 150 ms latency, 128 KiB/s download and 64 KiB/s upload (approximately 1 Mbps/512 Kbps), cold browser cache, Next **development** server. These are observed test timings, not production targets or before/after optimization gains.

| Role | Initial login form | Signed-in key navigation | Encoded bytes, load/login/navigation combined |
|---|---:|---:|---:|
| Parent | 10,451 ms | 885 ms to Updates | 1,245,775 |
| Teacher | 10,449 ms | 981 ms to Attendance | 1,241,832 |

The cold development load remains material. A deployed optimized preview needs its own controlled performance/bundle measurement after approval. Existing lazy workbook/AI loading was preserved, not claimed as a newly measured speedup. Background refresh no longer destroys a homework draft or attendance choice; no unsupported bandwidth-improvement percentage is claimed.

Both throttled roles signed out while browser-offline: private cards/register/profile disappeared; after reconnect and reload the login screen remained and no prior role content returned. Existing reconnect tests separately covered missed updates/acknowledgements, multi-child isolation and role refetch. This is not a fully offline web application: no service worker or durable browser cache of private school data was added. The gateway-to-local-server outage queue is a separate tested process, not remote family delivery during total outage.

## Security, dependencies and environment isolation

- Local Supabase only; **31 migrations** after the new homework RPC. Existing production data and `.env.local` were not opened, copied, loaded, hashed or edited. Next servers ran only from disposable checkouts without that file.
- Integration cases retain Parent linked/unlinked-child, Teacher assigned/unassigned-class, Principal same/cross-school and anonymous denial. Browser roles still cannot access device credentials/receipts or write raw entry events. No RLS policy was widened.
- New homework tests deny Parent, Principal and non-author Teachers; reject invalid title/past due date/stale edits; verify retry/concurrency. No classroom attendance is derived from an RFID observation.
- Hosted preflight tests validate HTTPS/distinct owner-supplied project references but authorize neither seeding nor deployment. Hosted service/issuer/provider keys remain absent. No public ingestion or telephony route was enabled.
- Presentation browser contexts rejected external destinations; tests scan for local service-role leakage without printing it. Isolated build uses synthetic leakage sentinels, not production-secret values. These checks are not a comprehensive penetration test or OS-level network sandbox.
- Fresh audit initially found six high findings, including a new Vite Windows editor-launch issue. Vite was pinned to compatible **7.3.7** using an override; see the [primary advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm). No major upgrade/downgrade or new dependency was added. Related optional Rollup lockfile entries updated with the resolution.
- Final `npm audit`: **five high, zero critical**; `npm audit --omit=dev`: **zero findings**. Remaining high chain: `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. Registry inspection still reported braces 3.0.3, with no compatible patched release selected. The audit's suggested Next lint-config major downgrade was not applied. This residual tooling risk remains documented, not declared resolved. Next stays 16.3.8; zero production audit findings do not certify its runtime or future advisories.

## Test execution and failure classification

The first full batch retained three failures instead of silently replacing its record:

| Initial failure | Classification / action | Subsequent evidence |
|---|---|---|
| `verify:phase1` initial Realtime preflight timeout | Transient readiness/environment; no missing server mislabelled as product bug | Independent `npm test` alias passed; final explicit command rerun recorded separately |
| `verify:local-i18n-reconnect` waiting for Principal Awaiting item | Initial browser/realtime timeout; exact cause not independently isolated | Final independent complete Marathi reconnect/acknowledgement/metric/persistence run passed; do not claim root cause proved |
| `verify:final-journeys` Present returned to Absent before save | Confirmed stale-read application bug | Dirty-draft/request-generation fix and deterministic held-response presentation regression passed; final journey result below |

Additional development findings: the homework editor remount was a genuine application defect and has a focused regression; stale translation/timetable locators and non-unique controlled titles were test defects corrected without relaxing role/state assertions. An overbroad intermediate edit caused three TypeScript undefined-variable errors outside homework loading and was corrected before the final run. Overlapping dependency installs briefly removed CLI binaries; a single completed `npm ci` restored the exact lockfile. Memory pressure with two Next servers, Docker, Chromium and a model left only about 43 MB free; the redundant server/model were stopped. One lint attempt exited without diagnostics under that pressure, followed by an independent passing lint. These are not hidden passing runs or evidence of production incidents.

### Supported checks and reproducible matrix

`npm run verify:task32r` records every command's exit/duration, continues failures and exits nonzero if any fail. It contains **37 commands**, including `npm test` (the Phase 1 alias, not an extra set of unique unit tests). Final evidence is recorded below after completion.

| Check family | Commands / individual focused test counts |
|---|---|
| New regression units | `test:release-preflight` 8; `test:homework-editor` 1; `test:hosted-demo` 4 |
| Existing focused units | `test:rfid` 22; `test:gateway` 43; `test:credential-attribution` 20; `test:entry-polling` 4; `test:parent-voice` 17; `test:translations` 2; `test:fallback` 10; `test:attendance-insights` 21 |
| DB/RPC checks | `verify:attendance`, `verify:announcements`, `verify:assignments`, `verify:corrections`, `verify:idempotency`, `verify:student-profile`, `verify:timetable`, `verify:reliability`, `verify:phase1`, `npm test`, `test:translations:db` |
| Integration | `test:rfid:integration`, `test:gateway:local-integration`, `test:translations:integration`, `test:fallback:integration`, `test:attendance-insights:integration` |
| Browser/regression | `verify:reconnect`, `verify:role-navigation`, `verify:accessibility-i18n`, `verify:parent-voice`, `verify:role-visuals`, `verify:teacher-ai`, `verify:local-i18n-reconnect`, `verify:final-journeys` |
| Static | `typecheck`, `lint`, `git diff --check` |
| Additional | `verify:presentation`; audit full/production-only; local DB lint/status/migration list; `build:isolated` |

The focused suites contain **152 tests**, plus three separate Vitest integration scenario tests. Shell/browser scripts assert many more cases but are counted as commands, not invented individual test totals. Initial live Teacher AI passed with the installed model; the final gate's Teacher AI rerun deliberately disabled live inference after unloading the model and still checked authentication, input rejection and workbook UI/export. Audible speech, physical reader/Pi power loss, paid telephony, hosted deployment, fluent translation review and real-school impact are **not tested**.

### Browser evidence

The fictional presentation completed 22 destinations × 390/768/1024/1440 px = **88 screenshots** and both slow-link/offline-logout journeys. Paths on this machine:

- `C:\Users\Om\AppData\Local\Temp\schovera-international-K6IMn1\.local\schovera-rfid-gateway\task32r-presentation\` — fictional presentation PNGs and `measurements.json`.
- `C:\Users\Om\AppData\Local\Temp\schovera-role-visuals-2026-10-21T17-44-15.814Z\` — final full role visual audit.
- `C:\Users\Om\AppData\Local\Temp\schovera-accessibility-i18n\` — accessibility/i18n browser captures.

Representative Parent desktop home, Teacher desktop homework and Principal 390px student views were visually opened after the complete automated overflow checks. Not all 88 captures were manually inspected. Captures contain fictional QA additions and development tooling; they are evidence, not polished public promotional screenshots. Temporary OS paths are not durable release artifacts and may be cleaned by Windows.

## Repository organization and cleanup log

`START_HERE.md` is the current repository map; README and safe-development documentation point to it. `docs/SCHOVERA_INTERNATIONAL_DEMO_GUIDE_FOR_AAROHI.md` is the mandatory student-friendly handbook (every role, two-presenter/backup scripts, 27 judge questions, glossary and troubleshooting). Older numbered plans remain historical evidence, not current feature acceptance.

No repository files were removed or archived: package-script and source/reference inspection did not establish that old migrations, fixtures or reports were unused. Protected pre-existing `AGENTS.md`, `CLAUDE.md`, `local-dev.err`, `local-dev.out`, `review/`, private guide and personal-demo worktree were preserved. Only Task 32R generated fixtures/temporary build snapshots may be cleaned by their exact ownership guards. No broad reset, stash or overwrite was used.

## Reproduction and release decision

Follow [START_HERE](../START_HERE.md) for exact PowerShell commands: start local Docker/Supabase on its loopback-only network, `npm run demo:isolated:prepare`, enter the exact printed worktree, apply reviewed `supabase migration up --local`, initialize only synthetic keys, start `dev:simulators-local -- --port 3100`, then `presentation:prepare`. Never run a raw build or Next server in a checkout containing production `.env.local`.

In that isolated worktree, with its local server running:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3100'
npm run verify:task32r
# Use a dedicated presentation fixture; this journey deliberately changes it.
npm run verify:presentation
# For a pristine rehearsal dataset, clean only that owned fixture and provision again:
npm run demo:clean
npm run presentation:prepare
```

For independent QA, use a second disposable checkout and another port, as this run did at 3101. Do not run overlapping dependency installs. Leave the original personal demo untouched. An Ollama service/model is optional; use synthetic input only and explicitly enable live verification when it is available. After browser work, stop the owned server/model to free memory, then run `npm run build:isolated` from a clean committed tree. The build installs offline inside its own snapshot; dependency cache and allowed Google Fonts access are prerequisites, not permission to use production credentials.

**Hosted release remains blocked.** [Separate online-demo preparation](42_ISOLATED_ONLINE_DEMO_PREPARATION.md) lists explicit project ownership, synthetic schema provisioning, preview acceptance, access/origin, retention and disable/rollback approvals. No cloud seeding tool was enabled by weakening local guards. A successful local build is neither production approval nor evidence of physical hardware, family voice availability, real telephony, school permission, legal review or measured impact.

### Final gate/build/cleanup record

Pending final process completion at this documentation checkpoint; replace this paragraph with observed results before final handoff. No pending test is represented as passed above.
