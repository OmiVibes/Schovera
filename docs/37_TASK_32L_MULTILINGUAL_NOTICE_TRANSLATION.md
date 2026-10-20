# Task 32L — Reviewed multilingual school communication

## Implementation and baseline

Human-entered English, Hindi and Marathi language versions are stored separately from original Teacher updates and Principal school announcements. There is no automatic translator, external translation API, paid service, AI prompt submission or new speech endpoint.

Starting HEAD was `d7c28014fabbe0af4fd2ebe9d95ed4b09c9f7ea7` on `feat/task32k-prep-demo-readiness`. The requested security commit `baa18ceedb1847c374af4f809094b8fb2f922d04` was already an ancestor. Both histories are preserved on `feat/task32l-multilingual-notices`; no merge into main was needed.

## Workflow

1. A Teacher opens the student’s sent communication and selects **Manage translations**. Teachers can manage only their own updates in currently assigned classes.
2. Select a target language, enter a translated title and message, and compare them with the original in the adjacent preview. Save creates a draft; it does not change the original or publish a translation.
3. Submit the saved draft for Principal review. Pending versions remain private to the authorized staff.
4. The same-school Principal opens **Communication**, expands **Manage translations**, checks the original against the language version, confirms the meaning/dates/amounts/instructions checklist, and approves it. Approval is enforced by the database, not just button visibility.
5. A Parent selects a reading language. Only an approved, current, authorized version can replace the visible text. **View original** restores the original with one action. A missing, pending, stale or failed translation query shows the original and an explicit status.

Principals manage school-announcement translations from **School notices** through the same draft/submit/approve stages. The current roles have no separately appointed translation reviewer, so Principal approval is the conservative review boundary. A Principal may draft and review their own school announcement; the software does not certify bilingual skill or enforce two different people. Schools must select competent reviewers. Teachers cannot self-approve.

Saving changes to any approved language version removes its approval and returns it to draft. Optimistic `updated_at` checks reject stale editing/review actions. Original title/body values must still match those the editor reviewed. Corrections are new original update identities; old translations become Needs Review and never carry over automatically.

## Data model and security

Local-only migration: `20261020110000_add_reviewed_communication_translations.sql`.

`communication_translations` contains one version per original/language, with exactly one FK to `student_updates` or `announcements`, school, title/body, language, status (`draft`, `in_review`, `approved`, `needs_review`), original SHA-256 content hash, author, reviewer, approval timestamp and creation/update times. All approval metadata is set server-side. The original records and `acknowledgements.update_id` remain unchanged.

Browser roles have SELECT only. A single checked RPC performs save/submit/approve, derives school from the original, locks the source and translation, validates the reviewed source text and expected translation version, and appends an audit event without message text. Direct browser inserts/updates/deletes are denied. No original RLS policy is weakened.

- Parent SELECT requires an active same-school profile, approved status, current source hash and a current linked child (or a linked child in the school for announcements). Drafts and superseded-source translations cannot be read through REST even if IDs are known.
- Teacher management requires authorship and a current class assignment. No other Teacher’s draft or unrelated class is accessible through this feature.
- Principal management/review requires an active profile in the original’s school. Other-school Principals and anonymous callers cannot read/manage these versions.
- Text edits invalidate approvals through triggers. A correction insert serializes with source review, invalidates the old source’s versions and leaves the old original unchanged. A new correction must receive its own translations and approval.

RFID/entry events, classroom attendance and acknowledgement RPCs are unchanged. No translation table is added to Realtime. Parent translation reads are bounded to one selected original/language; staff drafts load only after expanding the editor. Parent focus/online events or the explicit retry control recheck an approved version. An already displayed version is not an instantaneous revocation signal; new source data remounts its content and cancels playback, and the next authorized refetch removes revoked approval. Hosted deployment requires a separate migration/deployment review.

## Parent UI and speech

Reading-language selection is independent of interface language. The existing originals have no reliable source-language field, so the UI says the original language was not recorded. For an original message, use the existing speech selector if detection is uncertain; Devanagari is not automatically classified as Hindi or Marathi. No source language is inferred from the Parent interface setting.

Approved versions pass their explicit target language and currently displayed title/message to the Task 32J controller. English requests an English voice (preferring en-IN), Hindi a hi voice, and Marathi a mr voice (preferring the matching Indian locale). The speech language control is fixed while displaying an approved language version, preventing accidental unrelated-language playback. Missing voices leave the text visible and show the existing helpful fallback.

Changing reading language, visible notice text, child, section, account or notice cancels active playback. Pause/Resume/Stop are retained. Text is rendered as React text nodes, never HTML, and no message content or language selection is persisted by this feature. Browser/OS speech may have platform-specific network behavior; the application adds no translation/TTS vendor request. Automated speech checks use mocks; real pronunciation and audible English/Hindi/Marathi playback still require the manual guide in [Task 32K-PREP](36_TASK_32K_PREP_INTERNATIONAL_DEMO.md).

## Safe local commands

Use the isolated worktree procedure in [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md) and [Task 32K-PREP](36_TASK_32K_PREP_INTERNATIONAL_DEMO.md). Never start Next from a checkout containing the hosted `.env.local`. Keep the local stack on its loopback-bound Docker network; never use link, remote db push or a reset.

```powershell
# Only after confirming local Supabase status is loopback; keep key output private.
npx supabase migration up --local
npx supabase db lint --local
npm run test:translations
npm run test:translations:db

# In the clean local worktree with generated local env files:
npm run dev:rfid-local
# In a second terminal in that worktree:
npm run test:translations:integration
```

The DB-only variant creates uniquely named synthetic schools, users, classes, students and sources, tests approval/RLS/invalidation, and verifies its cleanup in `finally`. The full integration adds real local browser Teacher draft creation, Principal approval, Parent three-language reading/speech controls, acknowledgement, child switching, literal HTML escaping, 390px layout and external-request refusal. Speech is mocked; no physical person or real school record is used. Do not forcibly kill the fixture process: if cleanup fails, preserve the error and inspect only the controlled local fixture IDs.

## Verification record

Implementation checks and final regression results are recorded after the current local run. A successful isolated build establishes compilation with synthetic local settings; it does not certify hosted security, voice pronunciation or translation accuracy.

## Manual demonstration

Use local synthetic accounts only. Send an Important student update with a clearly labelled synthetic date/time/amount. Enter a Hindi draft as its Teacher and show that the linked Parent still sees the original/fallback. Submit it; have the same-school Principal compare and approve it. Return to the Parent, select Hindi and show the approval label, then use View original. Repeat with human-checked English and Marathi examples. Select Listen only on a browser with a matching installed voice; verify Pause/Resume/Stop. Acknowledge the update and show that all language views retain the same original acknowledgement. Switch linked children and verify the prior child's text is absent. Send an original correction; show Needs Review on the old translation and original/fallback on the new communication until separately reviewed.

The integration script creates and cleans its own temporary accounts automatically. It does not leave persistent demonstration logins. Existing local seed accounts can be used for a manual rehearsal only if their synthetic data is intentionally retained; do not overwrite or clean shared local fixtures casually.

## Limits and future work

Human entry and Principal approval do not guarantee a correct translation. Reviewers must check meaning, names, dates, fees, examination instructions and language quality; machine assistance is absent here. Source-language metadata and a dedicated bilingual reviewer role can be considered separately. The current editor retains the latest draft/approval metadata per original/language and audit actions, not a full text-version archive. Retention/export/privacy policy remains a school decision before using real child data.

A future school-approved AI draft provider can write through the same draft boundary; its output must remain unapproved until reviewed. It would require explicit privacy/provider approval and must preserve the original, content binding and Parent read contract. No private message may be silently sent to an online translator or LLM.

SMS/IVR remains future work requiring consent, verified numbers, approved providers/templates, opt-out, delivery evidence and cost controls. No provider or secrets are added. Task 32M is not started; its scope and any hosted processing require separate review.
