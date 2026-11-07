# Principal — Manage users

## Using the screen

1. Open the running school website and sign in with your **Principal** account.
2. Select **Manage users** from the navigation (`/principal/users`).
3. Enter the person's full name, email and a password of at least 12 characters,
   including uppercase, lowercase, a number and a symbol.
4. Choose **Parent**, **Teacher** or **Principal**.
5. For a Parent, select their existing children. For a Teacher, select their
   assigned classes. For another Principal, explicitly confirm school-management
   access. There is no Student login role.
6. Select **Create account**. Wait for the confirmation. The person can now sign
   in with that email and the password chosen on the first successful attempt.
7. Share credentials privately. They do not rotate at startup. Passwords are not
   displayed in the school user list, logs or audit events.

Existing accounts are not overwritten when an email is already in use. This
screen creates accounts and lists same-school users; it does not reset passwords,
delete people, disable people, edit roles, enroll new students or create classes.

If the connection fails, keep the form and select **Retry account creation**.
Use the original password. A retry cannot change a password already saved.
The non-password draft/request ID is retained in this tab's session storage for
reload recovery. The password is held only in form memory and cleared on success;
after a reload you must reenter it. Closing the tab or clearing storage loses that
recovery draft. An administrator must then inspect any incomplete Auth account
using its server-controlled provisioning metadata before attempting manual repair.
Do not delete unrelated accounts or reset the database to repair one request.

## Current deployment boundary

Implemented and tested against **local Supabase only**. Production, Vercel and
`.env.local` are unchanged. There is no new public signup path. The existing
three named local logins are not rotated or replaced by this feature.

The regular local launcher intentionally clears the service key and cannot
create accounts. Use the separate guarded launcher from an isolated checkout
without `.env.local`, with matching local-only env files:

```powershell
npx supabase migration up --local # verify the local stack/target first
npm run dev:accounts-local -- --port 3103
```

Then open `http://127.0.0.1:3103/principal/users`. This does not enable RFID or
SMS simulation routes and does not add a demonstration banner. The privileged
server remains bound to loopback. Do not expose or tunnel it.

## Security and persistence

- Browser requests carry the signed-in user's bearer token, never the service key.
- The server verifies the token with Auth. A service-only RPC verifies an active
  Principal profile, unbanned/non-expired account, school and live Auth session.
  A form-supplied role/school does not establish the caller's authority.
- Selection lists and account relationships are same-school. Cross-school,
  inactive, duplicate and mismatched class/child selections are rejected.
- Creating another Principal requires explicit confirmation. Principal accounts
  have broad school-management authority; only issue them to authorized staff.
- Strict JSON, a 16 KiB streaming body limit, origin/Host checks, local-mode gates,
  bounded selection lists, API timeouts and a per-Principal in-memory limiter apply.
- Auth user IDs are deterministic per Principal/request ID. Server-only Auth
  metadata binds the non-password payload to its issuer/request. Retries check
  that ownership; they never reset an existing password or take over another email.
- Auth creation and PostgreSQL are separate services, not one global transaction.
  If Auth succeeds but database completion fails, the Auth user has no school
  profile/links. The same request resumes instead of creating another user. A
  losing concurrent identical Auth creation rereads the canonical user.
- `finish_school_account` serializes the user ID, rechecks the Principal's school
  and session and locks/rechecks the linked classes/children. It creates profile,
  relationships and one audit event atomically. Replays do not overwrite profiles.
- Only `service_role` can execute the two new RPCs. Existing browser RLS, role
  grants and student-data policies are not broadened. No new table is required.
- No passwords or password hashes are added to application tables, Auth metadata,
  local logs or browser storage. Auth retains its normal password hashing.

This is not a production-management release. Hosted enablement needs separately
approved server-only secret custody, HTTPS/exact origins, distributed rate limits,
monitoring, recovery/key/access policy and hosted acceptance. The current route
deliberately refuses hosted/non-loopback targets. Administrative form copy is
English; the new navigation label also has Hindi/Marathi translations.

## Files and local tests

Migration: `20261106100000_add_school_account_management.sql` (two service-only
RPCs; no destructive statements or new tables). Applied to the existing local
stack only; no reset or fresh production replay was performed.

```powershell
npm run test:accounts
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3103'
npm run verify:accounts # isolated checkout; local server and DB required
npm run typecheck
npm run lint
npx supabase db lint --local
```

The connected verifier creates uniquely owned synthetic schools, users, children
and classes. It tests Auth login, Parent/Teacher relationships, all three roles,
cross-tenant/anonymous/non-Principal denial, inactive Principal, origin denial,
server-only RPC permissions, duplicate email, concurrent/exact/conflicting retry,
interrupted Auth/profile completion, original-password preservation, logout/session
denial, browser creation, password clearing/storage/bundle checks and responsive
widths. `finally` removes its own rows/users, not existing school accounts.

An initial acceptance run passed browser creation and cleanup but expected HTTP
403 after logout; Auth correctly returned 401. The assertion now accepts either
unauthenticated/unauthorized denial and does not weaken the requirement to reject
the logged-out token. Consult the final execution report for actual passing runs.
No physical hardware, email delivery, production deployment or audible voice test
is claimed. A production build must use the committed-source isolated build
workflow; no direct build may load the developer's production environment.

### Final local run — 2026-11-06

- `test:accounts`: 13 tests passed (final isolated run used locked Vitest 4.1.12).
- `verify:accounts`: 18 scenario groups passed, including the real Principal
  browser form, 1440/1024/768/390px overflow checks, browser-bundle service-key
  absence, oversized-body rejection and cleanup. Two earlier complete acceptance
  reruns also passed before the final extra checks were added.
- TypeScript, ESLint, script syntax and `git diff --check` passed.
- `supabase db lint --local`: no schema errors. The additive migration applied
  to the existing local stack; no destructive reset was used.
- The existing Arohi, Swarangi and Revati accounts were independently signed in
  through the browser and reached their correct portals; credentials unchanged.
- Actual Principal desktop/mobile captures were reviewed. Review caught an
  overly narrow wrapping table on mobile; it now scrolls within its card with
  a small-screen instruction rather than splitting headings into single letters.
  A follow-up screenshot exposed grid min-content stretching hidden by the app's
  root overflow clipping. Explicit zero-minimum grid tracks/container widths fixed
  it. The browser test now also checks actual form/control bounding boxes at each
  width instead of relying only on `document.scrollWidth`.
- The guarded account launcher restarted successfully using only the approved
  local environment files. Current app: `http://127.0.0.1:3103`.
- Full historical role/online suites were not rerun. Their route lists now include
  Manage users (23 routes); those updates are not new full-suite pass claims.
- No production build was run because the safe build workflow requires committed
  source, and these worktree changes are left uncommitted for review. The build
  manifest check now also requires the new account API route.

No dependency was added. No production, `main`, Vercel or private production env
change was made. Earlier unrelated/protected untracked files remain untouched.
