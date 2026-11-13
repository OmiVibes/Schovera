# AUD-60 - Professional UI refinement

Completed 13 November 2026, following execution on 12-13 November. **The local UI milestone is verified in the executed synthetic states.** This supersedes the earlier incomplete checkpoint verdict; all original failed attempts remain recorded below and in Git history. It is not production, hardware, language-quality or full accessibility certification.

The owner's clarification is preserved: the interface supports English, Hindi and Marathi. Korean remains confined to existing message translation and speech. No full Korean interface, new dependency or new stylesheet layer was added.

## Evidence reviewed and changes implemented

The four owner PNGs were extracted from the supplied Parent feedback ZIP and inspected individually. The existing refined/polish archives were accessible and reviewed through their Parent attendance, Teacher overview, Principal overview/contact-sheet and selected full-page images. Archive documents were treated as evidence rather than additional instructions. Final contact sheets and representative full-size desktop/mobile, translated, scrolling, account, offline and AI states were reviewed after capture.

| Original issue | Root cause and final change | Files | Actual browser evidence, relative to the review folder |
|---|---|---|---|
| Attendance whitespace, repeated status/headings and unbalanced statistics | Explicit grid rows placed the latest record and counters at different heights. Align heading/content rows, stack on mobile, use equal counters and remove duplicate status on the Attendance identity. Keep all charts, dates, history and filters. | `theme.css`, `refinement.css`, `schovera-app.tsx` | `parent/1440px/attendance.png`, `parent/390px/attendance.png` |
| Absent displayed green and Late red, including child profiles and Principal overview | Positional counter rules assumed different counter orders. Replace them with explicit status classes across profile/summary/Principal views, retain existing Teacher status classes, and check computed colors in the verifier. Present is green, Absent rose/red and Late amber, always with text labels. | `globals.css`, `refinement.css`, `schovera-app.tsx`, verifier | Parent profile/attendance; Teacher/Principal attendance; semantic counter assertions |
| Child summary has an unused third column and no dated latest record | Reserve a third column only when a child switcher exists. Show actual saved attendance date/year in the latest summary and Home identity, without inventing a current record. | `refinement.css`, `schovera-app.tsx` | Parent Home/Attendance; dated saved record remains 6 November 2026 |
| Repeated long audio troubleshooting text and oversized footers | Move idle guidance into optional native help disclosures. Keep required language/error/playback messages in the live region and reserve status space so buttons remain stable. Controller/translation/review logic is unchanged. | speech component/test, `refinement.css` | Home/Updates/Notices, expanded audio help, real playback/geometry tests |
| Plain or clipped language control | Reuse native selection/persistence with a decorative globe and chevron, plum border/surface, readable type and focus states. A platform arrow consumed extra text space in narrow Principal headers; explicit native appearance/padding resolves it. At 320px the visible caption becomes screen-reader-only while the selected language stays visible. | i18n provider, `refinement.css` | `sign-in/`, all role headers, keyboard-focus examples; canvas text-fit and persistence checks |
| Sticky header obscures anchor destinations | Old 136/280px offsets did not follow responsive or localized header height. A cleaned-up ResizeObserver supplies the actual shell height to scroll margins, including the Teacher composer. | app component, `refinement.css` | `scroll/`, `zoom/`, `interactive/teacher-update-anchor.png` |
| Account-mode emblem stretches across the mobile card | A grid child had no fixed dimensions when the layout stacked. Bound the decorative emblem to 40px and align it to the start; retain the clear account-mode explanation. | `refinement.css` | `principal/390px/users.png`; eight-width 40px geometry assertion and guarded forms |
| Unprofessional hover feedback and inconsistent motion | Correct existing rules to 180ms color/border/shadow transitions, retain focus/pressed/disabled states, and remove the informational notice-card lift/border hover. Important notice borders now remain unchanged on hover. Existing reduced-motion rules remain effective. | `globals.css`, `theme.css`, `refinement.css`, verifier | Hover/focus examples, computed transition/reduced-motion checks and required Important-notice hover assertions |

The cropped notices feedback did not establish its viewport or zoom, and horizontal clipping was not reproduced in the measured fresh notice states. No page-level `overflow-x: hidden` concealment was added. Sticky headers legitimately remain visible while preceding content scrolls behind them; anchor destinations now account for their real height.

## Executed acceptance

| Area | Result and limit |
|---|---|
| All portals | 23 routes at 320/360/390/414/768/1024/1440/1920px: 184 English route/width checks, no page overflow or runtime errors. Solid-background HTML contrast checks found no violations in their measured subset; this is not exhaustive contrast certification. |
| Interface languages | Fresh Hindi/Marathi samples for all 23 routes at 1440/390px, plus English: 276 complete planned localized layouts. The earlier 96-case staff suite also passed. Authored names and messages remain original content. |
| Sign-in/header controls | Three interface languages at four sign-in widths; selected text fits, focus is visible, targets meet 44px, typed email survives language changes and preference survives reload. Portal label fit, menu/Escape focus behavior and localized layouts pass. |
| Real scrolling/zoom | 24 actual top/middle/bottom sticky views across eight long role/page combinations. Twelve selected pages passed actual 200% Chrome zoom (713 CSS px versus outer 1442, device ratio 2.5). Other routes at actual zoom are not separately certified. |
| Interactions | 180ms navigation transitions, reduced-motion suppression, hover/focus states, outer/inner disclosures, stable speech buttons, disabled/enabled Stop and Teacher anchor behavior pass. Native help is optional; translation-review and acknowledgement states stay visible. |
| Unit/source checks | 329 passing unit/component tests in 38 files, TypeScript and lint. Existing speech assertions remain; added assertions cover idle status/help and Stop state. The layout verifier now checks semantic counter colors and stable Important-notice hover. |
| Accounts | All 18 guarded account-management scenario groups pass with scoped cleanup. An additional 18 account-role/interface-language/width capture states pass without submitting accounts. Fixed presentation accounts/passwords are unchanged. |
| Connected workflows | Attendance, homework, school notices, Teacher/Parent/Principal journeys, acknowledgement/reconnect, translation approval/original preservation and authorization checks pass. AUD-01 exact counts pass through 2,005 rows and the 2,007-row correction dataset. |
| Offline/RFID | RFID v2 and durable gateway integration pass. Fresh school-operation acceptance passes real SQLite capture, server restart, same-Teacher replay, lost responses, conflicts held for review, revocation/role/Origin denial and three-portal views. It remains a local synthetic outage simulation, not a separate hosted replica or physical network test. |
| AI/workbook | Actual local Ollama/gemma3:1b generation returned a 3,414-character first draft; syllabus/exam/worksheet/lesson-plan form submissions pass with editable output. Workbook edit/export/reopen and invalid/cancelled upload preservation pass at 390px. Clipboard success/unavailable branches use a stub; no OS clipboard certification is claimed. Educational correctness still requires Teacher review. |
| Speech/translation | Fresh local Hindi/Marathi/Korean automatic translation preserves tested facts and originals. Real en/hi/mr/ko WAVs and hi/mr/ko browser media/Pause/Resume/Stop pass. Ten native samples pass original text, matched locale, volume and start/end callbacks. Audibility, naturalness and fluent pronunciation remain human acceptance tasks. |
| Dated rehearsal | Six read-only captures use the retained synthetic rehearsal dated 12 November. Its data/journal and historical October messages were not rewritten; the competition date remains unconfirmed. |

## Preservation, environment and build

All browser/database execution used the existing isolated QA checkout, its approved local files, loopback Supabase and owned web ports. The developer `.env.local` was not opened, copied, hashed or modified. No reset, seed, migration, dependency upgrade, existing account/password change, hosted write, public tunnel, paid provider activation or deployment occurred. Test-created synthetic accounts/records were scoped and cleaned.

All 20 protected-school dataset hashes still match. The normal sample-school rows match the previously authorized AUD-58 cleanup exactly, with no additional business-record changes; the school-operation fixture queue is empty. Source integrity verifies 78 protected implementation/configuration files unchanged from base main, 183 executable QA files matching, 38 migrations and HTTP 200 Auth. Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5 remain installed in QA; manifests/lockfile are unchanged.

The final current-source isolated build passed expected application/API routes, TypeScript, generated `.env.production` only, private sentinels absent, unchanged inputs and exact current-snapshot cleanup. Source fingerprint: `a8b774b121155d75b487e3538ccff9867d71bf49893a015e7b21ea5c100100d2` (190 approved files). Only allowlisted Google Fonts hosts were observed through the limited build proxy; it is not an OS network sandbox. No raw developer build was used.

Docker/Auth became unavailable during the first heavy-test period. WSL recovery and normal Docker restart attempts did not initially restore the engine; the owner manually restarted Windows. Subsequent startup returned Docker/Auth to health, protected data matched, and the formerly blocked checks completed. No Windows reboot was initiated by the agent. Services were switched between simulator/account modes only for the required checks; the final normal local server uses the guarded simulator launcher.

## Failures and interrupted attempts retained

1. The first scroll probe incorrectly expected y=0 at the page top despite the existing sample-records ribbon. It now distinguishes initial and genuinely scrolled sticky positions; sticky assertions remain.
2. An early capture timed out waiting for navigation; its precise timing cause was not isolated. A later capture stopped with Chrome's screenshot-protocol failure after 302 images. Neither is represented as a completed matrix. A fresh full final capture now passes all 276 layouts.
3. The first isolated build failed with a Node memory-allocation error; a dev worker also reported out-of-memory during the same period. Standalone frozen-source builds subsequently passed. A later build was interrupted by a session/system restart without a final result; its completion is not claimed.
4. Auth sign-in probes stalled while independent health requests timed out and Docker returned engine errors. Docker/WSL attempts included a normal-restart timeout, denied non-elevated service access, a stuck stop and a failed service start before recovery. These observations do not establish a single certified OS root cause or a credential defect.
5. The first narrow sign-in check correctly found 320px overflow. The caption/padding fix passed its unchanged geometry assertions. Visual review then caught native-arrow label clipping and the shared profile counter-color issue; both were corrected and the fresh matrix rerun.
6. The old layout probe's broad summary selector matched new nested speech-help disclosures. Targeting the outer direct-child summary preserves the original disclosure/width assertions; the original failed run remains. A preliminary optional hover selector used the wrong class; the final probe requires the actual Important notice and checks its border/transform rather than silently skipping it.
7. The additional account screenshot probe timed out with exact getByLabel(Portal); the exact accessible combobox role/name locator passed all 18 states. The existing 18-group account suite and application code were not changed for that repair.
8. Preliminary shell/copy/encoding/metadata errors changed no business logic or protected data. Initial runner revision-label metadata was corrected with the original ledger retained. Automatic approval review blocked removal of the exact interrupted temporary build folder `schovera-build-UFBX2f`; it was left intact. Other historical temporary directories were preserved. The successful final build's own snapshot was cleaned.

Gallery review also found two default timetable previews showing loading skeletons. They are retained under `loading-states/`; the Parent/Teacher timetable captures were retaken at all eight widths and both localized widths after actual saved-period cards became visible. No mock data or application change was used for those retakes.

## Review archive and Git handoff

The requested `Schovera_UI_Professional_Review_2026-11-12.zip` is under `UI_REVIEW_SCREENSHOTS/2026-11-12-professional/`, with a copy in Downloads. The requested filename is retained; the manifest/report explicitly identify captures and resumed verification across 12-13 November. Open `OPEN_GALLERY.html` for the four labelled owner-before/fresh-after comparisons, full-size route screenshots and per-role contact sheets. The archive also includes three interface languages, Korean message speech, actual scroll/zoom states, guarded forms, offline pending/synced states, the dated rehearsal and real AI/workbook captures. No historical image substitutes for a missing final route capture.

Raw logs, environment files, credentials, databases and service-recovery helpers stay out of Git and the review ZIP. Hashes establish file identity, not correctness. Historical owner feedback and derived contact sheets are labelled separately. Captures cannot establish animation smoothness or audible/linguistic quality by themselves; those interactive checks and limits are recorded above.

The meaningful checkpoint commits `ebdb9c5` and `59a19b9` remain in history. The completed milestone follows the owner's standing main-branch workflow, preserving those commits and publishing the final reviewed source/report without force-push. The final commit URL is reported in the handoff. Unrelated untracked `CLAUDE.md` and `review/` remain untouched.

Remaining limits: fluent interface/message/voice review, actual presentation speaker output, full assistive-technology/user acceptance, maximum-data/load states, hardware/Pi/site operation and public hosting remain separate. AUD-03's previously documented lint-tool findings are not re-audited by this UI work. The Grade 6 assignment question remains pending exact account/environment evidence. No real-school or production readiness claim follows from these local UI checks.

## Execution ledger

Times below are UTC; add 05:30 for IST. Commands used QA except the root isolated build. Repeated executions overlap and are not independent feature-test totals. Preparatory recovery commands and interrupted probes are described above. Private logs and original failed attempts remain in `.local/schovera-manual-demo/ui60-20261112/`.

| Date UTC | Command | Start UTC | Exit | Result |
|---|---|---|---:|---|
| 2026-11-12 | `npm run typecheck` | 06:44:14.931 | 0 | PASS |
| 2026-11-12 | `npm run lint` | 06:44:25.749 | 0 | PASS |
| 2026-11-12 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:44:50.016 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 06:46:15.561 | 0 | PASS |
| 2026-11-12 | `npm run verify:simple-voice` | 06:46:16.131 | 0 | PASS |
| 2026-11-12 | `npm run verify:accessibility-i18n` | 06:46:35.995 | 0 | PASS |
| 2026-11-12 | `npm run verify:staff-localization` | 06:46:43.417 | 0 | PASS |
| 2026-11-12 | `npm run verify:role-navigation` | 06:47:02.794 | 0 | PASS |
| 2026-11-12 | `npm run verify:attendance` | 06:47:53.571 | 0 | PASS |
| 2026-11-12 | `npm run verify:assignments` | 06:47:55.247 | 0 | PASS |
| 2026-11-12 | `npm run verify:announcements` | 06:47:56.384 | 0 | PASS |
| 2026-11-12 | `npm run verify:principal-communication` | 06:47:57.448 | 0 | PASS |
| 2026-11-12 | `npm run verify:final-journeys` | 06:48:43.503 | 0 | PASS |
| 2026-11-12 | `npm run verify:reconnect` | 06:49:19.297 | 0 | PASS |
| 2026-11-12 | `npm run test:rfid:integration` | 06:49:53.127 | 0 | PASS |
| 2026-11-12 | `npm run test:gateway:local-integration` | 06:49:57.440 | 0 | PASS |
| 2026-11-12 | `npm run verify:communication-local` | 06:50:18.648 | 0 | PASS |
| 2026-11-12 | `npm run typecheck` | 06:51:00.665 | 0 | PASS |
| 2026-11-12 | `npm run lint` | 06:51:11.635 | 0 | PASS |
| 2026-11-12 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 06:51:33.855 | 0 | PASS |
| 2026-11-12 | `npm run build:isolated -- --working-tree` | 06:52:15.587 | 1 | FAIL |
| 2026-11-12 | `npm run build:isolated -- --working-tree` | 06:54:21.012 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/states.mjs` | 06:57:41.188 | 1 | FAIL |
| 2026-11-12 | `npm run build:isolated -- --working-tree` | 07:05:47.168 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/signin.mjs` | 07:16:26.838 | 1 | FAIL |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/signin.mjs` | 07:17:09.661 | 0 | PASS |
| 2026-11-12 | `npm run build:isolated -- --working-tree` | 07:19:09.080 | 0 | PASS |
| 2026-11-12 | `npm run build:isolated -- --working-tree` | 10:40:22.061 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 11:11:42.325 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/states.mjs` | 11:12:04.795 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/capture.mjs --resume` | 11:12:19.597 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/reshoot.mjs` | 11:13:24.577 | 0 | PASS |
| 2026-11-12 | `npm run verify:ui-refinement` | 11:13:35.627 | 1 | FAIL |
| 2026-11-12 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 11:13:50.301 | 0 | PASS |
| 2026-11-12 | `npm run verify:ui-refinement` | 11:15:11.995 | 0 | PASS |
| 2026-11-12 | `npm run verify:school-operations` | 11:16:08.798 | 0 | PASS |
| 2026-11-12 | `npm run verify:ui-refinement` | 11:19:01.681 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/final-capture.mjs` | 11:19:41.038 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/states.mjs` | 11:21:12.434 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/zoom.mjs` | 11:21:21.228 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/rehearsal.mjs` | 11:22:48.498 | 0 | PASS |
| 2026-11-12 | `npm run verify:school-operations` | 11:23:04.143 | 0 | PASS |
| 2026-11-12 | `npm run verify:accounts` | 11:24:50.622 | 0 | PASS |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/accounts.mjs` | 11:24:59.514 | 1 | FAIL |
| 2026-11-12 | `node --env-file=.env.test.local .local/ui60/accounts.mjs` | 11:27:16.434 | 0 | PASS |
| 2026-11-12 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 11:28:19.824 | 0 | PASS |
| 2026-11-12 | `npm run typecheck` | 11:28:55.199 | 0 | PASS |
| 2026-11-12 | `npm run lint` | 11:29:01.644 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 05:17:09.862 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/teacher-ai-evidence.mjs` | 05:18:46.112 | 0 | PASS |
| 2026-11-13 | `npm run verify:communication-local` | 05:21:58.994 | 0 | PASS |
| 2026-11-13 | `npm run verify:simple-voice` | 05:22:46.121 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local scripts/verify-native-voice.mjs --languages en,hi,mr,ko` | 05:23:04.213 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/preservation.mjs` | 05:23:57.732 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/aud02-implementation-20261109/preserve-school.mjs` | 05:23:59.109 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/integrity.mjs` | 05:24:24.767 | 0 | PASS |
| 2026-11-13 | `npm run build:isolated -- --working-tree` | 05:24:37.998 | 0 | PASS |
| 2026-11-13 | `npm run verify:ui-refinement` | 05:28:31.629 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/states.mjs` | 05:29:21.549 | 0 | PASS |
| 2026-11-13 | `npm run verify:ui-refinement` | 05:30:12.935 | 0 | PASS |
| 2026-11-13 | `npm run lint` | 05:32:54.791 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/integrity.mjs` | 05:33:28.740 | 0 | PASS |
| 2026-11-13 | `npm run build:isolated -- --working-tree` | 05:33:36.804 | 0 | PASS |
| 2026-11-13 | `npm run verify:ui-refinement` | 05:35:51.759 | 0 | PASS |
| 2026-11-13 | `npm run lint` | 05:37:01.195 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/integrity.mjs` | 05:37:25.430 | 0 | PASS |
| 2026-11-13 | `npm run build:isolated -- --working-tree` | 05:37:32.746 | 0 | PASS |
| 2026-11-13 | `node --env-file=.env.test.local .local/ui60/timetable-captures.mjs` | 05:40:58.019 | 0 | PASS |

Recorded completed command executions: 68; PASS 63; FAIL 5. The uncompleted interrupted build is separate; it is not a pass. Final required reruns passed.
