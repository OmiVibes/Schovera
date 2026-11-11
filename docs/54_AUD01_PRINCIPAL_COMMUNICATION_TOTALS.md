# AUD-01 — Principal communication totals

Completed locally on 9 November 2026. Scope: AUD-01 only. Changes are **uncommitted and unstaged**, as requested; nothing was pushed or deployed.

Starting HEAD: `aac3a7c77d11518dc0654e3f89381f472943b064`, branch `feat/simpler-demo-and-workspaces`. The earlier audit baseline was `5d7055f8e0b2a1465172b4811354f0b706aa905f`; it was not used to reset the checkout. Existing unrelated files were preserved.

## A. Root cause

Principal Home and Communication fetched `student_updates` through PostgREST without pagination, then derived every communication metric from that response. With `max_rows=1000`, the response silently stopped at 1,000 even when PostgreSQL held more records.

Affected calculations were Important sent, Acknowledged, Awaiting, the Awaiting filter count, and acknowledgement coverage. They excluded superseded originals using correction IDs present in the same limited response, so a correction outside that response could also make an old update count incorrectly. The existing interface does not display a separate total-communications statistic; the replacement contract nevertheless returns both raw and correction-effective totals, which are independently tested.

School-wide statistics must not be calculated from a visible feed page. Increasing the API row limit would only move the failure threshold; that setting remains **unchanged at 1,000**.

## B. Files changed

| File | Purpose |
|---|---|
| `supabase/migrations/20261109100000_principal_communication_summary.sql` | Add a Principal-only, tenant-scoped read RPC returning exact aggregates and a bounded keyset page. No table/RLS/data changes. |
| `src/lib/principal-communication.ts` | Validate the response, school identity, count consistency and page bounds; reject missing/invalid statistics. |
| `src/lib/use-principal-communication.ts` | Load/refetch/page the authoritative result; discard obsolete responses after context changes or unmount; recover safely from errors. |
| `src/components/schovera-app.tsx` | Use database metrics instead of feed-length calculations; retain correction metadata across page boundaries; add scoped Refresh/Load more; coalesce Realtime-triggered reads through the existing resync hook. |
| `src/lib/ui-copy-extra.mjs` | English/Hindi/Marathi interface entries for the new Refresh and Load more controls. |
| `src/lib/principal-communication.test.ts` | Ten response-contract tests, including size boundaries and invalid/foreign/inconsistent results. |
| `src/lib/use-principal-communication.test.tsx` | Hook regression for loading, unavailable versus authoritative zero, recovery and late old-context responses. |
| `scripts/verify-principal-communication.mjs` | Local synthetic database/browser acceptance with independent SQL and seeded-data oracles, boundary sizes, security checks and verified cleanup. |
| `package.json` | Expose `npm run verify:principal-communication`; no dependency changes. |
| `docs/54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md` | This implementation, verification and handoff record. |

No existing test expectation was weakened. Parent/Teacher communication implementations, translations, Ollama, dependencies, API row limits and existing database policies were not changed. The shared update type now permits the Principal's minimized acknowledgement/nullable relationship shape; Parent/Teacher continue using their existing queries.

## C. Fix implemented

`principal_communication_page(filter, before_sent_at, before_id, limit)` runs one aggregate/page SQL statement after authorizing the caller. It returns one JSON result, so PostgREST's row limit cannot truncate the records **inside** its aggregate.

The result contains:

- `total_count`: all original and correction rows in this school.
- `effective_count`: rows that have not been superseded by another same-school correction.
- `important_count`: effective Important updates.
- `acknowledged_count`: effective Important updates with **at least one** persisted acknowledgement. Two guardians acknowledging one update count as one update.
- `awaiting_count`: effective Important updates without an acknowledgement.
- `coverage`: rounded acknowledged/important percentage, or `null` when there are no Important updates.
- A bounded feed and `has_more`. All includes immutable correction history; Awaiting includes only effective, unacknowledged Important updates.

The existing status/archival semantics are retained; no new status exclusion was introduced. School notices in `announcements` are not silently added to these student-update statistics. Translation draft/review/approval state does not change communication counts.

Home requests six recent cards. Communication requests 40, with a server-enforced maximum of 100 per request. A `(sent_at, id)` descending cursor preserves ties and timestamp precision. Correction flags and original titles are resolved in PostgreSQL, including when the relevant original/correction is outside the visible page. The test traverses the entire stable 2,007-row dataset without duplicate or missing IDs.

Statistics and the returned page share one SQL statement's MVCC snapshot. The browser applies that response as one state value. Initial reads show placeholders until authoritative results arrive; a failed read shows an error and unavailable metrics, rather than an invented zero or totals from cached cards. Previously loaded cards may remain with an explicit stale-data message. Background reads preserve the visible feed. Context/request generations prevent a late response replacing the current filter/school.

Realtime remains a refetch trigger. Existing resync coalescing prevents one full-school aggregation per event in a burst. Manual refresh, focus/reconnect recovery and bounded Load more use the same authorized persisted source. No Realtime publication was changed.

### Local migration and performance decision

The additive migration was explained before use and applied **only to isolated local Supabase**. During implementation an RLS-invoker version proved correct but performed repeated per-row policy work. The final definition uses a narrowly authorized `SECURITY DEFINER` read, with explicit tenant checks described below. Its final SQL was reapplied locally after that revision; migration history contains 35 local versions. The final migration is `CREATE OR REPLACE`, and the same final definition passed database-backed acceptance and schema lint.

No destructive migration, reset, record backfill, new table, index, policy change or row-limit increase was performed. Existing school/time, correction and acknowledgement indexes are reused. Exact aggregation still scales with school history; it is not a constant-time cached count. Only compact aggregate inputs are materialized, and message bodies/relationships are loaded for the requested page.

The final focused run measured API round trips of **13–31ms** across the tested cases on this laptop, excluding the independent SQL oracle. These are local observations, not a hosted SLA or a large-school concurrency benchmark. Earlier iteration timing fields included the SQL-oracle subprocess; they must not be read as final RPC timings.

## D. Test results and evidence

Final source build fingerprint: `1bb3208c6c8857ba48cbcc866dfd908ee3572ffb608d87185d016b7f59f7c1db` — 174 approved files, uncommitted working tree. The migration is separately recorded by hash in the evidence manifest because SQL migrations are not Next build inputs.

QA checkout: `%TEMP%\schovera-qa-41c404875fbe43209c457a7763419c3e`, local web `http://127.0.0.1:3104`, local Supabase `http://127.0.0.1:54321`. Both API and database Docker ports were verified bound to `127.0.0.1`. Node 22.18.0 was used; the standalone verifier uses Node's TypeScript stripping.

Evidence directory **E**: `.local/schovera-manual-demo/aud01-20261109/`. It is ignored by Git. `results.json` retains start/end timestamps, exact commands, exits and logs, including failed attempts; `summary.json` and `manifest.json` provide final results and hashes. Final synthetic size/oracle results and screenshots are copied into E. No credentials belong in the report or evidence.

| Check | Final result | Evidence / scope |
|---|---|---|
| `npm run verify:principal-communication` | **PASS**, two complete passing runs after iteration | `08-verify-principal-communication.log`, `09-verify-principal-communication.log`; final run includes precise timing and an original deliberately outside the visible page. |
| `node node_modules/vitest/vitest.mjs run --exclude **/*.integration.test.ts --maxWorkers=2 --no-file-parallelism` | **306/306 PASS**, 35 files | `10-units.log`; 11 new tests included, not extra independent totals. Existing DB integration files are deliberately run through their guarded commands instead. |
| `npm run typecheck` | **PASS**, exit 0 | `11-typecheck.log`. |
| `npm run lint` | **PASS**, exit 0 | `12-lint.log`, no final warnings. |
| `npm run verify:reconnect` | **PASS**, exit 0 | `13-verify-reconnect.log`: Principal metrics/profile recovery and Parent/Teacher context, acknowledgement, attendance, homework and timetable recovery. |
| `npm run verify:final-journeys` | **PASS**, exit 0 | `14-verify-final-journeys.log`: actual Teacher send, Principal review/approval, Parent playback/acknowledgement and local fixture cleanup. |
| `npm run test:translations:db` | **PASS**, exit 0 | `15-test-translations-db.log`: original preservation, correction invalidation, stale approval and role/school denial. |
| `npm run verify:phase1` | **PASS**, exit 0 | `16-verify-phase1.log`: persisted communication, acknowledgement, Realtime, roles and tenant isolation. |
| `npm run verify:role-navigation` | **PASS**, exit 0 | `17-verify-role-navigation.log`. |
| `npm run verify:role-visuals` | **PASS**, 23 destinations × 4 widths | `18-verify-role-visuals.log`: 1440, 1024, 768 and 390px; no reported page overflow. |
| `npm run verify:staff-localization` | **PASS**, 96 combinations | `19-verify-staff-localization.log`: en/hi/mr role/page/width checks. |
| `npm run build:isolated -- --working-tree` | **PASS**, exit 0 | `20-build-isolated.log`: real optimized build, TypeScript, expected app/API routes, private sentinels absent, unchanged inputs and owned temporary snapshot cleanup. |
| `npx --no-install supabase db lint --local` | **PASS**, no schema errors | `db-lint.log`; existing local schema only. |
| Protected-school preservation | **PASS**, 20 dataset hashes unchanged | Guarded phase-specific before/after comparison; no reset/seed/real-account mutation. |

The focused database regression checks every required size in both Home and Communication: **0, 1, 999, 1000, 1001, 1002, 2005**. It compares the RPC to an in-memory oracle based on the complete generated dataset and an independent PostgreSQL query through `docker exec ... psql`, which bypasses PostgREST's response cap. Then browser assertions verify all rendered Important/Acknowledged/Awaiting/coverage values.

Additional cases: mixed Normal/Important; acknowledgements on Normal updates; two guardians acknowledging one update; acknowledged superseded original; a two-step correction chain; draft/submitted/approved translation invariance; separate schools; malformed limits/filter/cursor; unauthorized callers; school-argument injection; complete tie-safe keyset traversal; Load more; Awaiting filter; explicit refresh; missed updates during browser offline state; reconnect; failed initial/refetch reads and recovery; 390px overflow.

### Earlier failed attempts are retained

1. `02-lint.log`: new hook initially updated a ref during render and synchronously started stateful work in an effect. Implementation changed to an effect-managed context and deferred request, with explicit cleanup. Final lint and hook tests pass.
2. `03-units.log`: 305/306 passed; the new Refresh string lacked a dictionary entry. The missing translations were added; the copy-policy assertion was retained.
3. `06-verify-principal-communication.log`: the first RLS-invoker run reached size 999, then failed. Its cleanup attempted too many UUIDs in one request and masked the original browser failure. **The exact original browser cause is not established by that log.** Only its two exact, uniquely tagged synthetic schools and six generated accounts were recovered and removed; protected-school hashes were unchanged. Cleanup now uses 100-row batches and journals generated IDs without passwords.
4. `07-verify-principal-communication.log`: all aggregate/oracle checks through 2,007 rows and translation/tenant checks passed, but a feed assertion read zero cards during a refresh skeleton. Its normal cleanup succeeded. The test now waits for settled metric/feed state without changing expected counts, and the UI retains already loaded cards during background refresh.

The final read design also removes the RLS-invoker performance bottleneck. The final focused acceptance passed twice; final unit/static/browser/build checks are green. Failed logs were not overwritten.

## E. Security verification

The RPC accepts **no school ID**. It derives the actor from `current_profile()`, requires active Principal role, and checks `current_user_role()` so the existing session restrictions apply. It uses a fixed empty search path and no dynamic SQL. PUBLIC/anonymous execution is revoked; authenticated execution still performs these checks before any aggregate.

`SECURITY DEFINER` deliberately avoids repeating table RLS evaluation for each aggregate row. Therefore authorization inside this RPC depends on its explicit checks, not on an assertion that invoker RLS executes there. All updates/corrections are scoped to the actor's school; student and class relationships are also explicitly school-scoped. Acknowledgement queries reference only those owned updates and return minimal existence/time evidence, not guardian IDs. Existing direct-table RLS policies and grants remain untouched for every browser role.

Actual API tests denied anonymous, Parent, Teacher and inactive Principal callers and rejected a forged school argument. Principal B received its own one update, while Principal A retained its independent larger totals. Parent/Teacher direct reads of B's update were empty. Parent approval attempts remained denied. Aggregate results did not change when a same-school translation moved through draft, review and approval.

No service key was added to the browser. Local privileged credentials are used only by the guarded synthetic test fixture setup/cleanup. No production environment file was opened, copied or modified; no hosted Supabase or Vercel operation occurred.

## F. Before and after

| Dataset | Expected important | Old capped result | New displayed/API result |
|---|---:|---:|---:|
| 0 updates | 0 | Not re-executed | 0; coverage absent rather than divided by zero |
| 1 Important | 1 | Not re-executed | 1 |
| 999 Important | 999 | Not re-executed | 999 |
| 1,000 Important | 1,000 | Not re-executed | 1,000 |
| 1,001 Important | 1,001 | Not re-executed | 1,001 |
| 1,002 Important | **1,002** | **1,000** | **1,002** |
| 2,005 mixed updates | 1,670 | Not used as oracle | 1,670; raw total 2,005 |
| Mixed acknowledgements + correction chain: raw 2,007 / effective 2,005 | 1,670 | Not used as oracle | **1,670 important / 834 acknowledged / 836 awaiting / 50%** |

The old SELECT was deliberately re-executed at 1,002 and still returned exactly 1,000 IDs; both new pages displayed 1,002. Thus the fix does not depend on raising the API row limit. The audit's original wrong display remains historical evidence; this report records the corrected local implementation.

## G. Remaining limitations and local reproduction

- No hosted deployment, public acceptance or production migration was performed. This fix does not resolve the dependency/security findings or other audit tasks.
- No aggressive load/concurrency benchmark, million-row history test or fresh full database reset/replay was run. Existing data were preserved. Exact counts necessarily read the school's aggregate input; evaluate workload at deployment scale before choosing any separately reviewed caching/read model.
- Each page request is consistent with its own database snapshot. A multi-page browsing session is not a frozen cross-request transaction; a new update or acknowledgement can change the next summary. Refetch/reconnect intentionally returns current persisted truth and resets the feed.
- The historical audit and screenshot metadata were not rewritten. This completion report supersedes AUD-01's implementation status only.

For local reproduction, use the existing isolated QA checkout and approved loopback env files. Never copy the developer `.env.local` there. Confirm Docker/API/database loopback bindings, then apply the additive migration **locally** before starting the reviewed local launcher. The verification command fails closed outside explicit local test mode and needs Docker CLI access for its independent SQL oracle.

```powershell
# In the isolated QA checkout, with its existing local-only env files:
npx --no-install supabase migration up --local
# Start the guarded local server in one terminal; wait for HTTP 200:
npm run dev:accounts-local -- --port 3104

# In another terminal in that same QA checkout:
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run verify:principal-communication
npm run typecheck
npm run lint

# Safe build from the developer repository:
npm run build:isolated -- --working-tree
```

The focused regression requires only the account/local app server; the broader existing connected-journey test additionally requires the existing guarded simulator server/issuer configuration. Do not start duplicate Next servers on one port. No paid service or Ollama change is needed for this fix. If later rollback is required, review the application/function pair together; do not reset the database or delete school records.

## H. Git status

HEAD remains `aac3a7c77d11518dc0654e3f89381f472943b064`; branch remains `feat/simpler-demo-and-workspaces`. The ten files in section B are the intended uncommitted change set. Nothing was staged, committed, pushed or deployed by this task.

Pre-existing untracked `CLAUDE.md`, `local-dev.err`, `local-dev.out`, and `review/` remain preserved. Environment files, fixture journals, private test credentials, screenshots and logs stay ignored. `package-lock.json` and `supabase/config.toml` are unchanged. Final Git status and evidence hashes are recorded in E.

```text
 M package.json
 M src/components/schovera-app.tsx
 M src/lib/ui-copy-extra.mjs
?? CLAUDE.md
?? docs/54_AUD01_PRINCIPAL_COMMUNICATION_TOTALS.md
?? local-dev.err
?? local-dev.out
?? review/
?? scripts/verify-principal-communication.mjs
?? src/lib/principal-communication.test.ts
?? src/lib/principal-communication.ts
?? src/lib/use-principal-communication.test.tsx
?? src/lib/use-principal-communication.ts
?? supabase/migrations/20261109100000_principal_communication_summary.sql
```
