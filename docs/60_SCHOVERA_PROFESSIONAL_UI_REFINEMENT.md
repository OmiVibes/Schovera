# AUD-60 â€” Professional UI refinement

12 November 2026. **PARTIAL CHECKPOINT ? UI changes implemented; final acceptance blocked by the local Docker engine.** This is a local UI milestone, not production or hardware acceptance. The owner clarified that the interface must remain English/Hindi/Marathi. Korean remains available through the existing message translation and speech features only.

## Changes and visual evidence

The four owner screenshots were extracted from `Schovera_Parent_4_Screenshots_2026-11-12.zip` into `UI_REVIEW_SCREENSHOTS/2026-11-12-parent-feedback/` and inspected individually. The earlier refined and polish archives were accessible; their Parent attendance, Teacher overview and Principal overview/contact-sheet evidence was reviewed alongside current browser captures. Documents inside archives were treated as evidence, not additional instructions.

| Problem | Root cause and implementation | Fresh evidence in the review folder |
|---|---|---|
| Attendance card has a large blank area and misaligned statistics | The summary's heading, latest record and counts occupied incompatible explicit grid rows. Use two aligned heading/content rows, responsive stacking and equal statistic columns. Remove the duplicate attendance status from the child identity on this page and the duplicate history heading. Preserve charts, filters and all saved records. | `parent/1440px/attendance.png`, `parent/390px/attendance.png` |
| Absent is green and Late is red | Legacy positional color rules assumed the Teacher register's different counter order. Give Parent summary counters explicit Present/Absent/Late classes and semantic color rules. | Attendance captures above |
| Latest status has no recorded date; identity has an unused third column | Include the actual `attendance_date`, including its year. Reserve the third identity column only when a child switcher exists. On Attendance, the single latest-status/date summary sits below the compact identity. No date or record is fabricated. | Parent Home, Updates and Attendance captures |
| Audio guidance repeats under every message and dominates card footers | Replace the idle live-region helper with an optional, keyboard-accessible native help disclosure. Preserve reserved status space so playback messages do not shift the buttons. Required language choices and playback/error messages still appear in the live region. Preserve all Stop and playback state logic. | Parent Home/Updates/Notices; expanded audio-help capture |
| Plain language selector | Reuse the existing native select and language preference logic. Add a decorative globe, consistent plum borders/surfaces, readable padding, hover feedback and focus rings. Adjust width/padding so the icon does not consume the selected label's space. | All portal headers; `sign-in/` and selector focus examples |
| Sticky header can cover anchored content at different sizes | Fixed 136/280px offsets do not follow the responsive header or localized wrapping. Measure the actual shell with a cleaned-up ResizeObserver and use its height for anchor offsets, including the Teacher update composer. | `scroll/`, `zoom/`, Teacher anchor capture |
| Inconsistent interactions | Adjust the existing component rules in place to 180ms color/border/shadow transitions. Keep visible focus, restrained pressed feedback and hover affordances on actual task links. Remove the notice-card lift/border hover that implies the whole informational card is clickable. Existing reduced-motion rules suppress motion. | Hover/focus captures and computed interactive checks |

The cropped notices screenshot does not establish its original browser viewport or zoom. Fresh measured notice/card states did not reproduce horizontal clipping before the environment interruption. No `overflow-x: hidden` concealment was added. Actual scroll captures retain sticky positioning; full-page stitched captures temporarily unstick the shell solely for screenshot stitching and are labelled accordingly.

Files changed: `src/app/refinement.css`, `src/app/theme.css`, `src/lib/i18n-provider.tsx`, `src/components/schovera-app.tsx`, `src/components/parent-speech-controls.tsx`, its existing component test, and this report. No new stylesheet layer, dependency, translation dictionary, schema, migration, account, password, attendance calculation, communication aggregate, offline queue or authorization rule was introduced.

## Verification and failures

All checks use the existing isolated QA checkout and its approved local environment. The developer `.env.local` was not opened, copied, hashed or modified. Root builds use only `npm run build:isolated -- --working-tree`. Private execution logs and probes are retained at `.local/schovera-manual-demo/ui60-20261112/`; no credentials belong in this report or archive.

Executed passing checks so far:

- 329 unit/component tests in 38 files; TypeScript and lint. The existing speech component test additionally verifies an empty idle live region, accessible collapsed help, and disabled/enabled/disabled Stop behavior across play/stop. Existing assertions remain intact.
- Attendance, assignments, school announcements, cross-role navigation, accessibility/i18n and 96 staff language/width cases.
- AUD-01 exact communication totals through 2,005 updates and the 2,007-row correction dataset; acknowledgement, translation and school isolation checks.
- Connected Teacher/Parent/Principal journeys, reconnect, translation approval, original preservation and acknowledgement persistence.
- RFID v2 and durable gateway integration, including process restart/replay, local synchronization and role visibility.
- Real local Hindi/Marathi/Korean translation and English/Hindi/Marathi/Korean WAV generation. Hindi/Marathi/Korean browser audio advanced unmuted, and Pause/Resume/Stop passed. Parent/Teacher speech controls also passed position stability, keyboard and navigation-stop checks. These do not certify physical speaker output or fluent pronunciation.
- Twelve actual 200% browser zoom views: four per role. Measured CSS viewport 713px, outer width 1442px and device ratio 2.5. The external owned browser profile was cleaned.
- Final current-source isolated Next 16.4.1 build: expected routes, TypeScript, generated `.env.production` only, private sentinel scan, unchanged inputs and temporary-snapshot cleanup. Fingerprint `a6c30f377f549d9f09d73263a99e60865e4b6a6b86200881eefc079f5f41d07d`, 190 approved files. Only the two allowlisted Google Fonts hosts were observed through the limited proxy; this is not an OS network sandbox.

Failures are retained, not converted into passing runs:

1. A new capture probe incorrectly required the shell to start at y=0 even at the page top, where the existing sample-records ribbon precedes it. The probe was corrected to distinguish top-of-page from genuinely scrolled sticky positioning.
2. One early capture timed out waiting for navigation. Another stopped with Chrome's `Page.captureScreenshot` failure after 302 successful images. Their partial measurements are retained; an interrupted run is not a completed matrix.
3. The first isolated build failed during offline installation with a Node memory-allocation error. A development worker also reported an out-of-memory failure during the same heavy-test period. Running the build alone with the owned dev server stopped subsequently passed, including the final CSS revision.
4. Later interaction probes stalled at Signing in. Independent Auth health requests timed out and Docker returned engine errors; these were environment failures, not evidence that the fixed account passwords had changed. Docker's normal restart timed out. The owner explicitly authorized restarting WSL. A non-elevated attempt was denied; the elevated restart encountered a stuck stop and one failed service start. A subsequent controlled start returned WSL to Running. No reset, reseed or volume deletion was used.
5. Preliminary probe copying/PowerShell quoting errors changed no application files. Corrected invocations retain the same product assertions.

## Preservation and remaining acceptance

The pre-interruption protected-school check passed all 20 dataset hashes. Source integrity compared 183 executable QA inputs with no mismatch. Dependency versions remain Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5. Existing dependency findings are not re-audited or resolved by this UI task.

The dated synthetic rehearsal remains separate from historical October messages; neither was rewritten for presentation. The Grade 6 question remains pending exact account/environment evidence. Existing unrelated untracked `CLAUDE.md` and `review/` remain preserved.

The authorized WSL recovery restored WslService and ordinary distribution commands. Docker Desktop remained stuck at Starting the Docker Engine after subsequent restarts, and Auth remained unavailable. No Windows reboot, Docker factory reset, distribution unregister, database reset, reseed, resource recreation or dependency upgrade was attempted. The last owned QA web server was stopped for isolated compilation. This report does not certify the complete AUD-60 acceptance matrix. Physical RFID/Pi, public deployment, real notification delivery, fluent-language review and assistive-technology acceptance remain outside this verification.


## Delivered checkpoint and remaining work

The review folder is `UI_REVIEW_SCREENSHOTS/2026-11-12-professional/`; open `OPEN_GALLERY.html`. The requested archive is `Schovera_UI_Professional_Review_2026-11-12.zip` in that folder. **It is explicitly an incomplete review pack.** Its README and coverage metadata identify the missing states; old images are never substituted for missing fresh captures. Historical owner screenshots remain separately labelled.

The interrupted capture measured 179 of 184 English route/width combinations and 88 of 92 Hindi/Marathi route/width combinations: 267 of the planned 276 localized layouts. Additional expanded-disclosure measurements are recorded separately. None of these measured states reported page overflow, target-card clipping or browser runtime errors. These measurements establish only their executed states, not unexecuted combinations. All 23 destinations have at least one fresh route capture. Principal Notices still lacks the fresh 414/768/1024/1440/1920px captures and its Hindi/Marathi samples. The Parent 390px profile capture shows a loading state and needs a fully loaded counterpart.

Fresh real sticky captures cover top/middle/bottom of seven long role/page combinations, 21 positions. Twelve representative real browser-zoom captures are retained. The separate sign-in check passed English/Hindi/Marathi at 320/390/768/1440px: text fits, keyboard focus is visible, targets are at least 44px, entered email survives language changes and preference survives reload. Its first attempt correctly caught a genuine 320px overflow caused by the visible Language caption plus globe/select beside the brand. The mobile caption is now screen-reader-only, and the full native language name remains visible without reducing font size. The corrected check passed.

The additional authenticated interaction probe remains failed at sign-in while Auth was unavailable. Consequently its portal-selector canvas measurements, computed hover/reduced-motion checks and Teacher anchor measurements are **NOT completed evidence**. Source/CSS review and earlier passing keyboard/speech suites do not replace that probe. New offline-operation status screenshots, the guarded account-mode UI refresh and a new live AI/workbook acceptance run were not completed in this phase. Earlier functional checks and existing AUD-58/59 evidence remain historical, not fresh substitutes.

Resume safely after Docker is healthy:

1. Verify Auth health and the retained local database, migration count and protected-school hashes. Do not reset or seed.
2. Start the guarded QA server on 3104, using the existing approved local environment. Finish the missing route/language captures and loaded Parent profile; run the interaction probe sequentially rather than concurrently with builds or other fixed-account sign-out tests.
3. Complete targeted offline-status/account-mode and AI/workbook checks as appropriate, retain scoped fixture cleanup, regenerate the pack from one final manifest, then review full-size images and contact sheets.
4. Repeat the final current-source isolated build only if source changes; review/publish the completed milestone to main through the standing workflow. This checkpoint belongs on a clearly labelled feature branch while acceptance remains incomplete.

No physical RFID, Raspberry Pi, public hosting, real SMS/call delivery, human pronunciation quality or production release was certified. A Windows restart may be the next environment-recovery step after saving other work; it was not authorized or performed by this task.

## Executed command ledger

Times are UTC on 12 November 2026. Add 05:30 for IST. Commands ran in isolated QA except the root isolated-build wrapper. Preparatory probes and Docker/WSL recovery attempts are described above; interrupted captures are not completed matrix passes.

| Command | Start UTC | Exit | Result |
|---|---|---:|---|
| `npm run typecheck` | 06:44:14.931 | 0 | PASS |
| `npm run lint` | 06:44:25.749 | 0 | PASS |
| `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:44:50.016 | 0 | PASS |
| `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 06:46:15.561 | 0 | PASS |
| `npm run verify:simple-voice` | 06:46:16.131 | 0 | PASS |
| `npm run verify:accessibility-i18n` | 06:46:35.995 | 0 | PASS |
| `npm run verify:staff-localization` | 06:46:43.417 | 0 | PASS |
| `npm run verify:role-navigation` | 06:47:02.794 | 0 | PASS |
| `npm run verify:attendance` | 06:47:53.571 | 0 | PASS |
| `npm run verify:assignments` | 06:47:55.247 | 0 | PASS |
| `npm run verify:announcements` | 06:47:56.384 | 0 | PASS |
| `npm run verify:principal-communication` | 06:47:57.448 | 0 | PASS |
| `npm run verify:final-journeys` | 06:48:43.503 | 0 | PASS |
| `npm run verify:reconnect` | 06:49:19.297 | 0 | PASS |
| `npm run test:rfid:integration` | 06:49:53.127 | 0 | PASS |
| `npm run test:gateway:local-integration` | 06:49:57.440 | 0 | PASS |
| `npm run verify:communication-local` | 06:50:18.648 | 0 | PASS |
| `npm run typecheck` | 06:51:00.665 | 0 | PASS |
| `npm run lint` | 06:51:11.635 | 0 | PASS |
| `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:51:33.855 | 0 | PASS |
| `npm run build:isolated -- --working-tree` | 06:52:15.587 | 1 | FAIL |
| `npm run build:isolated -- --working-tree` | 06:54:21.012 | 0 | PASS |
| `node --env-file=.env.test.local .local/ui60/states.mjs` | 06:57:41.188 | 1 | FAIL |
| `npm run build:isolated -- --working-tree` | 07:05:47.168 | 0 | PASS |
| `node --env-file=.env.test.local .local/ui60/signin.mjs` | 07:16:26.838 | 1 | FAIL |
| `node --env-file=.env.test.local .local/ui60/signin.mjs` | 07:17:09.661 | 0 | PASS |
| `npm run build:isolated -- --working-tree` | 07:19:09.080 | 0 | PASS |

## Git checkpoint

Base main revision: `67f9153d48f8c0cedc087ceef553c4ab1b611600`. The standing workflow permits unfinished work only as a clearly labelled feature checkpoint. Planned branch: `checkpoint/aud60-ui-refinement`; main remains unchanged while the Docker-dependent acceptance gaps are open. Only the six UI/test source files and this report belong in the checkpoint. Screenshots, ZIPs, local logs, environment files, service-recovery helpers and unrelated artifacts remain ignored or unstaged. No force-push or deployment is involved.
