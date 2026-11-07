# Simpler voice and live AI check — 6 November 2026

## AI status

Ollama is reachable on loopback. A direct `gemma3:1b` request returned HTTP 200. A real signed-in Teacher then used the website's Generate button for a generic Grade 7 Science worksheet. The API returned HTTP 200 from `Ollama · gemma3:1b`; an editable 2,767-character draft appeared in approximately 20 seconds. No student data was included, and the draft was not saved, published or shared. No model change, download or cloud fallback was made. This supersedes the earlier low-memory/service-off observations; it does not guarantee available RAM under every later workload or validate the draft's educational accuracy.

## Voice: ordinary use

1. **Parent:** open a teacher message or school notice. The message now appears before the language/playback controls.
2. If the original's language is unknown, choose its actual **Message language**, then press **Listen**. This selects the voice language; it does not translate the message.
3. Use **Pause**, **Resume** or **Stop** while listening. Playback never starts automatically.
4. If an approved translation supplies a known language, press Listen directly; the redundant disabled voice-language dropdown is gone.
5. **Teacher:** the same controls are available on school notices and sent student updates. Changing the student/class/page or signing out stops the scoped controller.
6. **Read in** selects an approved translated message separately. If a translation is unavailable, the original remains visible with an honest fallback message. Originals remain unchanged; Hindi and Marathi are not guessed from their shared script.

The visible action is simply **Listen** / **सुनें** / **ऐका**, while its longer accessible name is retained for screen readers. The confusing Auto option is removed from the visible choice list. The buttons follow the existing blue palette and mobile tap-target styling. These are browser speech controls, not microphone input, voice commands, an IVR call or an Ollama TTS service.

## Verification

- Voice/controller/component/translation unit coverage passed: 23 tests across the existing and new focused files, including explicit language selection, known-language playback, pause/resume/stop, language changes, unsupported speech, original preservation and scope cleanup.
- Parent browser speech-control verification passed at 390 px. It reports the real browser API as present but zero real voice locales in the headless environment. It uses controlled speech responses for playback assertions; audible output is **not verified**.
- New Parent and Teacher browser checks passed with English/Hindi/Marathi interface labels, keyboard activation, original-English voice selection, pause/resume/stop, 390 px overflow checks and cancellation after route completion. External destinations were blocked.
- Translation integration passed: Teacher draft, Principal approval, Parent approved/original/fallback views, visible-text playback, acknowledgement identity, child/school isolation and temporary-record cleanup.
- Role navigation, all 23 destinations at four widths, typecheck and lint passed.
- Run `07df3255-3499-4846-b8d0-26976ae48fba` passed 7/9 checks initially. The new voice test asserted cancellation before route completion; it now waits for navigation and cancellation. The accessibility test selected the newly labelled, disabled Listen button instead of the acknowledgement button; it now scopes its existing focus assertion to `.ack`. No playback or acknowledgement assertion was removed.
- Focused rerun `917862e2-37e6-4e1c-a142-233fd35bb3ea` passed both corrected checks (2/2). An earlier unit assertion expecting the old long visible Listen label was updated to verify both the short visible label and retained accessible label in all three languages; the unit suite then passed.
- The existing school's 20 dataset hashes remained unchanged. No passwords, production configuration, database schema or dependencies were changed. Work remains uncommitted; no deployment was performed.

Run in the isolated local test checkout, with the local website already running:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3103'
npm run test:parent-voice
npm run test:translations
npm run verify:simple-voice
npm run verify:parent-voice
npm run test:translations:integration
npm run typecheck
npm run lint
```

Do not run database integration tests against a hosted project or load production `.env.local`. Test records are isolated and cleaned by their harnesses.

## One listening check still required

On the actual presentation laptop/browser, open the website, select the message's language and press Listen. Confirm sound, pronunciation, Pause and Stop yourself. Voice availability depends on the browser/OS and installed voices; the original text remains usable when speech is unavailable. The application does not call a paid TTS adapter, but browser/OS voice implementations have their own availability and privacy behavior. A successful controlled browser test is not proof of audible playback or fully offline voice support.
