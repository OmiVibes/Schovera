# Task 32H-DIAG-3 — Synthetic fixture disappearance

**Result:** The synthetic linked Parent fixture did not disappear during the gateway integration flow. Independent local PostgreSQL snapshots, authenticated RLS reads, and the actual browser-session token consistently showed the linked Parent profile and link present through dashboard assertions and immediately before cleanup. No app, RLS, migration, or hosted configuration change was needed.

## Root cause

The integration test also visits an intentionally unlinked Parent and an intentionally unassigned Teacher to verify isolation. Their zero-row results are expected. In addition, `SchoolEntryPanel` returns early when there is no selected child/class: it renders “Choose a linked child to view their records.” or “Choose an assigned class to view its records.” and leaves `data-loaded="false"`. That is a valid no-context state, not an RLS or fixture failure.

The new diagnostic snapshot was attached to a Playwright `page.on('response')` callback. Playwright does not await asynchronous event listeners, so the test could finish and close the browser context before the listener finished parsing the response and appending the snapshot. This caused the assertion that a zero-row unlinked-Parent snapshot existed to fail even though the browser query and UI check had completed successfully. The fix waits for the listener's snapshot promise before closing the context.

## Evidence and regression coverage

The integration now captures checkpoints from a fresh local Docker PostgreSQL connection, direct authenticated Supabase clients, and the actual bearer token observed on the browser request. It distinguishes linked and intentionally unlinked Parent scenarios and verifies:

- Linked Parent: physical profile/school/student/class/link rows exist; the authenticated browser query returns the linked row and nested student/class; the dashboard renders the expected recorded event.
- Unlinked Parent: the Parent profile exists, no link is present, RLS returns zero linked children/student/class rows, and the UI presents the choose-child prompt without event cards.
- Before cleanup: the linked fixture is still present. Cleanup happens only after these checks.

Three consecutive full local gateway-to-Supabase/browser integration runs passed after making response-snapshot capture deterministic. The prior diagnostic investigation also ran the focused Parent/PostgREST comparison, RFID, gateway, attribution, typecheck/lint, Student Profile and Reconnect checks. These are synthetic local tests only; they make no claim about hosted Supabase or production behavior.

## Safety boundary

The tests use only the guarded loopback development Supabase environment and uniquely named temporary synthetic records, cleaned in `finally`. `.env.local` was not read or modified. No hosted Supabase/Vercel access, production data, migration, application feature change, or deployment occurred. Pre-existing untracked developer files remain untouched.
