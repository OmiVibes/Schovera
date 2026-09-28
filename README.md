# Schovera

Schovera connects teachers, parents, and school leaders around student communication, attendance, homework, schedules, and official notices.

## Run locally

1. Use Node.js 20.9–22 and install dependencies:

   ```powershell
   npm ci
   ```

2. Create `.env.local` with the Supabase project URL and publishable key supplied for your development environment. Never put a service-role key in browser-visible variables or commit secrets. Teacher AI defaults to a local Ollama model; install Ollama and run `ollama pull gemma3:1b`. See [Teacher AI setup](docs/TEACHER_AI_SETUP.md).

3. Start the application:

   ```powershell
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and sign in using the role accounts issued for your test environment. Do not use real students' personal data during acceptance testing.

## Step-by-step manual showcase check

Use a dedicated test school and test accounts. Keep separate browser windows or private sessions for Teacher, Parent, and Principal so you can observe updates without relying on refresh.

### Teacher

1. Sign in and confirm the school, account name, role, language selector, navigation, and sign-out control are readable.
2. **Overview:** open the overview and confirm the selected class and action links; follow each link and use browser Back to return.
3. **Students:** select the assigned class, search by a test student's name/roll, open one student, and verify the profile and recent communication.
4. **Profile:** review identity, attendance, communication, homework, and schedule sections; confirm empty/error states are understandable if data is absent.
5. **Attendance:** change a test student's status, check the present/absent/late totals, save, and confirm the saved state. Use only a test date/student.
6. **Homework:** create a short test assignment with a future due date; confirm it appears in the list and later in linked Parent/Principal views.
7. **Schedule:** confirm today's periods and the weekly class schedule are readable.
8. **AI studio:** try a syllabus outline, worksheet, lesson plan, or exam draft with generic, non-sensitive sample details. Review and edit the result; confirm nothing is auto-published. Then open a small workbook, edit a cell, download the copy, and reopen it. The spreadsheet stays local; this basic editor does not preserve styling, formulas, macros, or other sheets.
9. **School notices:** confirm published school-wide notices are visible and read-only.

### Parent

1. Sign in, select each linked test child in turn, and confirm the selected child's name/class remains consistent as you navigate.
2. **Home:** check child context, important items, attendance summary, recent updates, and school notices.
3. **Profile:** check attendance, teacher communication, and upcoming homework for the selected child.
4. **Updates:** open an Important test update and acknowledge it once; confirm the visible state changes to acknowledged.
5. **Attendance:** compare dates and statuses with the Teacher test entry.
6. **Homework:** confirm the Teacher test assignment, subject, instructions, and due date.
7. **Timetable:** verify today's periods and weekly schedule for the selected child's class.
8. **School notices:** confirm official school-wide notices are distinct from child-specific teacher updates.
9. Change the language selector between English, Hindi, and Marathi; check that Parent navigation and translated Parent content remain understandable, and switch back.

### Principal

1. Sign in and verify the school overview and role identity.
2. **Students:** search for the same test student and inspect the profile.
3. **Communication:** verify the Important update and its acknowledgement state; check Awaiting filtering before acknowledgement and its removal after acknowledgement.
4. **Attendance:** compare class totals with the Teacher test register.
5. **Homework:** confirm the test assignment is visible to the school.
6. **Timetable:** verify class schedule and test an edit only in the dedicated test school.
7. **School notices:** publish a clearly labeled test notice, confirm it appears to Teacher and Parent, then remove it only through the approved test-data cleanup procedure.

### Mobile and accessibility pass

Repeat the essential Teacher send/attendance/AI and Parent update/acknowledgement flows at 390px width. Check for horizontal page overflow, reachable controls, visible keyboard focus, readable status text (not color alone), useful field labels, and clear errors/success messages. For live Realtime checks, wait for the UI's connected/ready state and verify the receiving screen without refreshing.

## Automated checks

Run from the repository root. The integration verifiers use the Supabase values in `.env.local` and create temporary test records; run them against a dedicated non-production test project. Do not run cleanup or verification scripts against a school with real records unless you have confirmed their scope.

```powershell
npm run verify:phase1
npm run verify:attendance
npm run verify:announcements
npm run verify:assignments
npm run verify:corrections
npm run verify:idempotency
npm run verify:student-profile
npm run verify:timetable
npm run verify:reliability
npm run verify:reconnect
npm run verify:accessibility-i18n
npm run verify:role-navigation
npm run verify:role-visuals
npm run verify:teacher-ai
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

`npm run verify:role-visuals` checks all role sections at 1440, 1024, 768, and 390 pixels and saves screenshots in the operating system's temporary directory. `npm run verify:teacher-ai` checks local workbook edit/export and Teacher-only access. Test real generation with Ollama running and a non-sensitive sample; see [the AI setup and safe-use notes](docs/TEACHER_AI_SETUP.md).

For competition-specific acceptance scenarios, see [docs/20_COMPETITION_ACCEPTANCE_TESTS.md](docs/20_COMPETITION_ACCEPTANCE_TESTS.md) and [docs/11_TESTING_STRATEGY.md](docs/11_TESTING_STRATEGY.md).

## Before a public showcase

- Test local Ollama generation with a Teacher using non-sensitive inputs; have a teacher review curriculum accuracy and answer keys.
- Confirm demo accounts and realistic demo records in the intended environment; do not display passwords in the app or repository.
- Run the automated checks against the intended release commit, inspect role screenshots, and test Teacher, Parent, and Principal in separate sessions.
- Verify the hosting deployment commit and environment variables before announcing the production demo URL.
