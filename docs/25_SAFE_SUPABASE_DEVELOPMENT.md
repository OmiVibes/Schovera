# Safe Supabase development setup (Task 32B-1)

## Local-only boundary

Schovera's existing `.env.local` is reserved as-is and points to a hosted Supabase project. Never use it for development DB mutations, migration checks, seed/cleanup, or integration verification. All DB-writing seed/cleanup/verifier commands now load `.env.test.local` and call `assertLocalTestEnvironment()` before constructing a client. The guard requires `SCHOVERA_TEST_MODE=local`, an HTTP loopback Supabase URL, a loopback browser URL when configured, and local-only keys. There is no remote mode in these scripts.

The standalone RFID simulator and its tests do not load environment files, instantiate Supabase clients, or perform network requests. Their production-target refusal is covered by tests.

## Windows PowerShell setup

Run commands from the Schovera repository root. Local Supabase runs in Docker and needs no hosted project, Supabase login, or dashboard setup. Install the lockfile dependencies first; this repository pins the Supabase CLI as a development dependency.

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
npm ci
docker info --format '{{.ServerVersion}}'
npx supabase --version
```

If `supabase/config.toml` is absent, initialize it. This repo already contains `supabase/migrations`; inspect `git status` and review any migration diffs carefully before local replay:

```powershell
if (-not (Test-Path .\supabase\config.toml)) { npx supabase init }
git status --short
git diff -- .\supabase\migrations
```

The current migration chain needed one replay-compatibility correction in `20260907183000_recover_partial_schema_and_security.sql`: it changes the return types of two existing RPC signatures, which PostgreSQL will not permit with `CREATE OR REPLACE`. The migration now drops and recreates those exact signatures before restoring their grants. This is required for a clean database replay; do not manually run SQL against a hosted project.

Use a Docker network that binds published Supabase ports to loopback only. This avoids exposing the local development stack to other machines on the LAN:

```powershell
$networkNames = docker network ls --format '{{.Name}}'
if ($networkNames -notcontains 'schovera-local') {
  docker network create --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' schovera-local
}
npx supabase start --network-id schovera-local
```

The CLI's default status display includes local keys. Do not paste or capture that output in reports. The env-file generator below reads the status programmatically, validates loopback, and prints only filenames and success/failure.

Do not run `supabase link`, `db push`, or any command against a hosted project. `supabase start` applies the repository's existing migrations to the local stack on initial setup. If you need to apply pending migrations later, inspect `npx supabase migration up --help` and use only the explicit `--local` target. Do not run a database reset unless you have positively confirmed the target is local and intentionally want to erase that local database.

Generate ignored app and test environment files from the local CLI status output. The generator validates loopback before writing, refuses to overwrite either file, and never prints key values:

```powershell
node .\scripts\configure-local-supabase-env.mjs
git check-ignore .env.development.local .env.test.local
```

`.env.development.local` contains only the local API URL and publishable key for development. `.env.test.local` additionally contains the local service-role key and explicit local test mode for integration scripts. Both are ignored; never add them to Git or paste their contents into logs. Next may report `.env.local` as a discovered file, but the `npm run dev` launcher requires the development env file, enforces a loopback URL, sets the local URL/key explicitly, and clears `SUPABASE_SERVICE_ROLE_KEY` in the process before Next starts, so the hosted values cannot override those variables. It does not modify `.env.local`.

Start the application only after generating the local env files:

```powershell
npm run dev
```

## Local seed and verification

The database tests create temporary records, so they now fail closed unless `.env.test.local` explicitly declares local mode and loopback endpoints. Start with local seed data, then run desired verifiers:

```powershell
npm run seed:demo
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
npm run verify:local-i18n-reconnect
npm run typecheck
npm run lint
npm run build
```

`npm run clean:demo` is destructive within its configured test database and is protected by the same loopback/mode guard; use it only after confirming local Supabase is the target. The DB verifiers do not clean the whole database; they remove their own temporary rows, while demo seed records remain available locally.

Task 32B-1 local run record (2026-10-19): Docker Engine 27.4.0 and Supabase CLI 2.121.0; local project starts on loopback and all 16 existing migrations apply. Seed and the phase1, attendance, announcements, assignments, corrections, idempotency, student-profile, timetable, and reliability verifiers passed. `verify:phase1` passed on its independent rerun after one initial Realtime readiness timeout. `verify:reconnect` reached and passed its earlier recovery scenarios but failed later waiting for the Principal Student Profile to show `Acknowledged`; investigate that existing reconnect/profile assertion before treating the reconnect suite as green. The app root and local Supabase Auth health endpoint returned HTTP 200. RFID tests, typecheck, lint, and production build passed. No hosted Supabase or Vercel endpoint was used.

The historical script file `scripts/verify-production-i18n.mjs` is exposed as `verify:local-i18n-reconnect`; it requires local mode and loopback Supabase/browser targets. It no longer defaults to Vercel and is not a production test command.

## RFID protection check

```powershell
npm run test:rfid
npm run simulate:rfid -- --target https://schovera.vercel.app
```

The unit tests must pass. The second command is expected to fail with `simulator refuses external destinations`; this happens before any request (the simulator contains no HTTP delivery code). Neither command reads `.env.local`, `.env.test.local`, or `.env.development.local`.

## Task 32B-2 gate

Before implementing RFID database tables or ingestion, verify local migration replay and auth/RLS behavior, including anonymous, cross-school, unassigned Teacher, unlinked Parent, revoked device, duplicate and altered-payload cases. Local Supabase is for development only; it is not hardened for public traffic. Keep `.env.local` unchanged, do not link this working tree to production, and do not add RFID tables or routes before the separate Task 32B-2 design/approval.
