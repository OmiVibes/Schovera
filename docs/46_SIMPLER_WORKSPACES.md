# Schovera — simpler workspaces

Schovera has exactly three portals: **Parent, Teacher and Principal**. Students
are school records linked to parents, not a fourth login role. A student must
not be silently turned into a Parent account.

## Sign-in

The sign-in form uses the existing school account's email and password.
Supabase authenticates the account; its persisted profile determines which
portal opens. There is no hardcoded person-to-role mapping, frontend password,
new temporary-login generator or new account provisioner in this change.

The mistakenly introduced local username aliases and account setup from the
previous turn were removed before activation. No account password was changed.
The requested three readable logins were subsequently configured and tested in
the current local database. Passwords are not included in source documents.
New accounts can now be created from the Principal portal using
[Manage users](47_MANAGE_SCHOOL_USERS.md). Hosted accounts remain a separate,
explicitly authorized setup; local changes are not production deployment.

Existing engineering fixtures remain isolated test utilities, not the definition
of the product. Existing simulation warnings and synthetic-environment indicators
remain accurate; hiding them would not implement real SMS, calls or hardware.

## Simpler screens (retained)

- Daily attendance, homework, communication, timetable and school notices remain.
- Optional gate-scan records open on demand on each portal's home page. Closing
  the section unmounts its panel and stops its polling.
- Parent notices appear before optional simulated notification preferences.
- Parent home does not repeat the same message in both Important and Latest.
- Child changes remount the scoped gate panel while keeping its disclosure open.
- New gate-section instructions are available in English, Hindi and Marathi.

## Verification

Run `npm run test:simple-ui`, `npm run typecheck` and `npm run lint`.
Connected checks require the isolated local Supabase stack. The earlier run was
blocked by Docker; the subsequent local QA and account-management results are
recorded in [Manage users](47_MANAGE_SCHOOL_USERS.md) and the
[website QA guide](48_WEBSITE_QA_AND_SIMPLICITY.md). A production build of the
current uncommitted changes is not claimed.

Production configuration and `.env.local` remain unchanged. The separate local
account-management migration and the explicitly requested fixed sign-ins are
documented in the account guide; this screen simplification does not change
those authorization boundaries. No deployment is included.
