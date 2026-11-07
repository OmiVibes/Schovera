# Simpler blue portals — 6 November 2026

## Agreed scope

Three portals remain: Parent, Teacher and Principal. Use `#005A9C` for primary actions, `#60C1E5` for accents and `#A0E0EF` for soft highlights, with white surfaces and dark readable text. The two supplied palettes contained the same three shades.

The requested clarification was confirmed: **class-wise summaries, not teacher rankings**, and **keep PostgreSQL, organize existing history by academic year**. No database engine switch, table migration, ranking or production deployment is included.

## Changes

- Consistent blue headers and sign-in styling across the portals. Rounded cards, circular avatars/icons and pill-shaped buttons; controls retain text labels and keyboard focus.
- More room between actions and larger mobile tap targets. Repeated decorative uppercase captions are hidden; meaningful headings, data, consent and safety warnings remain.
- Shorter home instructions and Parent voice-language help, without guessing Hindi/Marathi from script or implying automatic free-text translation.
- The Parent child card no longer stretches into a large empty panel. The Teacher's home notice preview is expandable so daily tasks appear sooner on mobile; the full notices page remains available.
- A three-dot mobile **Profile** disclosure shows the account name, role and school. Sign-out remains directly available. Portal navigation remains visible and horizontally scrollable rather than hiding essential destinations.
- **Recently added** sorts Teacher and Principal student directories by the persisted student `created_at` value. It does not create or modify students. Toggle off to restore normal ordering. Principal **View all** expands the loaded directory; search remains available.
- Right-aligned **View all** links for the Parent update preview and Principal communication preview; student details remain accessible.
- **View history** on student profiles opens attendance history only when requested. Closing it unmounts the graph and stops its reads.
- Profile review found and fixed missing roll numbers and missing awaiting-confirmation counts in Parent summaries. Translation placeholders now receive values directly instead of replacing them after interpolation had removed them.

## Attendance graphs and history

Parent attendance reads the selected linked child's records. Teacher attendance reads the selected assigned class. Principal attendance reads same-school records and offers a class selector. Profile history reads only the selected authorized student. All queries use the ordinary authenticated Supabase client and existing RLS; no service-role reader or privileged aggregation endpoint is added.

Controls: **7 days**, **1 month**, **6 months**, **All saved records**, **Academic year**, **Refresh**, and expandable record totals. Six-month and all-history charts group by calendar month; shorter charts group by recorded date. The equivalent table and chart label provide readable values without requiring color perception.

Academic-year choices come from the existing authorized `classes.academic_year` metadata. Filtering uses associated class IDs; it does not infer a school's year boundaries or rewrite old records. Historical class metadata may not be visible to a role under existing RLS. “All saved records” removes the recent-date lower bound, not authorization. It still excludes future dates and respects school/student/class scope. No retention deletion or synthetic archive is added.

Counts are classroom attendance **entries**, not RFID arrivals, unique students, safety confirmation or teacher performance. Missing dates are not inserted as absences. Query pages are bounded to 500 rows and 5,000 retained entries per view; the limit is explicitly shown if reached. Choose a narrower class, year or period for larger datasets. The directory's “View all” means the currently loaded authorized directory, subject to the existing database/API row limit, not an unlimited export.

Graphs read on opening, context/filter change and manual refresh. Teacher attendance saves remount its graph with saved state. There is no new polling or Realtime publication; Parent/Principal users can use Refresh to retrieve newly saved entries. Queries are cancelled logically on context changes so late results are not displayed for a different child/class. These paginated reads are not an atomic database snapshot during concurrent writes.

## Local verification

Use only the isolated local test environment described in [safe development](25_SAFE_SUPABASE_DEVELOPMENT.md). Never load production `.env.local` into a verification checkout.

```powershell
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3104'
npm run test:attendance-trend
npm run verify:simple-blue-ui
npm run verify:website
```

`verify:website` now runs 48 commands and records their individual results in ignored `.local/website-qa/<run>/` folders. The focused UI test covers all graph ranges, academic-year filtering, refresh, all three role scopes, mobile profile disclosure, profile history, Recent controls, the Principal directory expansion and overflow checks. It writes private local screenshots to `.local/blue-ui/`.

Initial browser attempts: one was blocked by stopped Docker/local Supabase, not counted as an application pass. After starting the installed local services, Parent controls passed; the initial Teacher test used a full page reload that lost its unsaved student selection. The test now navigates through the actual profile link, and all three focused role checks passed. The three pure graph tests passed. Typecheck and lint passed before the full regression run. Final full-run evidence is recorded below after execution.

### Regression evidence

- Broad run `8d821f53-ac98-472e-80ed-57abe4f64cbd` recorded 44/48 results before interruption: 43 passed and one language/reconnect check failed. Checks 45–48 were not completed in that run and are not reported as passes there.
- The language check selected a hidden `Parent` label inside the new Profile disclosure rather than the visible role badge. Its selector now targets `.role-chip`; its Realtime, acknowledgement, metric and persistence assertions remain.
- Resumed run `8324fbee-a675-41c7-9bcc-819e3daca90d` passed **8/8**: language/reconnect, provisioner browser workflow, new blue UI controls, role navigation, accessibility/i18n, role visuals, typecheck and lint. Together these runs cover all 48 named commands with passing executions, not one uninterrupted 48/48 gate.
- The completed browser workflow covers attendance changes, homework create/edit, approved translation/original text, confirmation, timetable editing, notice publishing, session rotation and offline logout. The visual audit covers 23 destinations at four widths; the provisioner workflow captured 92 screenshots. Parent desktop/home, Teacher mobile/home, Parent mobile/profile and Teacher desktop/profile captures were inspected. New focused screenshots also show the history graphs.
- The new Recent test compares the first visible student with the newest persisted `created_at` record, not merely the button's pressed state.
- The interrupted provisioner fixture was recovered using its exact owned journal/run ID after confirming its process was gone. Its adapter removed only that local test fixture; the recovery journal was retained privately. No broad database reset was used.
- The existing school still matched all 20 baseline dataset hashes. Fixed sign-ins for all three existing accounts passed in the normal website without editing school records or passwords.

After the final profile-number fix, run `daef832d-e2db-49cd-9ce8-59386b436fa0` passed **3/3**: blue UI controls (including roll-number and awaiting-count assertions), typecheck and lint. A subsequent focused blue-UI run also passed profile/account overflow checks at **320, 360 and 390 px** for all three roles. All 20 existing-school dataset hashes remained unchanged afterward. `git diff --check` passed.

Use `npm run verify:website -- --only 'verify:simple-blue-ui,typecheck,lint'` to run a bounded named subset. Unknown or duplicate check names are refused; subset runs do not mark earlier failed or interrupted manifests green. The normal website runs at `http://127.0.0.1:3103` with the existing fixed accounts. The QA server is separate and stopped after testing. Changes remain uncommitted; no push, deployment, production schema/configuration change or password rotation was performed.

## Limits

Real speech audio, physical hardware, live SMS/IVR and hosted deployment remain separate acceptance work. This UI change does not turn simulations into delivered services, change account passwords, resolve all historical Realtime timing flakes, or certify an international competition outcome. No live AI generation is requested by this UI regression batch; its browser/editor and access checks run, while the earlier live-model results remain historical evidence.

Final health check: the normal website on port 3103 returned HTTP 200; the QA server on 3104 was stopped. The local Ollama endpoint on 11434 was not responding, so live AI drafting still requires starting the installed Ollama application/service. An attempted background startup was refused by the execution environment; no model download or cloud-provider fallback was performed. This does not affect the new portal layout/history controls, but live drafting is not reported as currently working.

**Later follow-up:** Ollama was activated and real Teacher drafting subsequently passed. See [the live AI and simpler voice check](50_SIMPLE_VOICE_AND_AI_CHECK.md) for current evidence and the remaining manual audio check.
