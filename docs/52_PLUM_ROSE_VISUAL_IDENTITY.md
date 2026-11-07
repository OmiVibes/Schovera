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
