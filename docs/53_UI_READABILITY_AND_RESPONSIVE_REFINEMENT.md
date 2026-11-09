# UI readability and responsive refinement

Verified locally on 9 November 2026. This refines the existing Parent, Teacher and Principal portals; it is not a rewrite, deployment or production certificate.

## Findings and design system

The baseline screenshots showed supporting text around 10–11px, weak heading/metadata hierarchy, important Parent messages below secondary summaries, dense single-column Principal communication, and mobile tabs whose off-screen destinations were difficult to discover. Testing a loaded workbook also exposed overflow that its empty state did not show.

The new shared `refinement.css` retains Geist, Noto Sans Devanagari and the existing plum/rose palette. It introduces typography/spacing tokens and scoped portal styles. No new UI library is installed.

| Element | Implemented size |
|---|---|
| Page headings | 28–34px desktop, 26px small screens |
| Section headings | approximately 21–24px |
| Card headings | 18px; Principal student name 19px |
| Body / Parent messages | 16px; 17px desktop Parent messages |
| Inputs / selectors | 16px |
| Buttons / navigation | 15px; ordinary controls at least 44px high |
| Supporting labels | 14px |
| Secondary metadata | 13px; chart axes 12px |
| Statistics | 28–32px |

Paragraph line height is generally 1.55–1.65. Devanagari headings retain extra line height and no negative letter spacing. Calendar cells retain 44px height but are narrower on small phones. Wide tables and spreadsheets scroll inside their own region.

## Wording and shared navigation

- The exact legacy fixture name **Schovera Model School — Demo Campus** is displayed as **Schovera Model School** in profile-derived headers, profiles and notice context. The stored school record is unchanged; arbitrary institutions with “Demo” in their real name are not renamed.
- Numeric academic-year fixture suffixes are omitted only from display. Raw option values, academic-year filters and dates remain unchanged. Year/class selectors now have explicit accessible labels.
- Hosted AI availability messages use neutral wording. Internal environment flag names and all security gates remain. Where sample-data mode is enabled, its banner still honestly identifies sample records and simulated SMS/calls.
- Existing authored messages are preserved verbatim, including historical sample wording. No school record, original message, password, relationship or attendance history was rewritten to change branding.
- Mobile tabs are retained, with an accessible **More pages** disclosure listing every authorized destination. Selection closes it; Escape closes it and returns focus. English/Hindi/Marathi labels are available.
- Active-tab reveal scrolls only the navigation container horizontally, preventing resize/navigation from moving the whole document vertically.

## Portal changes

**Parent:** Important messages follow the child banner before secondary statistics. Notice text, language controls, Listen/Stop, acknowledgement and status metadata are more readable and consistently spaced. Original/approved/explicitly automatic translation behaviour, source identity and voice logic are unchanged.

**Teacher:** Task shortcuts have clearer titles/descriptions and consistent padding. Student names stand above roll metadata; attendance controls keep their existing semantics. Forms use 16px input text. AI modes, editable drafts and the configured local Ollama provider are retained. The workbook is constrained to its column; its positioned scroll container also contains screen-reader labels, preventing them from widening the page. Empty-class guidance is retained when no class buttons exist.

**Principal:** Communication uses two columns on wide screens and one on smaller screens, with clearer student names, titles, readable statuses and footers. Messages are not truncated or removed. Mobile metrics use stacked compact rows with larger numbers. Awaiting filters, translation review and same-school account administration remain.

## Files changed

| File | Purpose |
|---|---|
| `src/app/refinement.css` | Shared typography, spacing, responsive portal layouts and status styling |
| `src/app/layout.tsx` | Style import and neutral sample-data wording |
| `src/components/schovera-app.tsx` | Branding, More pages, horizontal-only tab reveal and feed wrapper |
| `src/components/attendance-trends.tsx` | Display-only year formatting and accessible filter labels |
| `src/lib/school-brand.ts`, `school-brand.test.ts` | Exact school/year display rules and preservation checks |
| `src/components/teacher-ai-workspace.tsx`, `src/app/api/teacher-ai/route.ts` | Availability copy only |
| `src/lib/ui-copy-extra.mjs` | New Hindi/Marathi interface strings |
| `scripts/capture-ui-review.mjs` | More-menu captures; overflow/mutation failures now invalidate a pack |
| `scripts/verify-final-journeys.mjs` | Current Principal-review and real-media workflow; visible empty-state assertions |
| This report and `docs/52_PLUM_ROSE_VISUAL_IDENTITY.md` | Evidence and handoff |

No database migration, schema, dependency, provider configuration, production environment or deployment changed.

## Tests and evidence

Mutating integration tests used only controlled synthetic records in the isolated local QA checkout, with cleanup. The normal school was inspected read-only on `127.0.0.1:3103`. The separately started QA server on `3104` provided the existing synthetic RFID issuer for the connected scenario.

| Check | Final result |
|---|---|
| TypeScript and ESLint | Passed |
| Branding / UI-copy / attendance calculation tests | 11 passed |
| Parent voice/controller/component tests | 33 passed |
| Translation component tests | 3 passed |
| Account-management unit validation | 13 passed |
| Role navigation | Passed |
| Accessibility/i18n | Passed |
| Simple voice browser checks | Passed, including media/control geometry |
| Account lifecycle/permission browser checks | Passed |
| Staff localization | 96 combinations passed |
| Role visuals | 23 destinations × 1440/1024/768/390px passed |
| Simple UI/history browser suite | Passed |
| Additional 320px check | All 23 routes; keyboard/translated mobile menus and raw year filter values passed |
| Loaded workbook | 320/390/768/1024/1440px and last-cell keyboard access passed |
| Real 200% Chromium zoom | Four representative pages in each portal (12 views) passed |
| Connected journey | Attendance/send, Principal translation draft/approval, Parent translated real-media playback/acknowledgement, profile/homework/timetable, simulation consent, local durable sync/duplicate/revocation, empty contexts and logout passed; cleanup verified |
| Fixed local family accounts | Read-only sign-in, child switching, status counts and cross-family RLS denial passed |
| Main-school preservation | Existing records match the private family-setup journal; no additional school data/password changes |
| Isolated working-tree build | Passed compilation, TypeScript, expected routes, generated `.env.production` only, synthetic-secret scan, unchanged-input check and snapshot cleanup |

Final build fingerprint: `82eb7f1c560a9f8bc6812bfda70fe09fe09969d621b9e908c485ac9c519c549c` (169 approved files). Final browser gate: QA `.local/website-qa/0fe60b3b-eb98-4651-b2a5-c787718cb5dd/results.json`, 4/4. The earlier `c42437df-3200-416b-a6c0-faae7a88b963` run remains 4/5, not fully passing.

Native zoom was set to 2 through Chromium's tabs API in an owned temporary QA browser profile, without changing the user's Chrome profile. The content viewport was approximately 713px inside a 1442px browser window; device pixel ratio was 2.5 with the laptop's OS scaling.

### Intermediate failures retained as failures

The first connected run targeted the ordinary account server, where the synthetic issuer is intentionally disabled. It was rerun on the isolated QA simulator server without weakening gates. The older harness then expected the previously removed compulsory Teacher translation form and mocked browser speech; it now checks original-only Teacher sending, optional Principal review and real local media. A later empty-context locator chose a hidden duplicate before the visible guidance; the assertion now selects a visible match. Each failed fixture run verified cleanup.

The expanded screenshots found loaded-workbook overflow. Grid sizing and the positioned scroll region were corrected, then the affected AI images were retaken. The first private 320px probe wrongly required a deliberately hidden school subtitle to be visible; another probe exposed the year selector's ambiguous accessible name, which was corrected explicitly. The initial private-profile zoom preference did not apply real zoom and was not counted; the independent native tabs-API check passed.

## Before/after artifacts and limitations

- [Before/after gallery](../UI_REVIEW_SCREENSHOTS/BEFORE_AFTER.html): desktop/mobile comparisons for all 23 portal pages.
- [Refined gallery](../UI_REVIEW_SCREENSHOTS/2026-11-09-refined/OPEN_GALLERY.html): 153 full-page captures plus three overview sheets, including More pages.
- New ZIP: `UI_REVIEW_SCREENSHOTS/Schovera_UI_Review_2026-11-09_refined.zip`. The original pack remains the baseline.

The refined pack passed PNG/dimension checks, 144 header-position checks, three-width page coverage, zero browser errors, zero final overflow findings and a private-password text scan. Password fields are masked. Local presentation names/account addresses may appear; this is not OCR-based anonymity certification. Generated images remain ignored by Git.

Fluent-language review, audible pronunciation on the presentation device and separately authorized production-hosting/security acceptance remain human/external checks. Screenshots do not establish functional security or sound quality. No hosted resources, real SMS/IVR, physical hardware, push or deployment were activated.
