# Separate online demo — local preparation, approval still required

Task 32Q was not found in local branches/history when Task 32R began at `af61329`. This document and the local preparation/preflight scripts cover its safe preparation only. They do not authorize a hosted write or deployment.

## Proposed topology and compatibility

| Capability | Separate hosted Vercel + Supabase compatibility | Release gate |
|---|---|---|
| Role dashboards, auth, RLS reads/RPCs, translations, acknowledgements, attendance, homework, timetable | Normal Next.js/Supabase architecture; still needs actual preview acceptance | Separate project references, synthetic-only data, origin/auth configuration and RLS acceptance |
| Browser speech | Browser/OS-dependent, not a serverless audio backend | Actual presentation device; text fallback; no promise of offline voices |
| Teacher AI | Laptop Ollama is not reachable as localhost from Vercel | Disabled via hosted-demo flags, server returns unavailable; do not expose laptop through a tunnel |
| Spreadsheet editor | Browser-local import/export; not server storage | Synthetic files and compatible browser test |
| Entry dashboards | Authorized read-only pre-seeded fictional event records can be shown | Separate approved provisioning/review; do not publish the local ingest route |
| Device/gateway ingestion | **Not deployable as a public service** under current local-only boundary | Keep flags/service/issuer keys absent; requires separate security design/authorization |
| SMS/IVR | Local simulator only; backend refuses non-loopback | Keep adapters disabled online. Local demo may show fake receipts; hosted version must not promise operational telephony |
| Offline gateway | Laptop process/SQLite, not a Vercel service | Trainer-only local demonstration; no cloud queue/power-loss/hardware claim |

## Completed preparation

- `npm run demo:isolated:prepare`: exact committed local worktree; private-env exclusion; offline lockfile install; safe env/issuer generation. No remote operations.
- `npm run presentation:prepare`: owned local-only fictional school; retry-safe completed provisioning and explicit cleanup. Its loopback guard deliberately refuses hosted seeding. It is **not** a remote migration/provisioning tool.
- `npm run demo:release:preflight -- <app-origin> <demo-supabase-origin> <demo-reference> <production-reference>`: pure planning validation; reads no env files, sends no network request, validates HTTPS origins and distinct owner-supplied references. A valid plan still returns `deploymentAuthorized: false` and `hostedSeedingAuthorized: false`.
- [Placeholder environment template](templates/demo-online.env.example): public demo values only; service-role/issuer/paid-provider keys blank, local adapters disabled and live hosted AI disabled. It is not copied into production or populated during this task.

The preflight cannot independently prove ownership, data separation, Vercel access protection or Supabase policy correctness. The owner must verify references without supplying production secret values. Passing unit tests with fictional project references is not a live cloud acceptance test.

## Required owner decisions before any release

1. Authorize creation/use of a **separate** Vercel project and **separate** Supabase project; confirm identifiers are not production. No such resources were created here.
2. Confirm account ownership, region/data processing, budget/plan limits, who can access the demo and a stop/delete date. Access-protection availability must be verified for the selected hosting plan; no paid feature is assumed free.
3. Approve synthetic-only schema provisioning in that separate database. Review all migrations, including Task 32R's author-only homework edit RPC. No production `db push`, linking or reset.
4. Approve a distinct hosted provisioning workflow and generated accounts. Existing mutating test/seed scripts remain loopback-only; do not remove their guards to seed the cloud.
5. Set exact HTTPS auth origins/redirects in the demo Supabase dashboard. Store only its publishable browser key in public environment values. Keep server service/issuer keys absent.
6. Configure hosted-demo flags to prevent misleading live-AI controls. No paid provider or laptop-localhost fallback is authorized. Keep local RFID/fallback modes unset.
7. Before public access, verify role sessions, cross-school/class/child denial, approval/source invalidation, acknowledgement, stale homework edits, responsive UI and no secret bundles in a protected preview.
8. Test that every device/fallback route stays disabled remotely, real provider calls do not exist, and browser pages honestly describe disabled capabilities.
9. Record the exact approved commit, deployment identifier, environment ownership, screenshots and rollback/disable procedure. Do not infer successful deployment from a local build.
10. Rotate/delete demo accounts and data after the approved event; preserve evidence without credentials.

## Decision

**LOCAL PREPARATION AVAILABLE. HOSTED RELEASE BLOCKED PENDING EXPLICIT APPROVAL AND REMOTE ACCEPTANCE.** No Vercel project, Supabase project, remote secret, hosted migration, push or deployment was created/changed. Production `.env.local` was not read or copied. Do not start the next deployment task automatically.
