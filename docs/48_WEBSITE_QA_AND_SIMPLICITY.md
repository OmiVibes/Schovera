# Website usability and local QA — 6 November 2026

Schovera has three portals: Parent, Teacher and Principal. This work preserves those portals and their existing records. Testing uses a separate loopback-only application and synthetic test records, not production accounts or school records.

## Usability changes

- Less-used tools open on demand instead of filling the home screen. Opening a tool still loads its authorized data; collapsing it unmounts its contents.
- Parent navigation says **Child profile**; Teacher navigation says **Student profile**. English, Hindi and Marathi labels are provided.
- A Parent with no linked child sees an explicit explanation and a request to contact the Principal, not a misleading empty child dashboard. School notices remain available. Loading and failed child-link reads have separate localized messages.
- Unsupported notification simulation controls no longer leave an empty disclosure on the normal Parent notices page. Simulated delivery is never described as real SMS or IVR.
- Invalid or cancelled workbook uploads retain the workbook already being edited. Late upload results cannot replace a newer selection.
- Spreadsheet limits are explicit: first worksheet, 5 MB, 200 rows, 30 columns and 500 characters per cell. A truncated import warns that the download contains only visible content. Keep the original: formulas, styling, macros and other sheets are not preserved.
- Draft inputs cannot change during generation. Clipboard failures give a manual-copy instruction instead of an unhandled error.
- Principal account management remains restricted to the signed-in school's authorized Principal. Existing account passwords are not silently reset on retries.

## What the automated checks cover

| Area | Actions and assertions |
| --- | --- |
| Sign-in and roles | All three roles, sign-out, role navigation, forbidden-role requests and account-management denial for Parent/Teacher/anonymous callers. |
| Parent | Linked-child switching, important updates, acknowledgement, notices, homework/profile/timetable views, translated/original messages, voice controls and reconnect. |
| Teacher | Assigned-class selection, attendance save, student updates/corrections, assignments, timetable/profile views and AI authorization. |
| Principal | School-scoped reports, attendance insights, communication review, translation approval and account creation/linking/retry behavior. |
| School-entry records | Signed synthetic event delivery, duplicate/conflict/revocation handling, durable queue recovery, authorized role reads, filters and refresh; classroom attendance stays separate. |
| Communication | Original preservation, translation review, simulated consent/delivery state, clipboard fallback and controlled speech-synthesis states. |
| AI and files | Real local Ollama syllabus, exam, worksheet and lesson-plan generation through the form, editable output, Generate/Copy controls, invalid/cancelled upload retention, cell edit and downloaded workbook content. Clipboard behavior is tested with a browser stub. |
| Layout | 23 role destinations at 1440, 1024, 768 and 390 pixels, horizontal-overflow assertions, accessibility/i18n checks. |

These are defined regression scenarios, not proof of every possible input, device, browser or human interpretation.

## Repeating the broad test gate

Use an isolated source snapshot with its own lockfile-installed dependencies, ignored loopback-only `.env.test.local`, migrated local Supabase and a local server. Never run these mutating tests against hosted Supabase or from a checkout that can discover production `.env.local`. See [safe setup](25_SAFE_SUPABASE_DEVELOPMENT.md).

The server must enable the required local simulator and account-management modes for their corresponding tests. Normal school use does not require displaying simulator controls. The fixture seed reserves its own test school; do not repurpose that school for actual records.

```powershell
# In the isolated QA directory, with its local server already running:
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
$env:VERIFY_TEACHER_AI_LIVE = '1' # requires the installed local Ollama model
npm run verify:website
```

The gate checks local mode before launching tests and refuses a checkout containing `.env.local`. It writes separate logs and a results manifest to an ignored `.local/website-qa/<unique-run>/` directory. Each check has a ten-minute watchdog; on Windows it terminates only that spawned test's process tree. Failed checks are recorded, not silently retried as passes. Dependency installation and environment setup are separate prerequisites.

## Evidence and remaining limits

The first broad run passed 42/45 checks. Failures were an eight-second cold-start readiness timeout, an opt-out checkbox acted on before preferences finished loading, and a connected journey that did not open a newly collapsed tool. The fixes retain the security/data assertions, wait for loaded controls, bound browser waits and allow 30 seconds only for the initial cold-start health request.

Separate before/after hashes cover 20 datasets belonging to the existing local school; all remained unchanged. Test-created records were cleaned up by their respective harnesses. The three existing fixed sign-ins were also checked in the normal running website, without editing school records.

### Execution record

All 46 named checks have passing executions across these runs. This is **not** a claim of one uninterrupted 46/46 pass:

| Run / follow-up | Observed result |
| --- | --- |
| Initial gate `97dd2042-33b0-47cf-a552-260bfda5dcdc` | 42/45; cold-start readiness, preference-loading and collapsed-section issues described above. |
| Expanded gate `0c61c0b2-230b-43c0-bb34-1a2996d4cb75` | 44/46. One Hindi test still expected the old Profile label; the connected journey exposed the missing no-linked-child explanation. Both were corrected and independently passed. |
| Final broad gate `a14242f9-4ee4-44ad-98a5-e0d00d722602` | 44/46. The raw Teacher-to-Parent Realtime event timed out once in `verify:idempotency`. The gateway harness still expected the optional panel for an unlinked Parent, although the corrected UI now shows an explicit no-linked-child screen instead. |
| Corrected gateway acceptance | Passed with explicit unlinked-Parent heading, absent event panel, no forbidden student names and the original direct browser-token/RLS snapshot assertions retained. |
| Independent idempotency checks | Three consecutive passes after the broad run, including database retry/concurrency/conflict/audit/authorization assertions and actual Realtime delivery. The earlier timeout remains recorded; no automatic retry turns a failed gate green. |
| AI browser controls | All four draft forms passed with real local Ollama `gemma3:1b` output in both expanded and final runs. Invalid/cancelled uploads retained the edited cell; the downloaded workbook contained that edited value. |
| Layout / connected workflow | Final role navigation, accessibility/i18n, voice-state tests, browser reconnect, connected journeys and all 23 destinations at four widths passed. The provisioner browser workflow also captured 92 screenshots and tested homework editing, timetable changes and notice publication. Parent and Teacher desktop captures were visually reviewed. |
| Workbook helper | Five focused tests passed, including blank-row preservation, truncation warnings and row/column limits. |

Private manifests and per-command logs remain under the isolated QA directory's ignored `.local/website-qa/` folders; they are not source artifacts. The final broad run's simulated slow connection (150 ms latency, 1 Mbps down / 512 Kbps up) measured Parent/Teacher in-app navigation at 383/898 ms and cold development-server login-page loading at approximately 10.3 seconds. These are two local observations, not production benchmarks or a performance guarantee.

The local Realtime timing flake is not diagnosed as a deterministic application defect. Browser persisted-refetch/reconnect recovery passed, but a stable uninterrupted full gate remains an acceptance follow-up. Timeout diagnostics now distinguish an authorized persisted read from an unobserved raw INSERT notification while still failing the check. A stale timed-out test waiter is also removed correctly; no delivery assertion was removed.

Final source checks after the gateway assertion update: `npm run typecheck`, `npm run lint` and `git diff --check` passed. No dependencies were added and no production environment was accessed or deployed. Changes remain uncommitted for review. The temporary QA server was stopped; the normal school website on port 3103 and the local model service remain running.

## A short manual check on the running website

1. Open `http://127.0.0.1:3103` and use your existing fixed email/password. Use separate browser profiles or sign out before changing role.
2. As Parent, open each navigation item. Check the child's name, class and records. If multiple children are linked, switch children and confirm the old child's information disappears. On a controlled test notice, acknowledge once, refresh and check the saved status. Do not change actual family records merely to experiment.
3. As Teacher, choose a class before opening its students, attendance, homework and timetable. For a trial attendance save or message send, use a separately approved test class/child, not real records.
4. In AI studio, use a non-personal teaching topic. Generate a draft, edit it and copy it. Upload a copy of a small spreadsheet, change a cell, download and reopen it. Confirm the changed value; keep the original file.
5. As Principal, open communication, attendance, homework, timetable, notices and Manage users. Confirm the school and role are correct. Create an account only when you genuinely intend to add that person; this is not a disposable action on the school workspace.
6. Change interface language to Hindi and Marathi, then back to English. Read the labels yourself or ask a fluent reviewer. Free-text messages are not automatically translated by changing interface language.
7. Resize the window and use Tab/Shift+Tab to reach controls. Verify focus is visible and buttons do not overlap. Test actual audible playback on the presentation laptop; headless tests cannot certify its voices or speakers.
8. Sign out. Reopening a protected route must require sign-in. Keep passwords private and do not put them in screenshots or shared source documents.

- No physical RFID, actual SMS/IVR delivery, audible voice quality or family usability study is established by these tests.
- AI generation is a first draft, not verified curriculum or answer-key accuracy. All four draft types returned editable output from the local model; their educational content still needs educator review.
- Headless voice tests exercise supported/unavailable states and a controlled speech adapter, not real loudspeaker output.
- No production database, Vercel deployment or hosted environment is changed. Local account-management and ingestion gates remain local-only.
- No production build is claimed for this uncommitted worktree. The isolated build workflow builds committed snapshots; a release still needs an exact reviewed commit, isolated build and deployment-specific acceptance.
- This record is not a production-readiness or security certification.
