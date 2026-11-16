# M2 — Smart attendance and exception management

16 November 2026. **Ready for local software review within the tested synthetic scope.** M2 builds on M1 `106f9123946526ad0795ed7426fe47fba65d7cb6`. It does not implement M3, certify a physical reader/Pi, or authorize public deployment or real-school use.

## Behavior before and after

| Portal | Before | M2 |
|---|---|---|
| Teacher | M1 draft/final registers, revision checks and correction history; separate gate history | Explicit unsaved/pending/held/unavailable labels, register metadata, unsaved bulk Present, roster search, practical discard guards, evidence review and meaningful correction reasons |
| Parent | Published classroom history and separate gate history | Current-class, school-local-today confirmation; unavailable lookup and unconfirmed current class are distinguished from earlier saved history; no staff notes or reader secrets |
| Principal | Daily attendance counts reduced from a row-limited client query | Authorized SQL totals, explicit finalized/legacy/unfinished coverage, unreviewed exception totals, school-level unresolved receipt count and bounded keyset class navigation |

Present, Absent and Late retain their existing meanings. A default or draft Present is not published classroom attendance. Missing cards/readers never force absence. A staff evidence review records what was checked without changing attendance or proving safety. Finalized status changes still use M1 optimistic revision checks, immutable receipts and traceable corrections, now requiring at least eight characters and two words (maximum 500). An exact retry of an already committed M1 receipt retains its original behavior; an uncommitted older short-reason intention is retained for review rather than rewritten or forced.

## Reconciliation contract and limits

The seven narrow flags are: saved Present/Late without a time-matching check-in when an active reader is configured; time-matching gate evidence without published classroom confirmation; gate evidence versus saved Absent; multiple separate check-ins; uncertain clock; delayed/inconsistent receipt time; and sequence gaps/out-of-order evidence. A ten-minute delay threshold is a review prompt, not a bell-time or lateness policy. Missing-reader coverage suppresses the missing-scan rule. No rule infers physical presence, identity or safety.

Named evidence uses accepted v2 assignment-bound events only. Legacy reference-only events are counted separately and excluded from named reconciliation. Observed school-day evidence is used where time is qualified; uncertain events can be reviewed by receipt day. Timestamps in evidence cards are explicitly UTC. Current roster membership is **not historical class membership at scan time**.

Unknown/unmatched/unresolved receipts are counted only at the authorized Principal's school by receipt day. The existing receipt contract cannot reliably distinguish unknown, inactive, unassigned or ambiguous causes; M2 does not invent those subcategories or associate an unresolved receipt with a child/class. Neither card identifiers, credential assignments, capabilities nor signing material are returned in these UI read models.

Staff review is tied to the current fingerprint and request ID, with fresh role/class/school/session authorization. Changed intent cannot reuse an ID; changed evidence rejects a stale review. The fingerprint conservatively includes the class register revision, so a later class revision can require reviewing evidence again even when one child's status is unchanged. “Needs review” means unreviewed under these rules, not a confirmed physical incident. Parent reads cannot access the staff review table or review RPC.

Principal totals aggregate the complete authorized SQL scope before serialization, avoiding PostgREST's 1,000-row cap. Classes use keyset pages of 40, with a maximum requested limit of 100. A Teacher class review above 500 active students fails closed instead of returning a partial roster. These bounds were tested; sustained scale/load performance was not certified.

## Additive migrations and offline compatibility

Only the isolated QA database was migrated, from 42 to **46 migrations**, using `npx --no-install supabase migration up --local`. No reset, existing-row backfill, enum rewrite or production migration was performed.

| Migration | Purpose |
|---|---|
| `20261116110000_attendance_exception_review.sql` | Staff-only review records/index, private authorized evidence functions, class review, idempotent review write, exact Principal summary and sanitized Parent confirmation |
| `20261116111000_attendance_correction_reason.sql` | Execute-restricted M1 inner writer and compatible wrapper; meaningful reasons for new finalized changes; preserve committed-receipt retries |
| `20261116112000_attendance_review_snapshot.sql` | Serialize class review with the existing class/day register lock and expose consistent confirmation metadata |
| `20261116113000_parent_current_class_confirmation.sql` | Prevent a same-day former-class mark from appearing as current-class confirmation after a transfer; preserve authorized history |

All prior migrations, gateway storage, canonical school-operation envelopes, capture/replay implementation, RFID/account launchers and dependency lockfile remain unchanged. Status responses add class/date metadata; a signed capture lease now sees only its own class/date scope. Fresh same-Teacher authenticated synchronization retains its existing authorization. No raw message/register payload is exposed by the held-work cards.

Held operations show their identity, available class label, register date and reason-specific next steps. A past-day hold does not mark today's register as conflicting. The original canonical intention survives unchanged. Retry cannot resolve a stale conflict/revocation by force. Full operator resolution remains deferred: inspect retained work, reload authoritative state, and make a new deliberate authorized write with a new ID/revision/reason where appropriate; do not edit or discard an unfamiliar canonical operation.

Unsaved classroom marks/reason changes are guarded for ordinary same-window links, class/date switches, explicit reload, sign-out and browser close/reload where browsers permit. **Native browser Back/Forward cancellation is not guaranteed by this App Router implementation.** This is not a general form/PWA outbox. New review-note drafts do not gain a universal navigation guard.

**Excused is deferred**, as allowed by M2: enum/storage validation, reporting, profiles, translations and versioned offline consumers need a coordinated rollout. It is never silently mapped to another status.

## Files changed

Only the following M2 files belong to this milestone; the pre-existing edit to `docs/45_TASK_32T_HOSTED_DEMO_PROVISIONING.md`, `CLAUDE.md` and `review/` remain excluded and preserved.

- `package.json`
- `scripts/verify-school-operations.mjs`
- `src/app/api/school/operations/route.ts`
- `src/app/layout.tsx`
- `src/components/school-entry-panel.tsx`
- `src/components/schovera-app.tsx`
- `src/lib/ui-copy.ts`
- `src/lib/use-school-operations.tsx`
- `docs/62_M2_SMART_ATTENDANCE_AND_EXCEPTION_MANAGEMENT.md`
- `scripts/attendance-demo/cli.mjs`
- `scripts/attendance-demo/mock-reader.mjs`
- `scripts/attendance-demo/mock-reader.test.ts`
- `scripts/verify-attendance-review.mjs`
- `src/app/attendance-review.css`
- `src/components/attendance-review.tsx`
- `src/lib/attendance-review-copy.mjs`
- `src/lib/attendance-review.test.ts`
- `src/lib/attendance-review.ts`
- `src/lib/use-unsaved-attendance.test.tsx`
- `src/lib/use-unsaved-attendance.ts`
- `supabase/migrations/20261116110000_attendance_exception_review.sql`
- `supabase/migrations/20261116111000_attendance_correction_reason.sql`
- `supabase/migrations/20261116112000_attendance_review_snapshot.sql`
- `supabase/migrations/20261116113000_parent_current_class_confirmation.sql`

## Verification, failures and preservation

Tests ran in the existing approved QA checkout `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, Supabase `127.0.0.1:54321`, owned web ports 3104/3105. The developer `.env.local` was never opened, copied, hashed or modified. Known synthetic test credentials were redacted in the retained runner logs. Private ignored evidence: `.local/schovera-manual-demo/m2-20261116/`; focused captures/results remain in QA `.local/attendance-review-<id>/`. No credentials, SQLite files, captures or execution logs belong in the commit.

- **345 non-integration tests in 42 files passed**; final TypeScript and lint passed without warnings. This includes new reconciliation, register-state, meaningful-reason, held-scope, mock identity/replay and unsaved-guard coverage. RFID/gateway unit subsets are included in that total.
- Focused M2 HTTP/RPC/browser acceptance passed: role/class/school denial; lease-status isolation; real signed mock ingestion and replay; no scan-created attendance; mobile keyboard/bulk/draft/finalize; staff review without attendance mutation; concurrent idempotent reviews; stale evidence; correction reason; missing-card fallback; delayed/uncertain/legacy/unresolved evidence; unavailable Teacher/Parent reads; class transfer; held canonical preservation; current versus past-day state; fresh-session denial; en/hi/mr in all three portals and no page overflow in executed states.
- M2 exact-count fixture verified **1,004 saved records**, **1,005 enrolled students** and all **46 classes** across pages 40/6, plus oversized-scope refusal. The bulk rows are explicitly SQL-created scale fixtures, not proof of 1,002 Teacher UI submissions. AUD-01 communication boundaries through 2,005 and its 2,007-row correction case passed separately.
- Relevant M1 integrity, attendance, school-operation capture/restart/replay, connected journeys, RFID v2/gateway integrations, reconnect, staff localization (96 combinations), role visual routes (23 at four widths), accessibility/i18n and schema lint passed. Tests retained their existing assertions; the existing school-operation verifier gained a pending-state assertion.
- All **20 protected-school dataset hashes remain unchanged**. Final comparison verified **72 protected tracked files** and **243 executable source/script/migration inputs matching QA**. Existing dependency specifications, old package scripts, prior migrations and unrelated documentation are preserved. QA versions remain Next/eslint-config-next 16.4.1, Zod 4.6.6 and sharp 0.35.5. No dependency audit or upgrade is claimed here; the prior moderate lint-tool findings remain open.
- Owned synthetic schools/accounts, SQL rows and local operation rows were cleaned by scoped fixture ownership. The deterministic rehearsal's cleanup was independently checked. No existing account/password was changed. Owned web processes were stopped after verification; Docker was retained. Ollama was not started by M2.

Failed attempts are retained, not retroactively relabelled passing:

1. The new mobile probe tried a hidden desktop Home link. It now opens the real More pages menu and keeps the unsaved-discard assertion.
2. The new probe expected an unresolved transport receipt as a normal return; the existing transport correctly throws `DefinitiveRemoteAttention`. The assertion now verifies that typed result and the persisted unresolved count; transport behavior was not weakened.
3. An exact accessible class-picker label lookup failed. The product markup now uses an explicit label/ID association; the same exact lookup passes.
4. One unchanged reconnect run timed out on Teacher timetable readiness after its attendance recovery checks passed. An unchanged complete rerun passed. The timing/remount cause remains unconfirmed; no timetable implementation/assertion/timeout was changed.
5. One later M2 run timed out waiting for current-day Parent confirmation after the new Teacher-unavailable check. The complete rerun passed with failure-capture instrumentation only; its cause remains unconfirmed. No Parent assertion or timeout was relaxed. Diagnostic captures are retained on future failed runs, not emitted as public data.

An initial lint run also emitted a React cleanup-ref warning with exit 0. It was corrected using a stable invalidation callback; no lint rule was disabled. A preliminary local diagnostic edit had malformed shell quoting and was corrected before execution; it changed no data or application behavior.

**Final isolated build: PASS.** Next 16.4.1 compiled, completed TypeScript and generated all expected routes. Only generated production environment configuration was used; synthetic private sentinels were absent, source inputs remained unchanged, and the exact temporary snapshot was cleaned. The limited proxy observed only fonts.googleapis.com and fonts.gstatic.com; it is not an OS network sandbox. Build identity: Uncommitted source snapshot SHA-256: 32486f1ac1e90755bb93a66a6524bbbf0cdeb09be032ca6300a2608904e7b326; 204 approved files. This is not a committed release. This is working-tree compilation evidence, not hosted acceptance.

### Exact execution ledger

Times below are UTC on 16 November 2026; IST is UTC +05:30. Repeated runs overlap in coverage and are not independent feature totals. All commands run in QA except the root isolated build. Original failed runs remain in this table. Logs are relative to the ignored evidence directory above.

**61 executions: 56 PASS, 5 FAIL.**

| # | Command | UTC start | Exit | Result | Log |
|---:|---|---|---:|---|---|
| 1 | `node --env-file=.env.test.local .local/m2/preserve.mjs` | 09:33:54.591 | 0 | PASS | `01-m2-preserve-1794821635299.log` |
| 2 | `npx --no-install supabase migration up --local` | 09:35:17.156 | 0 | PASS | `02-migrate-local-1794821720822.log` |
| 3 | `npx --no-install supabase db lint --local` | 09:35:20.823 | 0 | PASS | `03-schema-lint-1794821723233.log` |
| 4 | `npm run typecheck` | 09:35:23.244 | 0 | PASS | `04-typecheck-1794821731124.log` |
| 5 | `npm run lint` | 09:35:31.126 | 0 | PASS | `05-lint-1794821747485.log` |
| 6 | `npm run typecheck` | 09:50:36.389 | 0 | PASS | `06-typecheck-1794822645602.log` |
| 7 | `npm run lint` | 09:50:45.659 | 0 | PASS | `07-lint-1794822663082.log` |
| 8 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 09:51:03.084 | 0 | PASS | `08-units-1794822701570.log` |
| 9 | `npx --no-install supabase migration up --local` | 09:52:38.716 | 0 | PASS | `09-migrate-local-1794822762199.log` |
| 10 | `npx --no-install supabase db lint --local` | 09:52:42.200 | 0 | PASS | `10-schema-lint-1794822764573.log` |
| 11 | `npm run lint` | 09:52:44.574 | 0 | PASS | `11-lint-1794822783594.log` |
| 12 | `npm run verify:attendance-review` | 09:53:09.065 | 1 | FAIL | `12-verify-attendance-review-1794822820878.log` |
| 13 | `npm run verify:attendance-integrity` | 09:53:40.902 | 0 | PASS | `13-verify-attendance-integrity-1794822834448.log` |
| 14 | `npm run verify:attendance-review` | 09:55:36.627 | 1 | FAIL | `14-verify-attendance-review-1794822949627.log` |
| 15 | `npm run verify:attendance-review` | 09:59:48.090 | 1 | FAIL | `15-verify-attendance-review-1794823228225.log` |
| 16 | `npm run verify:attendance-review` | 10:06:16.574 | 0 | PASS | `16-verify-attendance-review-1794823603841.log` |
| 17 | `npm run typecheck` | 10:06:44.295 | 0 | PASS | `17-typecheck-1794823612317.log` |
| 18 | `npm run lint` | 10:06:52.318 | 0 | PASS | `18-lint-1794823628886.log` |
| 19 | `npx --no-install supabase migration up --local` | 10:12:54.751 | 0 | PASS | `19-migrate-local-1794823978130.log` |
| 20 | `npx --no-install supabase db lint --local` | 10:12:58.239 | 0 | PASS | `20-schema-lint-1794823980818.log` |
| 21 | `npm run typecheck` | 10:13:00.819 | 0 | PASS | `21-typecheck-1794823986259.log` |
| 22 | `npm run lint` | 10:13:06.430 | 0 | PASS | `22-lint-1794824002605.log` |
| 23 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 10:13:22.611 | 0 | PASS | `23-units-1794824039384.log` |
| 24 | `npm run verify:school-operations` | 10:13:59.385 | 0 | PASS | `24-verify-school-operations-1794824085125.log` |
| 25 | `npm run verify:attendance-review` | 10:20:24.860 | 0 | PASS | `25-verify-attendance-review-1794824449514.log` |
| 26 | `npm run verify:attendance-integrity` | 10:20:49.612 | 0 | PASS | `26-verify-attendance-integrity-1794824461253.log` |
| 27 | `npm run verify:attendance` | 10:21:01.254 | 0 | PASS | `27-verify-attendance-1794824464122.log` |
| 28 | `npm run verify:reconnect` | 10:21:05.119 | 1 | FAIL | `28-verify-reconnect-1794824480648.log` |
| 29 | `npm run verify:final-journeys` | 10:21:20.650 | 0 | PASS | `29-verify-final-journeys-1794824519857.log` |
| 30 | `npm run test:rfid:integration` | 10:21:59.859 | 0 | PASS | `30-test-rfid-integration-1794824524166.log` |
| 31 | `npm run test:gateway:local-integration` | 10:22:04.168 | 0 | PASS | `31-test-gateway-local-integration-1794824544204.log` |
| 32 | `npm run verify:principal-communication` | 10:22:24.307 | 0 | PASS | `32-verify-principal-communication-1794824571164.log` |
| 33 | `npm run verify:staff-localization` | 10:22:51.176 | 0 | PASS | `33-verify-staff-localization-1794824589035.log` |
| 34 | `npm run verify:role-visuals` | 10:23:09.037 | 0 | PASS | `34-verify-role-visuals-1794824607723.log` |
| 35 | `npm run verify:accessibility-i18n` | 10:23:27.726 | 0 | PASS | `35-verify-accessibility-i18n-1794824615058.log` |
| 36 | `npm run attendance:demo -- prepare` | 10:23:35.060 | 0 | PASS | `36-demo-m2-prepare-1794824617335.log` |
| 37 | `node --env-file=.env.test.local .local/m2/demo-check.mjs` | 10:23:37.336 | 0 | PASS | `37-m2-demo-check-1794824617661.log` |
| 38 | `npm run attendance:demo -- scan` | 10:23:37.662 | 0 | PASS | `38-demo-m2-scan-1794824618368.log` |
| 39 | `node --env-file=.env.test.local .local/m2/demo-check.mjs` | 10:23:38.369 | 0 | PASS | `39-m2-demo-check-1794824618636.log` |
| 40 | `npm run attendance:demo -- scan` | 10:23:38.637 | 0 | PASS | `40-demo-m2-scan-1794824619356.log` |
| 41 | `node --env-file=.env.test.local .local/m2/demo-check.mjs` | 10:23:39.358 | 0 | PASS | `41-m2-demo-check-1794824619676.log` |
| 42 | `npm run attendance:demo -- separate` | 10:23:39.677 | 0 | PASS | `42-demo-m2-separate-1794824620465.log` |
| 43 | `node --env-file=.env.test.local .local/m2/demo-check.mjs` | 10:23:40.482 | 0 | PASS | `43-m2-demo-check-1794824620795.log` |
| 44 | `npm run attendance:demo -- delayed` | 10:23:40.796 | 0 | PASS | `44-demo-m2-delayed-1794824621504.log` |
| 45 | `node --env-file=.env.test.local .local/m2/demo-check.mjs` | 10:23:41.505 | 0 | PASS | `45-m2-demo-check-1794824621816.log` |
| 46 | `npm run attendance:demo -- clean` | 10:23:41.821 | 0 | PASS | `46-demo-m2-clean-1794824622691.log` |
| 47 | `node --env-file=.env.test.local .local/m2/demo-clean-check.mjs` | 10:23:42.692 | 0 | PASS | `47-m2-demo-clean-check-1794824622999.log` |
| 48 | `node --env-file=.env.test.local .local/m2/preserve.mjs` | 10:23:43.000 | 0 | PASS | `48-m2-preserve-1794824623371.log` |
| 49 | `npm run typecheck` | 10:25:11.054 | 0 | PASS | `49-typecheck-1794824718686.log` |
| 50 | `npm run lint` | 10:25:18.688 | 0 | PASS | `50-lint-1794824734907.log` |
| 51 | `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | 10:25:34.909 | 0 | PASS | `51-units-1794824772196.log` |
| 52 | `npm run verify:attendance-review` | 10:28:26.781 | 1 | FAIL | `52-verify-attendance-review-1794824941815.log` |
| 53 | `npm run verify:reconnect` | 10:29:02.241 | 0 | PASS | `53-verify-reconnect-1794824969788.log` |
| 54 | `npm run verify:attendance-integrity` | 10:29:29.795 | 0 | PASS | `54-verify-attendance-integrity-1794824981020.log` |
| 55 | `node --env-file=.env.test.local .local/m2/preserve.mjs` | 10:29:41.022 | 0 | PASS | `55-m2-preserve-1794824981422.log` |
| 56 | `npm run verify:attendance-review` | 10:34:53.309 | 0 | PASS | `56-verify-attendance-review-1794825315401.log` |
| 57 | `node --env-file=.env.test.local .local/m2/integrity.mjs` | 10:35:41.013 | 0 | PASS | `57-m2-integrity-1794825345333.log` |
| 58 | `npx --no-install supabase db lint --local` | 10:35:45.341 | 0 | PASS | `58-schema-lint-1794825348795.log` |
| 59 | `node --env-file=.env.test.local .local/m2/preserve.mjs` | 10:35:48.817 | 0 | PASS | `59-m2-preserve-1794825349284.log` |
| 60 | `npm run build:isolated -- --working-tree` | 10:36:04.262 | 0 | PASS | `60-build-isolated-1794825424696.log` |
| 61 | `node --env-file=.env.test.local .local/m2/preserve.mjs` | 10:37:04.755 | 0 | PASS | `61-m2-preserve-1794825425461.log` |

## Deterministic fictional rehearsal

Use only approved QA with Docker/local Supabase running. Start `npm run dev:rfid-local -- --port 3104` there. Stop that owned server before automated `verify:school-operations`, which owns its development-server lock. Do not seed/reset a normal school or copy developer environment files.

In another QA PowerShell terminal:

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run attendance:demo -- prepare
npm run demo:credentials
npm run attendance:demo -- scan
```

Read generated fictional credentials privately. Preparation refuses to overwrite an unfamiliar existing rehearsal journal. Use separate role sessions at `http://127.0.0.1:3104`. Teacher → Attendance → Grade 8A → today's date: show the simulated gate event separately and its “classroom attendance is not confirmed” flag. Explicitly review/finalize the register. Parent → Attendance then shows saved classroom confirmation. “Synthetic Manual Fallback” has no scan and can still be marked Present manually; staff can document the forgotten-card check without publishing a private reason to Parent.

Running `scan` again replays the same immutable event. `separate` creates one distinct event; `delayed` demonstrates uncertain/delayed evidence. The executed rehearsal measured gate counts **0 → 1 → 1 → 2 → 3**, with **zero classroom records throughout the scan-only CLI sequence**. Explicit Teacher finalization is separately verified in the browser acceptance. Clean only this marked, owned rehearsal:

```powershell
npm run attendance:demo -- clean
```

Do not delete unfamiliar journals or force-clean another fixture. No physical card/reader is used by these commands. Backup captures from the successful acceptance show pending/draft/review/Parent/Principal states; they are synthetic evidence, not hardware proof.

Arohi's approximately 30–45 second explanation:

> This is a simulated card scan. It records a gate event, not proof that a child is safe or in class. Schovera shows the teacher what needs checking. The teacher then confirms classroom attendance, and only that saved mark is shown to the parent. This second child has no card scan, so attendance can still be marked manually. Replaying one event does not add another scan. Delayed or conflicting evidence stays visible for review. We have tested the software locally; physical reader and Raspberry Pi testing comes later.

## Handoff and publication

M2 is ready for review within this local synthetic boundary. Remaining limitations include native Back/Forward guards, conservative review invalidation, full held-work resolution, Excused rollout, scale benchmarking, fluent wording review, production retention/key custody/backup, hosted architecture and hardware/network acceptance. Suggested M3 planning topics are reviewed held-work resolution and the coordinated status/reporting contract; none is implemented here.

No public deployment, Raspberry Pi/physical RFID, real SMS/calls, paid provider, real recipient or production student dataset was tested. Existing speech/translation functionality was not changed or newly certified by M2. Local compilation/tests do not establish production readiness.

The containing milestone commit is the publication identity for this report; its exact SHA and verified GitHub URL are provided in the completion response and private publication receipt. Only M2 files are staged. The unrelated documentation edit and untracked developer artifacts remain outside the commit. No force-push, reset, stash, main overwrite, fake/empty commit or backdated authorship is used.
