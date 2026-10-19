# Task 32J — Parent voice accessibility

**Status:** browser text-to-speech controls are implemented for the Parent workspace. Automated speech behavior uses synthetic text and mocked browser speech engines. A browser capability inventory is separate from actual audible playback; no human verified sound in this task.

## Parent UI

Parents can use the controls on school-wide notice cards, the latest child update on the Parent home page, child-specific update cards, and the latest communication in the Parent student profile. A language selector and named Listen/Pause/Resume/Stop buttons are keyboard-accessible. The active card shows a polite status message. Nothing speaks automatically. Empty text disables Listen. Original notice/update strings are passed to the browser without translation or storage.

The controls use the existing Parent data path and its selected-child/school RLS filters. They do not fetch extra message data. School notices retain their existing school-scoped query. Child-specific updates are drawn only from the already-loaded currently selected child's update list/profile. No Teacher or Principal UI receives a playback action.

## Browser speech and language policy

Playback uses the browser's `speechSynthesis` and `SpeechSynthesisUtterance` APIs. The controller waits briefly for asynchronous `voiceschanged` notifications, then chooses only a voice matching the selected language. English prefers `en-IN`, then another English voice; Hindi and Marathi require a Hindi (`hi-*`) or Marathi (`mr-*`) voice. The utterance's language tag matches the selected voice. A missing matching voice produces a localized fallback and never speaks the text in an unrelated language.

There is no reliable stored language metadata on these existing notices/updates. The automatic choice therefore detects clear Latin-script English only. Devanagari is used by both Hindi and Marathi, so the Parent must select which language the original message uses. This is a playback voice choice, not translation; the message is never rewritten. English fallback is not used to read text when a Hindi/Marathi voice is missing.

The interface is localized in English, Hindi and Marathi. If the browser lacks speech support, a suitable installed voice, or a functioning speech engine, the original text remains visible with an explanatory message. Browser/OS voice lists and pronunciation differ. Some platforms may use OS or network speech services; this implementation does not promise that speech processing is offline. It adds no remote speech API, audio file, microphone permission, recording, or message-text logging.

## Reliability and privacy

One Parent-scoped controller owns playback. Starting a second notice cancels the first; an async voice-list wait is canceled when superseded. Scope changes (Parent account, selected child, or Parent section), unmount (including logout/role transition), and explicit Stop cancel speech. Pause/resume are exposed only while active. A “Reading aloud” announcement is emitted only on the browser utterance's `start` event. Errors return to a visible-text fallback.

No message text is written to browser storage. The selected language choice is local React state only. The feature does not change database schema, message records, acknowledgement behavior, RLS, school-entry polling, or Realtime.

## Demonstration

1. Sign in to a local Parent account and open Home, Updates, Profile, or School notices.
2. Choose Auto for clear English, or explicitly choose Hindi/Marathi for Devanagari text.
3. Select **Listen to notice**. The state first says it is preparing; it changes to reading only after the browser starts the utterance.
4. Pause, resume or stop. Start another card, switch child/section, or sign out to verify the previous utterance is canceled.
5. To demonstrate Marathi, use a browser/device with a Marathi speech voice installed/enabled in its operating-system speech settings, select Marathi on a Marathi notice, and confirm the selected voice is `mr-*` if inspecting browser capabilities. If no Marathi voice is listed, show the honest fallback rather than claiming Marathi audio.

For the isolated local mocked-browser UI exercise, generate ignored local env files as documented in [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md), start the app with `npm run dev -- --hostname 127.0.0.1`, then run `npm run verify:parent-voice` in another PowerShell window. It records the real browser's API/voice inventory before replacing playback with a mock; no notice is audibly played or sent to a speech service.

The automated browser capability check records whether the real browser exposes the speech APIs and which voice locales it reports; it does not play private messages and does not assert that audio was audible. Unit/component tests use a mock speech engine and synthetic strings, so those passes establish control logic only.

## Verification record

Automated results: `npm run test:parent-voice` passed 13 tests; TypeScript and lint passed; the local `verify:parent-voice` browser test passed at 390px with exactly one mocked utterance, pause/resume/stop, keyboard focus and no HTTP request triggered by playback. The real headless Chromium reported both speech APIs present but zero voice locales, so audible speech was not tested. `verify:accessibility-i18n`, role navigation, Student Profile, entry-polling (4 tests), RFID (22), gateway (43) and credential-attribution (20) passed in the local-only worktree. Reconnect passed on its independent rerun after one transient timetable-render timeout. `npm run build:isolated` passed from commit `66ec5bb`: all expected routes and TypeScript passed, Next saw only `.env.production`, synthetic private sentinels were absent, observed build egress was limited to the two approved Google Fonts hosts, and the generated snapshot was cleaned. No real child data or hosted endpoint was used.

The isolated build is local compilation evidence only; it is not a hosted deployment review and does not resolve the previously documented Next.js security advisory.

## Known limitations / future work

- OS/browser speech availability, voice quality, pronunciation and offline behavior are not guaranteed. A real installed Marathi voice and actual audible playback must be checked on the intended demonstration device.
- There is no persistent language metadata for free-text messages. Hindi/Marathi selection is manual for ambiguous script; there is no automatic translation.
- Very long messages are passed intact to the browser, but browser engines may impose their own limits or fail; the visible original remains available.
- Future translation must be human-reviewed, separately stored/versioned, clearly labelled and retain an easy View Original action.
- SMS/IVR requires separate consent, provider/privacy review, opt-out, safe templates, delivery status and cost controls. No SMS/IVR or offline speech service is part of this task.
