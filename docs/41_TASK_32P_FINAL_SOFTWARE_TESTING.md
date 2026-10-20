# Task 32P — Final local software testing and personal checklist

Baseline: `773c87a811f7a821b5a5d596f254405c7c2ebf02` (`docs/task32o-pilot-business-model`). Audit branch: `test/task32p-final-software-audit`. This is local, synthetic software evidence, not production acceptance, school permission, hardware validation or a guarantee of child safety.

## Feature inventory

Status describes checked-in implementation, not a promise that every browser, language or deployment is certified.

| Area | Feature | Status | Boundary / evidence |
|---|---|---|---|
| Authentication | Login/logout; Parent/Teacher/Principal sessions; session persistence; unauthorized route prevention | IMPLEMENTED | Authenticated role shell; role navigation, reconnect and connected journeys |
| Authorization | Parent linked/unlinked child; Teacher assigned/unassigned class; Principal own-school; anonymous denial | IMPLEMENTED | Database RLS and server-side RPC guards; local integration denial cases |
| Parent | Home; linked children; multi-child selection; Student Profile | IMPLEMENTED | Scoped requests, context-reset/stale-response and navigation checks |
| Parent | Important Updates/Notices; acknowledgement; homework; attendance; timetable | IMPLEMENTED | Persisted records and role browser/database checks; acknowledgement is not inferred from speech or delivery |
| Parent | English/Hindi/Marathi navigation and newer communication panels | IMPLEMENTED | Dictionary and browser tests |
| Localization | Entire legacy staff/student-profile/timetable interface translated | PARTIAL | Some legacy content remains English; do not advertise universal full-page translation |
| Communication | Teacher translation drafts; Principal review/approval; Parent approved translation / original | IMPLEMENTED | Separate source-bound reviewed records; draft protection and stale-source tests |
| Voice | Parent play/pause/resume/stop; unavailable fallback; original/translated language selection | IMPLEMENTED | Mock engine unit/browser tests only; audible quality and OS voice inventory require human testing |
| Teacher | Dashboard; assigned classes/students; Important Updates; corrections; acknowledgement coverage | IMPLEMENTED | Existing RPC/idempotency/correction/profile suites and real browser flow |
| Teacher | Attendance register/correction; homework; timetable; student records | IMPLEMENTED | Classroom attendance remains independent of RFID |
| Insights | Teacher and Principal explainable attendance patterns | IMPLEMENTED | Deterministic rules with recorded-day denominator and minimum-data guards; not prediction, diagnosis, punishment or automatic messaging |
| Principal | Dashboard; school communication/acknowledgement overview; reviewed translations; school data | IMPLEMENTED | Own-school RLS; actual-role browser journeys |
| Fallback | Parent opt-in/out and language preferences; authorized staff queues/status review | SIMULATED | No provider, telephone number, real SMS/call or proof of reading |
| Entry | Hardware-free RFID event creation and signed v2 ingestion | SIMULATED | Synthetic device only; local endpoint deliberately unavailable on hosted targets |
| Entry security | Immutable assignment/capability binding; revocation/reassignment; replay/idempotent receipts; unresolved outcomes | IMPLEMENTED | Local API/DB security tests; unresolved events do not become named visible records |
| Offline | SQLite durable queue, process restart, retry, local Supabase synchronization | IMPLEMENTED | Laptop-local fault/restart tests; not physical power-loss or Pi evidence |
| Entry views | Parent/Teacher/Principal visibility; foreground bounded polling; offline/manual refresh | IMPLEMENTED | RLS refetch remains truth; not instant delivery or classroom attendance |
| Accessibility | Labelled controls, keyboard/focus, semantic sections, responsive layout, loading/empty/offline/error states | IMPLEMENTED | Automated/browser checks are bounded, not WCAG certification |
| Usability | Low-literacy suitability, pronunciation, family comprehension, touchscreen and competition rehearsal | PARTIAL | Human checklist below is NOT TESTED until someone actually performs it |
| Deployment security | Patched Next/React, local-only guards, browser secret checks, isolated build | IMPLEMENTED | Local verification only; dependency findings listed separately |
| Hardware / hosted ingest / real notification | Physical reader, Pi deployment, public ingestion, real SMS/IVR | BLOCKED | Separate approvals, key custody, distributed limits, hardware tests and privacy controls required |
| Pilot/business/impact | School consent, retention, pilot measurement, costs and business model | DOCUMENTED ONLY | Task 32O assumptions are not measured pilot outcomes or signed school approval |

## Safe Windows personal-testing setup

Use **Node 22.13–22.x**, Docker Desktop Linux engine and the lockfile. Do not run the ordinary root development server: that checkout contains production `.env.local`. The following creates an owned disposable Git worktree of the committed audit version. It copies no developer environment files, existing `.local` databases or untracked artifacts.

In PowerShell window 1:

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
git status --short
docker info --format '{{.ServerVersion}}'
npx supabase --version
$networks = docker network ls --format '{{.Name}}'
if ($networks -notcontains 'schovera-local') {
  docker network create --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' schovera-local
}
npx supabase start --network-id schovera-local
# Do not paste Supabase status output: it contains local keys.
# Never use supabase link, remote db push, or a remote reset.
$demoPath = Join-Path $env:TEMP ('schovera-personal-' + [guid]::NewGuid().ToString('N'))
git worktree add --detach $demoPath HEAD
Set-Location $demoPath
if (Test-Path .env.local) { throw 'Unexpected private environment file; STOP' }
npm ci --offline
# If offline dependencies are unavailable, stop; review dependency installation separately.
node scripts/configure-local-supabase-env.mjs
git check-ignore .env.development.local .env.test.local
npm run rfid:capability-key:init
# The following sets a local model only; it does not download or invoke a cloud model.
$env:TEACHER_AI_PROVIDER = 'ollama'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'gemma3:1b'
$env:OPENAI_API_KEY = ''
npm run dev:simulators-local
```

Use **http://127.0.0.1:3000**, not a hosted URL. Keep window 1 running. The guarded launcher refuses `.env.local`, uses matching loopback app/test values, and supplies local server-only credentials. Never tunnel it, bind it to LAN, or share its enrollment/key files. Local Supabase is not hardened for public access. If startup fails or the port is already occupied, stop and inspect; do not run verifiers against an unidentified server. `npx supabase migration list --local` must show the existing migrations applied; pending migrations require deliberate local-only review, never remote push/reset.

In window 2, set the exact displayed `$demoPath` from window 1 (not the original checkout), then:

```powershell
Set-Location '<exact disposable worktree path from window 1>'
npm run demo:prepare
npm run demo:credentials  # Read PRIVATELY; never paste, screenshot, commit or publish.
npm run demo:info
```

Five unique synthetic local accounts are generated: Parent, Teacher, Principal, unlinked Parent and unassigned Teacher. Their fresh random passwords are stored only in the ignored, owned `.local/schovera-manual-demo/<run-id>/manifest.json`. No reusable credentials are documented. Use separate browser profiles/private windows per role; log out before changing accounts. The synthetic school contains two children/classes, Important Updates, an illustrative reviewed Marathi translation, homework, timetable and ten days of attendance. The translation's approval is a synthetic workflow fixture, **not evidence that a human verified its meaning**. Inspect the historical dates using `demo:info`; the latest absent day can be changed to Present through Teacher Attendance to remove its consecutive-absence pattern.

The issuer must be initialized before server startup. A failed preparation keeps an exact fixture journal: use `demo:clean` in that same worktree, then retry preparation after resolving startup. Do not edit `.env.local` or use `seed:demo` / `clean:demo` to reset shared data.

### Offline-to-local demonstration

In window 2, ensure no service-role/issuer/AI secret was manually exported. The gateway command intentionally refuses those inherited variables. It reads only its synthetic enrollment (device key, signed assignment capability and synthetic reader key), not Supabase or operator credentials.

```powershell
npm run demo:entry -- queue
npm run demo:entry -- offline
npm run demo:entry -- status  # A fresh process reopens the durable pending row.
npm run demo:entry -- sync
npm run demo:entry -- duplicate
```

Queue commits before local acknowledgement. `offline` injects a transport outage without disabling the dashboard's internet. `sync` signs the original v2 event and writes to the loopback API only; `duplicate` returns the same canonical receipt. View the selected child/class entry panel and refresh or wait for foreground polling. Switch to child B: A's row must disappear. Then test revocation:

```powershell
npm run demo:entry -- queue
npm run demo:revoke-card
npm run demo:entry -- sync
npm run demo:entry -- status
```

The second row must remain attention-required/unresolved, never silently reassigned or displayed as a named arrival. This is process-restart simulation, not physical hardware or power-loss validation. The enrollment capability has a bounded lifetime; if it expires, clean/reprepare the fixture rather than bypass expiry.

### Stop, clean and reset

Log out and close role tabs. In window 2 run `npm run demo:clean` **before** deleting the worktree. It checks the fixture's exact school identity, deletes only that owned synthetic school's records/accounts, verifies removal, and removes only its generated run directory. A failure retains the journal for investigation. Existing seeded local demo schools and other gateway queues are not reset. For fresh credentials, run `demo:prepare` again after successful cleanup.

Stop **your** Next server with Ctrl+C in window 1. Return to the original repository. Before removing the worktree verify the resolved target equals the exact path you created and is beneath your temporary directory:

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
$resolvedDemo = [IO.Path]::GetFullPath($demoPath)
$tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $resolvedDemo.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
    -not ([IO.Path]::GetFileName($resolvedDemo) -match '^schovera-personal-[0-9a-f]{32}$')) {
  throw 'Unsafe worktree removal path; STOP'
}
git worktree remove --force $resolvedDemo
# Optional ONLY if no other local development session uses this Supabase stack:
# npx supabase stop  (do not use --no-backup)
```

Do not delete the repository, original `.local` directory, protected untracked files or shared Docker volumes. A successful isolated build validates compilation, not hosted environment configuration or production security. For build verification use `npm run build:isolated`, never a root `next build` that might discover `.env.local`.

## Automated evidence

Evidence is recorded below after the final run. Initial failures and reruns are retained, not silently converted into unconditional passes. Source inspection and scripted assertions do not prove every human usability claim.

## Personal checklist — fill this in yourself

Actual-result and screenshot cells are intentionally blank. Every status starts **NOT TESTED**, even where automation has separate evidence.

| # | Role | Feature | Exact action | Expected result | Actual result | PASS / FAIL / NOT TESTED | Notes / screenshot |
|---|---|---|---|---|---|---|---|
| 01 | All | Local isolation | Follow startup commands; confirm address 127.0.0.1:3000 | No production environment file in disposable worktree | | NOT TESTED | |
| 02 | All | Login/logout | Sign in with each generated role; sign out | Correct workspace, then login form | | NOT TESTED | |
| 03 | Parent | Session | Reload signed-in page | Same authorized account/context | | NOT TESTED | |
| 04 | Parent | Role isolation | Enter /principal/home and /teacher/home | No staff data; safe role denial/redirect | | NOT TESTED | |
| 05 | Parent | Child switching | Select Child A then B on Home/Profile/Updates | Only selected child's data; no stale A rows for B | | NOT TESTED | |
| 06 | Parent | Home and profile | Open Home, then Student Profile | Coherent child summary, updates, homework, attendance, timetable | | NOT TESTED | |
| 07 | Parent | Important update | Open Updates and synthetic notice | Original teacher text visible | | NOT TESTED | |
| 08 | Parent | Translation/original | Choose Marathi, then View original | Reviewed label; original unchanged and recoverable | | NOT TESTED | |
| 09 | Parent | Acknowledgement | Acknowledge once, refresh | Saved state, no duplicate acknowledgement | | NOT TESTED | |
| 10 | Parent | Homework | Open Homework | Correct child's synthetic assignment and due date | | NOT TESTED | |
| 11 | Parent | Attendance | Open Attendance | Class/day statuses; no RFID conversion | | NOT TESTED | |
| 12 | Parent | Timetable | Open Timetable | Class-specific weekly schedule | | NOT TESTED | |
| 13 | Parent | English UI | Select English; navigate all Parent pages | Readable labels; note any legacy English-only or confusing copy | | NOT TESTED | |
| 14 | Parent | Hindi UI | Select Hindi; navigate all Parent pages | Hindi interface where implemented; free text not automatically translated | | NOT TESTED | |
| 15 | Parent | Marathi UI | Select Marathi; navigate all Parent pages | Marathi interface where implemented; report gaps | | NOT TESTED | |
| 16 | Parent | Audible English | Use English original, Listen | Actual audible English from laptop, no autoplay | | NOT TESTED | |
| 17 | Parent | Audible Hindi | Use a human-reviewed Hindi draft approved by Principal, Listen | Actual Hindi voice or honest unavailable fallback | | NOT TESTED | |
| 18 | Parent | Audible Marathi | Select reviewed Marathi text, Listen | Actual Marathi voice or honest unavailable fallback | | NOT TESTED | |
| 19 | Parent | Pronunciation | Fluent speaker hears names, times and sentences | Meaning/time pronounced acceptably; document OS/browser voices | | NOT TESTED | |
| 20 | Parent | Voice controls | Play, Pause, Resume, Stop; switch child/page | Playback controllable; cancelled on context change | | NOT TESTED | |
| 21 | Parent | Voice unavailable | Test browser/OS without selected language voice | Text remains; honest unavailable message; no fake playback | | NOT TESTED | |
| 22 | Parent | Consent | Notices → opt in SMS/IVR and language; save; opt out | Preferences persist; explicitly SIMULATION, no telephone/provider | | NOT TESTED | |
| 23 | Teacher | Class scope | Select assigned Grade 8A/8B | Correct roster and class context | | NOT TESTED | |
| 24 | Teacher | Attendance | Use demo:info latest historical date; change A Absent→Present; save | Saved correction survives refresh | | NOT TESTED | |
| 25 | Teacher | Insights | Inspect rules before/after attendance correction | Explainable pattern changes; no safety/diagnosis/automatic message | | NOT TESTED | |
| 26 | Teacher | Important notice | Students → A → title/message → Important → Send | One persisted update, no duplicate on refresh | | NOT TESTED | |
| 27 | Teacher | Correct update | Use correction action on own update | New correction preserves original; Parent sees correction history | | NOT TESTED | |
| 28 | Teacher | Draft | Open translation manager; save Hindi/Marathi; submit | Draft not shown as approved to Parent | | NOT TESTED | |
| 29 | Principal | Review | Communication → exact notice → review meaning → approve | Parent may select exact reviewed source translation | | NOT TESTED | |
| 30 | Human reviewer | Accuracy | Compare original/Hindi/Marathi meaning and times | Fluent reviewer confirms accuracy or rejects; no fabricated approval | | NOT TESTED | |
| 31 | Teacher | Coverage | Parent acknowledges new notice; inspect student update | Acknowledged state corresponds to that notice | | NOT TESTED | |
| 32 | Teacher | Homework | Create synthetic class homework; Parent refreshes | Only authorized class families see assignment | | NOT TESTED | |
| 33 | Principal | Timetable | Add/edit/remove synthetic period | Correct class/teacher; conflict/stale-edit errors are clear | | NOT TESTED | |
| 34 | Principal | Dashboard | Inspect Home, Communication, Attendance and students | Same-school metrics; explainable coverage and insights | | NOT TESTED | |
| 35 | Teacher/Principal | Fake delivery | Queue eligible synthetic recipients; run fake delivery; inspect status | SIMULATED outcome; no real SMS/call, no claim of reading | | NOT TESTED | |
| 36 | All | Entry | Run queue/offline/status/sync; view role entry panels | Durable pending then one authorized recorded check-in | | NOT TESTED | |
| 37 | All | Duplicate | Run demo:entry -- duplicate | Original receipt; no extra visible row | | NOT TESTED | |
| 38 | All | Revocation | Queue another event; revoke-card; sync | Unresolved/attention; no named row or wrong-child association | | NOT TESTED | |
| 39 | Parent | Entry isolation | Switch to B after A's scan | No A scan on B panel | | NOT TESTED | |
| 40 | All | Polling/offline | Keep panel foreground, then hide/offline, then reconnect | Bounded refresh, honest stale/offline state, recovery without duplicate rows | | NOT TESTED | |
| 41 | Empty roles | Empty contexts | Login unlinkedParent / unassignedTeacher | Helpful no-child/no-assignment state, no other records | | NOT TESTED | |
| 42 | All | Keyboard | Tab/Shift+Tab, native selects, Enter/Space | Visible focus, usable labelled actions, no trap | | NOT TESTED | |
| 43 | All | Responsive | Inspect each role at 390/768/1024/1440 widths | No clipping, overlap, overflow; report exact route/width | | NOT TESTED | |
| 44 | Human | Touchscreen | Use a real phone/tablet; tap/filter/scroll | Comfortable targets; no accidental actions | | NOT TESTED | |
| 45 | Human | Readability | Parent/teacher unfamiliar with app completes a task | Clear text, contrast, actions and navigation without coaching | | NOT TESTED | |
| 46 | Presenter | Laptop voices | Test actual presentation browser/OS and audio output | Available English/Hindi/Marathi voices documented; fallback rehearsed | | NOT TESTED | |
| 47 | Presenter | Offline demonstration | Rehearse full queue→outage→restart→sync flow | Honest smooth demonstration; no remote-alert promise during outage | | NOT TESTED | |
| 48 | Presenter | Competition rehearsal | Student explains synthetic vs real features and limitations | Understandable, accurate claims; no hardware/safety/provider overclaim | | NOT TESTED | |
| 49 | Operator | Cleanup/reset | Log out; demo:clean; stop own server; remove exact worktree | Owned fixtures and private temporary files removed; shared data preserved | | NOT TESTED | |

Stop after Task 32P. Manual feedback, a school pilot, hardware integration and production deployment require separate follow-up.
