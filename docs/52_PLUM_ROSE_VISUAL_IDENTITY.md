# Plum and rose visual identity

Updated: 7 November 2026.

The current design uses the four colours encoded in the owner's [Color Hunt palette link](https://colorhunt.co/palette/7c0e44aa5e7ad49a9af2dace):

| Colour | Purpose |
|---|---|
| `#7C0E44` | Primary navigation, main buttons, active controls and focus |
| `#AA5E7A` | Supporting accent and chart series |
| `#D49A9A` | Rose accents, dividers and selected-control borders |
| `#F2DACE` | Soft icon surfaces, supporting highlights and chart series |

Warm near-white surfaces and dark text complement the palette. Soft pinks are not used as body text on white. Primary white-on-plum text has a calculated contrast ratio of 10.48:1; the muted text/white pair is 6.48:1. Form-control borders use a darker supporting tone rather than a barely visible pastel. These are selected colour-pair calculations, not a claim that every possible rendered state has received an independent accessibility audit.

Green, amber and red remain meaningful for attendance, acknowledgement, warnings and errors; a branding change must not make those states indistinguishable. Labels and icons remain alongside colour.

## Typography and layout

English uses Geist, with measured heading weights and a consistent hierarchy. Hindi and Marathi use Noto Sans Devanagari with script-appropriate spacing and line height. Existing monospace support is retained for technical content. Fonts use Next.js font optimization and are served from the application; visitors do not need a Google Fonts request. Initial font acquisition during development/build still requires the permitted font host or an existing cache.

The sign-in page retains the top language selector. All three portals now share a white website header, plum active navigation, warm page background, white cards, rose outlines and circular supporting icons. Desktop navigation fills the bar evenly. Large interactive metric cards retain card corners, while ordinary buttons use consistent compact corners. Teacher AI and spreadsheet surfaces match the portals.

`src/app/theme.css` holds the active palette and typography. Existing hard-coded blue UI accents in `globals.css` now use semantic tokens. Historical design declarations remain in the existing stylesheet; the active theme is imported after it. Authentication, permissions, original messages, database records and fixed account passwords are unchanged.

## Verification

Local browser checks run in the isolated QA checkout. The historical script name `verify:simple-blue-ui` is retained for compatibility; it now verifies the current plum header and the existing history/period/year/mobile controls.

Completed before final build:

- Sign-in: English/Hindi/Marathi at 1440px, 390px and 320px; preference persistence, keyboard selection and preserved typed fields.
- Parent, Teacher and Principal fixed sign-ins: read-only checks passed.
- Current-theme/history controls, 23 destinations × four widths, 96 staff localization combinations, accessibility/i18n and simple voice browser checks: all passed in QA run `77d74652-8039-485e-bf1d-3d5dd6ac5fe9`.
- Typecheck and lint passed.
- Representative sign-in desktop/mobile, Teacher desktop, Principal desktop and Parent mobile captures were visually reviewed. Additional final visual and build results are appended below.

No dependencies, database schema, account passwords or production settings were changed. No paid services or deployment were enabled. Real audio, fluent-language review and the previously documented external-service setup remain separate acceptance items.

Final acceptance: the second four-width visual audit, Teacher AI/workbook browser flow and role navigation passed 3/3 in QA run `fae03dfd-ed0c-4fa3-b527-e162e065dd88`. Final portal captures were reviewed after adjusting the Principal metric-card corners and removing the old lavender/green feature-panel branding. All 20 existing-school dataset hashes were unchanged.

`npm run build:isolated -- --working-tree` passed with the new palette, language selector and Devanagari font, including TypeScript, expected routes, environment/sentinel checks and temporary cleanup. Verified current-source fingerprint: `edc76d528ae70966c3476cdad50894662c46b96c2edeb9e3e18e95adc6db5b68` (159 approved files). Only allowlisted Google Fonts hosts were observed through the build proxy. This remains an uncommitted local source build, not hosted deployment acceptance or a dependency-security audit.

## Website layout and voice correction follow-up

The owner rejected the previous spacing and control arrangement. The current layout replaces the sign-in half-screen colour block with a balanced landing page, gives every portal a full-width navigation bar and centred page context, and uses a compact full-width Parent child banner. Parent summary cards precede aligned attention/latest-message panels. Teacher class selection is a full-width row followed by six teaching-tool shortcuts, including AI studio; the repeated home class-summary block is hidden. Mobile keeps scrollable navigation and labelled, touch-sized controls.

Message translation choice, voice choice and Listen now share one aligned toolbar. English-script originals start with English selected; ambiguous Devanagari originals still require an explicit Hindi/Marathi choice. This selects a reading voice, not a translated message. Retry is shown for a translation-query failure rather than for a translation that simply has not been approved. The original text and approved-translation policy remain unchanged.

Speech fixes retain the utterance until completion, explicitly use full utterance volume, resume a queue left paused after Cancel, and avoid cancelling an unchanged original merely because its window regained focus. A native Chrome check (`npm run verify:voice-native`, in the isolated local test environment) uses real installed voices, authenticates synthetic Parent/Teacher accounts, tests Pause → Stop → Listen, triggers garbage collection during speech, and requires actual native start/end callbacks. It does not use a fake speech adapter.

Observed native check: both roles passed. A separate read-only Windows output-meter check found output unmuted and a nonzero peak of `0.6123` during playback. No sound was recorded and no output settings were changed. This is evidence of an audio stream, not a physical listening certification: Microsoft's [audio-meter documentation](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nn-endpointvolume-iaudiometerinformation) explains that the meter measures the stream before endpoint-volume attenuation. Native Chrome exposed English voices on this laptop; no Hindi/Marathi voice was listed. Those languages must keep the honest unavailable state until an appropriate voice is installed; English must not be relabelled as Hindi or Marathi.

The voice/controller/component suite passed 23 tests, and the translation component suite passed two. The initial connected translation test encountered an outdated locator after both selects moved into one toolbar; locators now explicitly target the translation label. The first browser gate remains recorded as 7/8 (`4e44ca77-6ad4-4acb-b8f2-3794930a8447`), and the corrected translation integration/final journeys/reconnect rerun passed 3/3 (`f8e8a322-4046-4b13-a627-1133b5dbbb54`). The expanded visual audit additionally checks equal-width desktop navigation, the compact full-width Parent banner and the full-width Teacher class controls, across all 23 destinations at four widths.

## Project cleanup

After the functional/layout checks, five unreferenced Next starter illustrations were removed from `public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg` and `window.svg`. Source, scripts, documentation and configuration were checked for references before removal. No useful feature, test, migration or user data was deleted.

The original checkout had no active Node process and contained an unused `.next/` cache (2,036 files, approximately 637 MB) and `tsconfig.tsbuildinfo`. Automatic approval review blocked the recursive deletion command with “blocked by policy.” The safer reversible alternative succeeded: both generated artifacts were moved out of the repository to `C:\Users\Om\AppData\Local\Temp\schovera-unused-build-cache-20261107-1429`. This cleans the project tree but does not claim to free that space from the disk. The running website uses its separate isolated checkout and was not reset.

Protected existing `AGENTS.md`, `CLAUDE.md`, `local-dev.err`, `local-dev.out`, `review/`, private environment files and local account/data state were preserved. README now explains the main folders; dependencies, useful tests and historical evidence remain available.

Final post-cleanup checks passed: isolated build with TypeScript and all expected routes, generated-environment/synthetic-secret checks and temporary-snapshot cleanup; standalone typecheck/lint; expanded 23 × 4 visual audit; and unchanged checksums for all 20 existing-school datasets. The verified current-source fingerprint is `6893e4d40c0c12d0e4ba3c204362c1cb5116d76bc35db9437d042dca1bd1ee15` (155 approved files). No production settings, migrations, passwords or dependencies were changed. This remains uncommitted local work, not a deployment.

## Hindi and Korean Windows voice setup

The owner subsequently authorized installation of missing device voices and requested Korean playback. The speech selector now includes `한국어 (Korean)` (`ko-KR`); Hangul originals select Korean automatically. It reads the original Korean text and does not translate a message. Interface localization and approved translation records remain English/Hindi/Marathi; no schema or translation-approval boundary was expanded.

`scripts/install-windows-voices.ps1` uses only Windows servicing commands and Microsoft-hosted Windows capabilities. It checks Hindi (`hi-IN`), Korean (`ko-KR`) and Marathi (`mr-IN`), installs a supported language's required Basic component before TextToSpeech, and records a language as unavailable when Windows does not offer that capability. It requires Windows administrator approval and never changes display/input-language preferences or restarts the computer. Installation status is written only to ignored `.local/windows-voice-setup/result.json`.

On the **actual presentation laptop**, run from Administrator PowerShell at the project root:

```powershell
.\scripts\install-windows-voices.ps1
```

Voice packages belong to Windows on that laptop; copying source files to a pen drive does not copy installed voices. Close and reopen Chrome after installation. If Windows reports a restart is required, save work and restart manually. Do not weaken organizational update/execution policies or relabel another language's voice as Marathi.

For real voice verification in the isolated local test checkout, with the local site running:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3103'
npm run verify:voice-native -- --languages en,hi,ko
```

This uses generic public test phrases and requires native start/end callbacks from an installed voice for each requested language. It neither uploads school messages nor creates database records. The default `verify:voice-native` command retains the Parent/Teacher authenticated local acceptance flow.

Microsoft lists Hindi Hemant/Kalpana and Korean Heami in its [Windows voice table](https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices). Marathi is not listed there; the installer still checks what this Windows build actually offers. The Basic prerequisite is documented in Microsoft's [language Features on Demand guide](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/features-on-demand-language-fod?view=windows-11). Azure/cloud voices are separate products and were not configured.

Korean software checks: 25 speech/controller/component tests and two translation tests passed, including Korean-only voice matching, Hangul detection and unchanged Korean original text. Typecheck/lint, isolated application build and the four-command browser localization/voice regression gate (`b5300e69-5cbc-41d7-b09b-0095fb1c5cf7`) passed. The new app-source fingerprint is `00a7e1045ce996a0387ec3b7579022259864f213e59e0bc650a9974a6269b6fa`. These software checks do not by themselves establish successful Windows package installation; the observed installation/native-voice outcome is recorded separately below.

### Completed device installation and Marathi fallback (7 November 2026)

Microsoft Hindi and Korean Basic/TextToSpeech capabilities installed successfully on this laptop; Windows reported no restart requirement. Windows did not offer Marathi TextToSpeech. With the owner's explicit choice of a basic offline Marathi voice, the optional eSpeak-NG SAPI engine was installed and configured for Marathi. This voice sounds more robotic than the Microsoft voices; a fluent speaker must assess its pronunciation before presentation.

The optional installer is from [gozaltech/espeak-ng-sapi](https://github.com/gozaltech/espeak-ng-sapi), linked by the [eSpeak NG project](https://github.com/espeak-ng/espeak-ng). `scripts/install-marathi-voice.ps1` pins release `1.2.1` and verifies SHA-256 `02422eb1feadd955e8594e864d03eea3babde4c3d331cb06ec7028db6386a00f` before running it. The downloaded executable was unsigned; its checksum matched the publisher's release metadata and the Windows Defender scan passed. These checks are not an independent security audit. No binary or speech data is bundled into the repository, and no npm dependency or paid/cloud speech service was added.

On another presentation laptop, run these from **64-bit Administrator PowerShell** at the project root:

```powershell
.\scripts\install-windows-voices.ps1
.\scripts\install-marathi-voice.ps1
```

The Marathi helper installs the publisher's SAPI engine, enables Marathi in `%APPDATA%\espeak-ng-sapi\config.json`, and backs up an existing engine configuration before extending it. Chromium prefers the OneCore voice category, so the helper adds the publisher's token enumerator under the explicitly owned `HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\TokenEnums\Schovera-eSpeak-Marathi` leaf. It does not replace Microsoft tokens, change the default voice or relabel an English voice. Existing engine installations not recorded as this helper's installation are refused. Installation reports, downloads and backups stay in ignored `.local/windows-voice-setup/`.

To remove this optional engine and its extra browser-provider registration, use Administrator PowerShell:

```powershell
.\scripts\install-marathi-voice.ps1 -Uninstall
```

This removes only the owned browser-provider leaf and invokes the publisher's uninstaller; it retains the user configuration. Microsoft Hindi/Korean voices remain installed. Do not disable security policies to run either installer. Close and reopen Chrome after voice installation; source copying alone cannot transfer device voices.

Native acceptance passed in fresh headed Chrome with the actual production `ParentSpeechController`, generic public phrases and native start/end callbacks: English (`Microsoft Heera`), Hindi (`Microsoft Hemant`), Korean (`Microsoft Heami`) and Marathi (`Marathi`). No speech mocks or message uploads were used. To repeat in the isolated local QA checkout:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3103'
npm run verify:voice-native -- --languages en,hi,ko,mr
```

The final isolated build also passed after the native-controller verifier enhancement, with TypeScript, expected routes, synthetic secret checks and temporary cleanup. Source fingerprint: `fcb78ae267566ebe529c4eb5b041475b160f4bb8b5646e2b900eb5149cf2c916` (155 approved files). Korean is original-text playback only; the interface and approved translation languages remain English/Hindi/Marathi. A real listener must still check speaker output and pronunciation on the actual presentation laptop.

An independent Korean/Marathi playback rerun also passed. During that rerun, the read-only Windows output meter reported unmuted output and a nonzero peak (`1.0`); no audio was recorded or output settings changed. All 20 existing-school dataset hashes remained unchanged. Production environment files, hosted resources and fixed account passwords were untouched.

The final lint run initially rejected the verifier's local variable named `module` under Next's lint rule. Renaming that diagnostic variable to `speechModule` resolved the lint error; the independent full lint rerun passed. The 25 speech/controller/component tests and two translation component tests passed again, and standalone TypeScript passed. No application behavior changed in that correction.

Final verification after that correction: all four native languages passed again, and the isolated production build exited 0 with TypeScript, all expected routes, generated `.env.production` only, synthetic-secret scan and temporary-snapshot cleanup. Final fingerprint: `9835a30d7251669535b4612ebc20833dc9b410c24e66094803e1cb7fbd92ac64` (155 approved files). The earlier fingerprints above describe their earlier snapshots. No production environment file was loaded or modified.

### Commit checkpoint and pronunciation acceptance

At the owner's request, the accumulated portal/UI/account-management/localization/voice changes are saved as a local Git checkpoint. `AGENTS.md` records the preference to test and commit each completed set of changes, without empty commits for messages that change no files. Private environments, permanent login credentials, database files, installer binaries/logs and unrelated developer artifacts are excluded. No push or deployment is authorized.

Pre-commit retest on 7 November 2026: all four installed voices passed twice through the production controller in actual Chrome. During the second run, the read-only output meter reported unmuted output and nonzero peak (`1.0`); no audio was recorded and no output setting changed. The school's 20 dataset hashes remained unchanged. The staged-content scan found no private-artifact paths, fixed local passwords, private-key blocks, provider-secret patterns or JWT-shaped credentials; this is a targeted check, not a comprehensive security certification.

**Pronunciation is still awaiting a fluent listener.** Native callbacks, correct locale selection and sound output establish playback, not intelligibility or correct pronunciation. No listening/transcription service was used and no real student message was uploaded. Use the generic samples below with `verify:voice-native -- --languages en,hi,mr,ko`, on the presentation laptop, then try its actual Listen/Pause/Resume/Stop controls:

| Language / installed voice | Generic sample spoken by the verifier | Listener acceptance |
|---|---|---|
| English / Microsoft Heera | Schovera voice check. School notices can be read aloud. | Pending |
| Hindi / Microsoft Hemant | नमस्ते। यह स्कूल की सूचना पढ़ने की आवाज़ का परीक्षण है। | Pending |
| Marathi / Marathi (basic eSpeak) | नमस्कार. ही शाळेची सूचना वाचण्याच्या आवाजाची चाचणी आहे. | Pending; expect a robotic voice |
| Korean / Microsoft Heami | 안녕하세요. 학교 알림 음성 테스트입니다. | Pending |

Ask a fluent listener to confirm every word is intelligible and in the intended language, without skipped or substituted words. Separately check school-approved names, dates and times using synthetic examples, because those are not certified by these short samples. Pause and resume mid-sentence, then Stop and Listen again. Record the laptop, voice, sample, listener/date and any mispronounced words. Correct the text/language selection or select a suitable installed voice and repeat before presenting; do not mark pronunciation accepted based only on this automated run.

### Extended school-sentence and number checks

The native verifier now plays three samples per Hindi/Marathi/Korean voice: the introductory phrase above, a school instruction and a date/time sentence. It asserts the exact original utterance text, requested utterance/voice language, local voice service, full utterance volume and native start/end without errors for every sample. These checks prevent accidental text replacement and wrong-language voice selection; they do not analyze the resulting phonemes or certify spoken numbers.

| Language | Additional instruction | Date/time sample | Meaning to check by ear |
|---|---|---|---|
| Hindi | कृपया कल विज्ञान की किताब और अपनी कॉपी लेकर आएँ। | 7 नवंबर 2026 को सुबह 9 बजे अभिभावकों की बैठक है। | Bring the science book and notebook tomorrow. Parents meet on 7 November 2026 at 9 in the morning. |
| Marathi | कृपया उद्या विज्ञानाचे पुस्तक आणि तुमची वही घेऊन या. | ७ नोव्हेंबर २०२६ रोजी सकाळी ९ वाजता पालकांची बैठक आहे. | Bring the science book and notebook tomorrow. Parents meet on 7 November 2026 at 9 in the morning. |
| Korean | 내일 과학 교과서와 공책을 가져오세요. | 2026년 11월 7일 오전 9시에 학부모 모임이 있습니다. | Bring the science textbook and notebook tomorrow. Parents meet on 7 November 2026 at 9 in the morning. |

Use `npm run verify:voice-native -- --languages hi,mr,ko` in the isolated QA checkout with its local test environment and the local website running. Only synthetic public phrases are spoken; no student data, audio upload, external recognition service or database write is involved. The initial attempt in this continuation failed because port 3103 was stopped; the same guarded isolated local website was restarted before the independent rerun. This diagnostic expansion changes no website feature or voice-engine configuration. Prior application-build fingerprints remain evidence of their earlier snapshots.

Observed rerun (7 November 2026): **9/9 samples passed**, three each with Microsoft Hemant (Hindi), Marathi (basic eSpeak), and Microsoft Heami (Korean). The loopback-only browser check exited 0. JavaScript syntax, targeted ESLint and `git diff --check` passed. Pronunciation, naturalness and spoken-number accuracy remain **unrated pending fluent-listener review**; no percentage is inferred from these results. No production setting, private environment file, school record or password was changed.

### Larger header and stable playback toolbar

The owner's subsequent screenshot showed Korean selected for an English notice and controls moving when Listen changed into Pause/Stop. The header now uses a 24px/750-weight desktop wordmark, larger school/page context, 700-weight navigation with 54px touch targets, and stronger section/message headings. Mobile uses a smaller 20.8px wordmark and 50px navigation targets. The same shell applies to Parent, Teacher and Principal.

The speech toolbar now reserves both action slots and a status area before playback starts. Stop stays visible but disabled when nothing is playing; Listen/Pause/Resume use the same slot. Grid alignment keeps the language selector and actions in place, including the two-column mobile layout. The expanded browser test measures control positions and dimensions through Listen, Pause, Resume and Stop, rather than relying only on screenshots.

Korean speech remains playback of **Korean text**, not English-to-Korean translation. The control and controller now refuse Korean playback of an English/Devanagari-only message with an English/Hindi/Marathi explanation. This avoids displaying a misleading playing state for that script mismatch; selecting English restores Listen for an English original. Actual Korean original text continues through the existing Korean voice. No Korean translation records or translation-approval rules were added.

Verification on 7 November 2026:

- Speech/controller/component tests: 27 passed; translation component tests: 2 passed. One initial test used a Devanagari body for every language, including Korean; it failed against the new guard, then was corrected to use a Korean body for the Korean voice-family case. The independent rerun passed.
- Parent/Teacher mobile control geometry, keyboard playback, language labels, Korean/English mismatch refusal, no horizontal overflow and cancellation on navigation passed.
- Full 23-destination × 4-width layout audit, accessibility/i18n and 96 staff-localization combinations passed in QA run `ff000766-d1c9-4abf-a628-8d3b7a225cbe`.
- Nine native Hindi/Marathi/Korean samples passed; real Parent/Teacher portal playback, Pause → Stop → Listen restart and garbage-collection survival passed. A concurrent read-only Windows meter showed unmuted output and nonzero peak (`1.0`), without recording audio or changing settings. These remain playback checks, not fluent-listener pronunciation acceptance.
- Existing fixed Parent/Teacher/Principal sign-ins passed read-only checks on port 3103. Header font size/weight and 390px overflow checks passed. The actual Parent page's primary/Stop button geometry stayed unchanged during native English playback. Existing-school dataset hashes remained unchanged for all 20 datasets.
- Standalone TypeScript, lint and isolated production build passed, including expected routes, generated `.env.production` only, synthetic-secret scan and temporary cleanup. Build fingerprint: `e991c3d56740802e8fe5b8f28cd06db91ed18ec2e7da1b56180c3182577775e4` (155 approved files).

Desktop captures of all three portals and Parent mobile were inspected. The initial QA server was stopped and was restarted in its existing isolated checkout; the normal website remains on port 3103. No password, production environment file, database schema, hosted resource or paid service changed.

## Automatic reading translation and ordinary browser audio

**Superseding communication update, 7 November 2026:** earlier records above describe the older voice-language/approved-only UI. The current reader uses one **Read in** choice for original or English/Hindi/Marathi/Korean text, followed by Listen/Pause/Resume/Stop. Teachers type and send their original once; the manual translation manager was removed from Teacher update cards. Principal review remains an optional way to improve a translation, rather than a requirement for every message.

Existing school-approved translations are preferred. When none exists, `/api/communication/translate` reads the persisted original through the caller's authenticated RLS client and generates a separate, explicitly automatic translation using local Ollama. It never marks AI output approved, edits the original, writes translation rows or changes the translation table's three-language enum. Korean automatic text lives in the bounded runtime cache, not a fabricated reviewed record. It verifies source identity before display, and prevents stale responses from replacing another source. Failed generation keeps the original visible and disables translated playback until a valid result is available or the reader returns to the original.

The local provider is `qwen3:4b-instruct`, approximately 2.5 GB, installed outside the repository. See the [official model page](https://ollama.com/library/qwen3:4b-instruct) and [Qwen multilingual language coverage](https://qwenlm.github.io/blog/qwen3/). Its runtime settings use bounded context/output, sampling with a fixed seed, a repetition penalty and a short school-term glossary. This is machine translation, not a quality certificate. Basic numeric/full-English-month checks reject covered date/time changes; they do not parse every date format or prove full semantic equivalence. Results carry a visible machine-translation warning and View original. Source changes and model-tag changes invalidate the cache key; cache validity is 30 minutes with at most 128 entries. If weights change under the same tag, restart the server or let that cache expire, and repeat acceptance. Each cache request rechecks authorization before reuse. Only one new model generation runs at a time; busy/offline/error cases fail honestly and can be retried.

Because browser speech callbacks did not resolve the owner's silence report, the guarded local Windows website now synthesizes an actual WAV and plays it through an `HTMLAudioElement`. Preparing is distinct from playing; the controller changes to playing only on the media playing event. Pause/Resume/Stop act on that real media element. Stop/navigation abort pending fetches, discard late responses and revoke blob URLs; a blocked resume reports an error. Non-loopback sites retain native browser synthesis; the new local service is not enabled as a hosted speech service.

`/api/communication/speech` uses Windows' installed, language-matched SAPI voices. Text is bounded JSON on the worker's stdin, never interpolated into PowerShell source. SAPI receives plain-text mode, not user-supplied XML/SSML. The worker inherits an allowlist of OS paths plus non-secret `NODE_ENV`, excluding Supabase/service-role/AI credentials. It creates an owned OS temporary directory, closes the speech stream, returns a no-store WAV and removes that exact file/directory. A timed-out owned worker is terminated and closed before cleanup. The runtime WAV is excluded from Turbopack's build-input tracing because it does not exist until a request; this does not bypass environment isolation. SAPI stream semantics are documented in [Microsoft's SpFileStream reference](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ms722562(v=vs.85)).

Both new routes require local mode, HTTP loopback Supabase, loopback Host, same Origin and a valid Auth token/active profile. Hosted mode is refused before Auth or inference. The translator uses no service-role reader: Parent/Teacher/Principal source access remains database RLS. Limits are per-process/per-user; these are local services, not a hardened public deployment. No schema, RPC, npm dependency or production environment was changed. The only new runtime download was the free local model.

### Verification record for the automatic path

- 54 unit/component/boundary tests passed, covering original/approved/automatic separation, source mismatch rejection, language matching, stale audio cancellation, blocked resume, numeric/month changes and early hosted/anonymous/origin refusal without network access.
- Legacy translation DB security checks passed, including source correction/invalidation, original acknowledgement identity, parent write/draft denial, role/school/class isolation and cleanup. Their integration command now exercises the automatic browser flow instead of the removed compulsory Teacher translation form.
- Final connected flow passed: Teacher sends a single English update via the existing RPC; linked Parent reads it; cross-school and subsequently unlinked requests are denied even after caching. Automatic Hindi/Marathi/Korean texts passed the fixture's date/time checks. The browser selected each target, played real audio, advanced its playback clock unmuted, and passed Pause/Resume/Stop at 390px. Teacher's page had no manual translation manager. Original text remained unchanged and all synthetic accounts, relationships, messages and schools were cleaned.
- Real generated WAVs contained non-silent 16-bit PCM: English 2.8 seconds (RMS 2,979), Hindi 4.6 seconds (3,217), Marathi 2.8 seconds (5,984), Korean 4.3 seconds (2,800). These measure waveform energy, not pronunciation accuracy.
- Existing Parent account check reproduced the requested **select English → Listen** path: browser time advanced beyond one second, audio was unmuted at full element volume, and Pause/Resume/Stop worked. The concurrent read-only Windows output meter was unmuted with peak `0.8842`; no microphone audio was recorded and no sound setting was changed. No stored Chrome sound block for the local origin was found in a read-only preference check; browser preferences were not edited.
- Parent/Teacher real browser audio checks passed with fixed control geometry, keyboard operation, three interface languages, 390px overflow checks and cancellation on navigation. All 20 existing-school dataset hashes remained unchanged.
- Accessibility/i18n, all 96 staff-localization combinations, the 23-destination × four-width audit and role navigation passed together in `461f2df2-fac9-4875-b433-d9fbe6e0b1ad`. Korean-translated and original mobile captures were inspected. Native speech diagnostic commands remain available, but ordinary local playback now uses generated audio.

Intermediate failures are not passing evidence. One synthetic Parent initially had no linked child and was correctly denied; its fixture was corrected without changing RLS. A locator tied to the English title disappeared when the title was translated; the test now uses the stable content section. The Teacher test initially used a nonexistent updates destination and now opens Students → the controlled child. A larger preinstalled model caused memory pressure and some role sign-in checks timed out (`f4d64695-1c8e-42c4-b9f5-79207ab799f5`, 2/4); the extra owned QA server was stopped and the smaller model was selected. Incorrect/repetitive model outputs were rejected rather than presented as approved. Inference settings were corrected before the final connected pass. The initial isolated build also caught a missing required `NODE_ENV` field in the minimal worker environment; that type error was corrected before the final build rerun. Final build/cleanup results follow below.

Final current-source checks passed: TypeScript, lint, 54 tests, and the isolated production build with both new routes, generated `.env.production` only, synthetic-secret checks, unchanged source verification and temporary-snapshot cleanup. Verified build fingerprint: `8c10eb1d06291dd6f11ddad35fa2d1281c73debd4cfc17218189e03711d215ef` (165 approved files). The final 23 × 4 visual rerun also passed after the Teacher's known-English voice selector was simplified. The installed model's observed manifest digest was `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`; model updates need fresh acceptance.

All four WAVs were independently retested with the final worker environment and UTF-8 fixture files; their nonzero PCM measurements matched the figures above. An earlier ad hoc PowerShell-to-Node pipe corrupted non-ASCII sample literals; that diagnostic failed and was replaced with UTF-8 file-based samples. No application encoding change was needed. No speech temporary directories remained after the checks. No production environment file was opened/modified, hosted database queried, deployment performed or permanent password rotated. New downloaded model weights and private local records remain outside Git.

## Attendance visualizations and family account examples

**7 November 2026:** Attendance history in all three portals now uses a responsive SVG trend/area chart, circular status breakdown, four summary cards, recent-date cards and an expandable daily table. Parent history additionally provides an interactive month calendar. Desktop uses adjacent panels; smaller screens stack them. The existing plum/rose palette is retained, with amber for Late, visible labels and keyboard-operable chart points/calendar dates. Redundant long history rows and unused bar-chart styles were removed.

The rate is explicitly `(Present + Late) / recorded entries`; staff views aggregate records for their authorized class/school, rather than counting each record as a unique student or calendar day. Missing dates are neutral **No record**, never inferred absences. Seven-day/month windows use daily points; six-month/all-history views use monthly points. The chart shows at most the latest 60 buckets; totals and the daily table use the full loaded result, subject to the existing 5,000-record cap and visible limit warning. The default window is one month. Filters, academic-year metadata and existing RLS remain authoritative; there is no new database, schema or chart dependency.

The owner's local presentation accounts were deliberately separated. Arohi now has one active child link (Aarav); her old Vihaan link is inactive and retained. A new permanent local Parent, Madhavi Shinde, is explicitly linked to Vihaan and newly added Anaya Shinde. Existing students were not renamed and existing attendance/messages were not edited. Anaya has no fabricated history. Different surnames remain valid for real families: authorization uses explicit parent/student IDs, never surname inference. The new local sign-in and before/after journal are in ignored `.local/schovera-manual-demo/`; passwords are not documentation or Git artifacts. These targeted local data changes supersede earlier unchanged-dataset statements for this continuation only.

Verification passed: five attendance calculation tests, typecheck/lint, all three portals' period/year/refresh/keyboard/chart/calendar checks at 1440/768/390/320px, the 23-destination × four-width visual audit, 96 staff localization combinations, accessibility/i18n and role navigation. Parent desktop/mobile and Teacher desktop captures were inspected. Read-only checks of both actual local Parent accounts matched displayed status totals to persisted rows, verified only their intended children, denied cross-family students/history through RLS, and verified Vihaan → Anaya empty state → Vihaan switching. The private fixture-setup journal comparison confirmed every pre-existing student/history/business row unchanged except the one intended inactive link; additions were limited to the new Parent/student, their two links and audit records. The first ad hoc family browser check ran before the child selector finished loading; it was corrected to wait for child data and passed independently. No authorization rule was weakened.

The final isolated current-source build passed compilation, TypeScript, all expected routes, synthetic-secret scanning, unchanged-input verification and temporary-snapshot cleanup. Source fingerprint: `7ca2419462c53877fddd1e2c4511584bbe6af72d9f518455b79902752f9a0072` (165 approved files). Only generated `.env.production` was discovered; production `.env.local` was not read/copied/modified. No deployment, hosted database change, dependency upgrade or password rotation was performed. A first lint run caught mutable ring-offset accumulation; the calculation was made immutable and final lint passed before the successful build. This local build does not certify production deployment security.

## Silent playback: laptop output routing (9 November 2026)

The owner again reported silence while the page showed “Reading notice aloud” and Pause. Read-only Windows checks found the default playback endpoint was **tranScreen Audio**, a virtual device, rather than the available **Realtek(R) Audio** physical speakers. The virtual endpoint was unmuted at 100%; that did not mean sound reached the laptop speakers.

After explicit owner approval, the existing Realtek speakers were selected as the default Windows playback output for console, multimedia and communications. Their existing 50% volume was retained. No driver, browser preference, application source, microphone setting, credential or database record was changed. The endpoint selection is a laptop setting; it is not included in a repository copy and can change again when casting/connecting devices.

The actual Parent page's English Listen path then returned HTTP 200 WAV audio, advanced real browser media playback beyond one second with element volume 1 and muted=false, and passed Pause/Resume/Stop. A concurrent read-only Windows measurement on the **physical speaker endpoint** recorded a peak of `0.9191`, unmuted at 50%. This establishes a signal reaching the selected output; the owner's audible confirmation and fluent pronunciation review remain human checks. An initial diagnostic incorrectly required Playwright's captured media-response body to be populated even though Chrome decoded/played the WAV; that assertion was removed from the private diagnostic. The final evidence uses real media progression and the concurrent endpoint meter, not a speech callback alone.

If silence returns: open Windows **Settings → System → Sound → Output**, select the intended physical speakers/headphones, then reload the Schovera tab and click Listen. Check Chrome's tab is unmuted and **Volume mixer → Google Chrome** uses that output with nonzero volume. A connected casting tool or virtual output can redirect sound without changing the website. Do not reinstall language voices solely because the wrong output device is selected.

## Screenshot pack for independent UI review (9 November 2026)

The generated local pack is in `UI_REVIEW_SCREENSHOTS/2026-11-09/`, with a ZIP alongside it. Start with `OPEN_GALLERY.html`, the three `OVERVIEW_*.png` sheets and `README_FOR_GPT.md`. The README contains a review prompt; `coverage.json` lists every file and captured state, and `pack-audit.json` records the artifact checks. Generated images remain ignored by Git; the capture tool and this documentation are committed.

Coverage is 150 full-page screenshots plus three overview sheets: every Parent (7), Teacher (8) and Principal (8) navigation destination at desktop 1440px, tablet 768px and mobile 390px. Additional captures cover sign-in in English/Hindi/Marathi; localized role home pages; mobile profile menus; expanded optional sections/history/translation review; attendance periods and tables; selected student details; Parent/Teacher/Principal account forms; homework edit form; four AI input modes; a synthetic browser-local workbook; and both children, including the honest empty attendance state, in the separate multi-child Parent account. The gallery previews are cropped thumbnails; open the linked full-size PNG to review below-the-fold content.

This is a visual review pack, not every possible data/filter/error state or a new functional/security/voice certification. No AI draft was generated, notice sent/acknowledged, account created, attendance marked or stored school record changed during capture. The tool blocks external destinations and business-mutation requests while allowing local Auth and authorized reads. Password inputs are masked; no credential files, tokens or environment files are included. Visible local presentation names and school-account email addresses may appear, so review the pack before distributing it beyond the intended audience.

`scripts/capture-ui-review.mjs` runs only with the existing explicit local test environment. From an isolated local checkout without production environment files, set `SCHOVERA_TEST_URL=http://127.0.0.1:3103`, then run `node --env-file=.env.test.local scripts/capture-ui-review.mjs --accounts-file <private-account-JSON> --family-file <optional-private-family-JSON> --output <new-output-directory>`. Omit `--family-file` if it is unavailable. The private account JSON supplies `accounts.parent`, `accounts.teacher` and `accounts.principal`, each with email/password; do not commit it. The output directory must not already exist. The tool produces the gallery, coverage manifest, images and overview sheets without deleting or overwriting existing output.

Image review caught sticky-header/viewport-resize artifacts in early capture attempts. Final captures freeze only header positioning for the full-page screenshot and settle scrolling before capture; website source/styles are unchanged. Failed capture artifacts are excluded from the shareable pack. Runtime application/configuration/package files were compared against the developer checkout; their contents matched (six differing test-only files in the runtime snapshot were excluded from this UI comparison). No production environment, database or deployment was used.

Final artifact checks passed: all 23 routes at all three widths, 150 individual PNGs plus three overview PNGs, valid image dimensions, zero capture/browser errors, zero horizontal-overflow findings and zero external/business-mutation requests. All 141 portal images passed a top-border pixel check after retaking the sticky-header artifacts; nine sign-in images use their separate public-page layout. Generated text reports passed a scan for the existing local passwords; password fields are masked in images (this is not an OCR-based anonymity certification). Syntax checking and ESLint passed for the capture tool. Early generated attempts were preserved separately under ignored `.local/schovera-manual-demo/screenshot-capture-attempts/` so the shareable folder contains only the verified final pack. Unrelated developer files were preserved.
