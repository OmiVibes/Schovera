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

### Task 32B-1.1 follow-up (2026-10-19)

The Principal Student Profile issue was reproduced with one unrelated Important update still awaiting acknowledgement. The controlled update's acknowledgement existed in local PostgreSQL and was readable through the Principal's RLS query, but `StudentOverview` derived the latest update's label from the total number of unrelated awaiting updates. It now derives each update's acknowledgement state from that update's own acknowledgement rows; the Parent view additionally checks the signed-in parent's row. The rendered Principal profile then showed the controlled Important update as `Acknowledged` while retaining the unrelated awaiting summary.

The reconnect verifier also had false negatives unrelated to persisted application state: it scoped the acknowledgement assertion through a non-matching nested-heading locator, expected a newly written historical attendance date to become the latest date, and read the timetable during a Realtime-triggered loading transition / duplicated Today-weekly entry. Assertions now target the unique controlled profile section, verify a new absent count within the profile's recent-history window, and wait for the controlled timetable entry and weekly section inside the Teacher timetable. Initial channel timeout diagnostics now report loopback Supabase request paths and concise browser errors (never query strings or credentials).

The complete reconnect scenario passed three times after the fixes, including the final test instrumentation. Repeated runs also exposed transient initial Realtime readiness timeouts; these were followed by complete passing runs, and the test now records local loopback requests rather than incorrectly reporting only hosted `*.supabase.co` requests. Parent acknowledgement, Principal RLS/refetch, background/foreground recovery, offline/online reconnect, multi-child isolation, role isolation, profile attendance/homework/timetable, and stale-response checks all passed. Accessibility/i18n, role navigation, the 22-destination x four-width visual audit, Teacher-AI browser flow, Student Profile and Phase 1 database checks passed. RFID target refusal passed for the production URL without sending an HTTP request.

`npm audit` (non-mutating, 2026-10-19) reported 1 critical and 8 high findings. No dependencies were changed. Installed findings and priority:

| Priority | Installed package(s) / chain | Impact and applicability | Remediation direction |
|---|---|---|---|
| P0 | `next@16.3.4` (direct production dependency; `sharp@0.35.4` is nested below it) | Audit groups multiple Next advisories as critical. The `next/og` RCE requires Node `ImageResponse` with attacker-controlled SVG values; source inspection found no `ImageResponse` use. Other advisories concern cache components/Draft Mode, self-hosted SSG/ISR, development MCP, metadata-image dynamic params, and image optimization. Schovera has no `use cache`, `draftMode`, metadata-image generator, or `next/image` use found in source; actual hosted runtime configuration was not independently audited here. | Schedule a focused Next 16 patch upgrade; npm audit currently offers `16.4.2` (same major, no major-version migration indicated). Validate lockfile, build, all role and security suites, and deployment preview before production. Do not defer the critical framework finding solely because source scans found no vulnerable feature usage. |
| P1 | `sharp@0.35.4` (production, via Next) | Upstream librsvg memory-safety issue may permit RCE under runtime-specific conditions on glibc Linux, especially when decoding SVG. Local Windows testing does not exercise that Linux condition; image-optimization exposure depends on deployed Next configuration. | Upgrade to `0.35.5` or a compatible patched Next release that brings it in. |
| P1 | `source-map-js@1.2.1` (production path via Next/PostCSS; also shared by dev tooling) | Malformed indexed source maps with extremely large section offsets can block the event loop. No user-supplied source-map processing path was identified; risk is chiefly dependency/build-input exposure unless an attacker can supply maps to a consumer. | Upgrade to `1.2.2` through compatible dependency resolution. |
| P2 | `eslint-config-next@16.3.4` -> `@next/eslint-plugin-next@16.3.4` -> `fast-glob@3.3.1` -> `micromatch@4.0.8` -> `braces@3.0.3` | Development-only lint/glob chain. Deeply nested untrusted brace patterns can cause stack exhaustion; this repository supplies its own static lint patterns, not request input. The audit's suggested `eslint-config-next@14.2.35` is a major-version downgrade and must not be applied. | Update the lint toolchain in a separately tested, version-aligned change; retain Next/ESLint config compatibility. |
| P2 | `brace-expansion@1.1.18` via ESLint/minimatch and `brace-expansion@5.0.9` via TypeScript-ESLint/minimatch (development-only) | CPU/stack denial of service for crafted nested brace expressions; no runtime request path was found. | Resolve to patched compatible branches (`1.1.21` and `5.0.12` or newer) through reviewed parent dependency updates. |

The audit's 8 high package findings are the lint chain packages above plus `source-map-js`; the Next aggregate is critical and includes several distinct advisories. Advisory references: [Next ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Next cache and runtime advisories](https://github.com/advisories/GHSA-3w37-wq28-93x7), [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), and [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). These are remediation findings, not evidence of exploitation.

Final local checks: `test:rfid` (16 tests), typecheck, lint, build, accessibility/i18n, role navigation, role visuals, Teacher-AI browser, Student Profile, Phase 1, and three complete reconnect runs passed. The local Supabase API/database remained loopback-only; production/Vercel and `.env.local` were not used or modified. No migration, schema, dependency, or production changes were made.

The historical script file `scripts/verify-production-i18n.mjs` is exposed as `verify:local-i18n-reconnect`; it requires local mode and loopback Supabase/browser targets. It no longer defaults to Vercel and is not a production test command.

## RFID protection check

```powershell
npm run test:rfid
npm run simulate:rfid -- --target https://schovera.vercel.app
```

The unit tests must pass. The second command is expected to fail with `simulator refuses external destinations`; this happens before any request (the simulator contains no HTTP delivery code). Neither command reads `.env.local`, `.env.test.local`, or `.env.development.local`.

## Task 32B-2 local-only implementation record (2026-10-19)

Three Task 32B-2 migrations add the local RFID device registry, opaque credentials, immutable check-in/out events, durable deduplication receipts, Principal provisioning/revocation RPCs, and the service-role-only event processor. They were applied incrementally to the loopback Supabase database and `npx supabase db lint --local` reported no schema errors. A fresh destructive replay was not run because that would erase the existing local demo database; preserve it unless the user explicitly chooses a reset.

The local Next endpoint is disabled by default and requires explicit local mode, loopback Supabase configuration, and a loopback Host header. `npm run dev:rfid-local` is a separate guarded launcher that reads `.env.development.local` plus `.env.test.local`; standard `npm run dev` still clears the service-role credential. Local production-build verification now uses the isolated workflow below; it never reads `.env.local`.

### Isolated production-build verification (Task 32F-1)

From PowerShell at the repository root, with all intended tracked changes committed:

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
npm run build:isolated
```

`npm run build:local-check` is a backward-compatible alias to the same isolated workflow. Do not run `next build` directly in the developer checkout when `.env.local` is present.

The build runner creates a unique temporary snapshot from committed Git-tracked files only; it refuses to run with tracked modifications. It excludes every `.env*` file, `.npmrc`/credential files, `.local`, `.vercel`, database files, local spreadsheets/CSVs, uploads, review artifacts, existing dependencies and build output. Existing untracked developer files are never copied. The only generated Next environment file is `.env.production`, with `http://127.0.0.1:54321` and a clearly synthetic publishable-key placeholder; service-role and AI variables in that file are empty. Next's production environment-file discovery is rechecked recursively before and after build, and any file other than this generated file fails the run.

Dependencies are installed in the snapshot with `npm ci --offline` using the committed lockfile, an isolated empty npm config, and the machine's npm cache. Missing cached packages fail closed; this command does not fall back to registry downloads. The build gets an allowlisted child environment rather than inheriting the developer environment. Synthetic service-role/OpenAI/private-variable sentinels are used only for leakage detection; the runner scans all `.next` outputs and fails if any sentinel appears. It also verifies the expected app/API route manifest and rejects Next output that reports `.env.local`.

Next's existing `next/font/google` imports need Google Fonts assets during a production build. The isolated runner routes proxy-aware build egress through a loopback allowlist permitting only `fonts.googleapis.com` and `fonts.gstatic.com` on port 443 and denies other requests through that proxy; it records hostnames only. No Supabase or Vercel URL is configured. This application-level proxy is not an operating-system firewall: do not treat it as a general sandbox for untrusted build scripts. The isolated source is the committed repository and the npm install is offline. The temporary directory is uniquely generated under the OS temp directory, path-validated, and removed in a `finally` block on success or failure.

This verifies a local build with synthetic settings, not production deployment configuration or hosted runtime behavior. It does not certify Vercel secrets, network policy, production Supabase security, or resolve any Next.js security advisory. Do not deploy solely because this local build passes.

Task 32G supersedes the old v1 integration harness. `POST /api/device/v1/events` now returns local-only `410 Gone`: it has no immutable assignment proof and cannot safely attribute delayed offline records. `npm run test:rfid:integration` now runs the v2 local Supabase integration test using temporary synthetic schools/users/children/devices/keys. It invokes the actual key-registration, capability-issuance, and event-v2 route handlers directly, verifies their loopback gates and role RLS, tests reassignment/revocation races, exact retries/conflicts, and cleanup. It does not connect the durable gateway or change classroom attendance. No Next development server is started, avoiding Next environment discovery of the developer `.env.local` during this integration.

The `npm run dev:rfid-local` launcher also refuses to start if `.env.local` exists, because Next may discover it even when the launcher explicitly supplies local Supabase values. Use a disposable clean checkout without private environment files for HTTP/UI server testing; do not move, rename, or edit the developer `.env.local` as a workaround.

Before the test, keep local Supabase running, confirm loopback-only status, apply only local pending migrations, and create a local synthetic issuer keypair once:

```powershell
npx supabase status # do not share output; it contains local keys
npx supabase migration up --local
npm run rfid:capability-key:init
npm run test:rfid:integration
```

The initializer writes its private key under the ignored `.local/schovera-rfid-gateway/` directory and prints only the public key. The integration test requires `.env.test.local`, the local keypair, and the local loopback Supabase instance. It registers the key using a synthetic authenticated Principal and cleans up its controlled database rows. Do not paste raw output from `npx supabase status`; do not run remote `link`, `db push`, reset, or production migrations. See [Task 32G](31_TASK_32G_RFID_EVENT_V2_IMPLEMENTATION.md) for scope and current verification limits.

Task 32C may proceed only after reviewing the local implementation and deciding the privacy-preserving dashboard projection. Event Realtime remains unpublished until a minimized signal strategy and the authorized refetch behavior are approved and tested. The local API is intentionally not hardened for public/multi-instance traffic: its rate limiter is in-memory, local transport is plain HTTP loopback, and real device onboarding/key rotation workflows remain out of scope. Keep `.env.local` unchanged and do not expose/tunnel this server.
