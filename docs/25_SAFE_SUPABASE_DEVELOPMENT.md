# Safe Supabase development setup (Task 32B-1)

## Current finding

Schovera has 16 ordered SQL migrations under `supabase/migrations/`, but no `supabase/config.toml`, no Supabase CLI executable, and no configured local stack. Docker Desktop's CLI is installed, but its Linux engine is currently stopped (`docker info` cannot connect). Therefore a clean local database replay has **not** been run or claimed.

The existing `.env.local` contains a hosted, non-loopback Supabase URL and a configured service-role variable. Its values were not printed or changed. Many existing `verify:*`, `seed:demo`, and `clean:demo` scripts explicitly load `.env.local`; do not run those commands until they have been changed to load a dedicated test environment and fail closed on non-loopback URLs. The RFID unit test does not load environment files and has no Supabase/network client.

No additional hosted Supabase project is needed for an isolated local stack. The local Supabase CLI uses Docker containers; Docker Desktop and the CLI must be available before initialization. The current environment is blocked on starting Docker Desktop and installing/obtaining the CLI.

## Safe Windows PowerShell steps

These are instructions only; Task 32B-1 did not start Docker, install the CLI, initialize config, run migrations, or use credentials.

1. Start Docker Desktop from the Windows Start menu. Wait until it reports that the engine is running. In a fresh PowerShell window, check:

   ```powershell
   docker info --format '{{.ServerVersion}}'
   docker compose version
   ```

   The first command must print a server version rather than a pipe/engine connection error. Docker Desktop is already installed in the inspected environment, but its engine is not running.

2. From the repository root, install and pin the Supabase CLI as a development-only project dependency, then check it:

   ```powershell
   Set-Location 'D:\Notes\Degree\Projects\Schovera'
   npm install --save-dev supabase
   npx supabase --version
   ```

   Review the resulting `package.json` and lockfile diff before accepting it. This downloads a development tool; it does not create or connect a hosted project.

3. Initialize local Supabase config. This repository already contains the `supabase/migrations` directory; initialization should add `supabase/config.toml`, not replace migrations. Review the diff immediately and stop if existing migration files appear modified or removed:

   ```powershell
   npx supabase init
   git status --short
   git diff -- supabase
   ```

4. Start the isolated local stack and inspect its local URLs/keys:

   ```powershell
   npx supabase start
   npx supabase status
   ```

   Keep the CLI output private. Do not run `supabase link`, `db push`, or commands that name a hosted project. The local project URL should be `http://127.0.0.1:54321` (or another loopback address/port reported by the CLI). Local Studio is normally at `http://127.0.0.1:54323`.

5. Create the app-only development env file without touching `.env.local`:

   ```powershell
   Copy-Item .env.development.example .env.development.local
   notepad .env.development.local
   ```

   Keep the URL loopback-only and replace the placeholder key with the local publishable/anon key from `supabase status`. Do not paste a hosted key. This ignored file is intended for `next dev`; Next.js gives `.env.development.local` precedence over `.env.local` in development. Do not put a service-role/secret key in a `NEXT_PUBLIC_*` variable or this app-facing template.

6. Before any destructive local reset or DB integration test, independently verify the target is loopback-only and inspect the migration replay in local Studio. At present, the repository's DB-writing `verify:*`, seed, and clean scripts still force-load `.env.local`; **do not run them**. They need a later code change to load a dedicated test env and hard-reject a non-loopback URL before any Supabase client is created. Avoid `db reset` until the local stack and target have been positively confirmed.

7. Start the app only after the local credentials are in `.env.development.local`:

   ```powershell
   npm run dev
   ```

   Stop the local services when finished:

   ```powershell
   npx supabase stop
   ```

No Supabase Dashboard/manual project setup is required for the local-only path. If local Docker cannot be enabled, the alternative is a **new, separate non-production Supabase project** created by the owner, with disposable data and fresh credentials. Do not use or link Schovera production; do not send production credentials to the agent.

## RFID production-target guard check

The Task 32A RFID tests are unit-only and never instantiate a Supabase client. Run:

```powershell
npm run test:rfid
npm run simulate:rfid -- --target https://schovera.vercel.app
```

The unit suite must pass, and the second command is expected to exit nonzero with `simulator refuses external destinations`. The guard rejects remote/production targets before any network operation; the simulator has no network delivery implementation. No Supabase environment file is loaded by either command.

## Task 32B-2 gate

Before adding database-backed RFID code, first get Docker's engine running and the Supabase CLI installed, initialize and review local config, replay all migrations locally, and prove that the app targets loopback while `.env.local` remains unchanged. Then design the isolated local schema/RLS tests and only later consider a separate hosted test project if a local stack proves insufficient. No RFID tables, routes, or dashboards were added for this setup task.
