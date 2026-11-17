# Another laptop: local website and its own sign-ins

17 November 2026. A local URL is not a shared online website. Pulling GitHub code does not copy accounts, school records, private configuration or running services. Each laptop's `127.0.0.1` points to that laptop.

The competition accounts use fictional `@manual.local.test` identifiers. They are login names, **not mailboxes**. The local administrator creates them already confirmed; this workflow does not send account/password emails. There is no published universal password. Accounts from Om's local Supabase will not authenticate against a different local Supabase on another laptop. A completed test fixture may also have been explicitly cleaned, making its earlier passwords unusable even on the original laptop.

## What ma'am can give her coding assistant

Copy this request into the assistant on **her own laptop**, with the latest Schovera checkout open:

> Run Schovera's current M6 local competition workflow on this laptop, including its database and accounts, not just Next.js. Read `docs/competition/SECOND_LAPTOP_SETUP.md` and the M6 report first. Detect the OS; the verified workflow is Windows/Node 22.13–22.x. Inspect existing local services, Git work and fixture ownership before changing anything. Do not read/copy/move/rename any production `.env.local`, reset databases, overwrite configuration, expose services, deploy or use Om's credentials. If this laptop already has a known owned competition setup, use its start/status/credentials commands. Otherwise follow the fresh Windows procedure only when its empty-directory and no-existing-stack checks pass. Create only an owned fictional school. Verify actual Teacher, Parent and Principal sign-in forms and role pages before saying it works. Return this laptop's URL and its three generated sign-ins privately to me; never commit passwords or send them to someone else. Report any setup/migration error exactly; do not bypass a guard or claim this laptop was tested elsewhere.

This is a handoff for execution on that machine, not proof its setup has already succeeded. The existing configured laptop passed the three real sign-in forms, role-home navigation and logout on 17 November. Fresh installation on ma'am's machine has not been executed or verified from Om's computer.

## If her approved competition setup already exists

From that laptop's latest source checkout, with its approved QA source/dependencies synchronized and Docker/local Supabase running:

```powershell
npm run competition -- start
npm run competition -- status
npm run competition -- credentials
```

Open **http://127.0.0.1:3104** on **that same laptop**. Start/status must report all three role logins verified. Use the credentials printed on that laptop. A dated fixture, unknown fixture or source mismatch must be reviewed; do not delete journals or overwrite configuration to silence the refusal. `credentials` displays sign-ins in the terminal; it does not email them.

## Fresh Windows setup — only when no local school stack exists

These steps assemble the existing guarded tools; they are not a newly tested installer. Use an adult/technical operator. Windows and Node 22.13–22.x (M6 tested 22.18.0), Git and Docker Desktop's working Linux engine are prerequisites. Mac/Linux are not certified by the Windows process/speech workflow; do not pretend the following PowerShell instructions apply unchanged.

Run one block at a time and stop on any error. Do not run against an existing school checkout/database, even if it contains only samples.

1. Check Docker privately. If `supabase_db_Schovera` already exists, **stop this fresh procedure** and inspect the existing setup without resetting/deleting it:

   ```powershell
   node --version
   docker info --format '{{.ServerVersion}}'
   if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable; stop.' }
   $existingLocalDb = @(docker ps -a --filter name=supabase_db_Schovera --format '{{.Names}}')
   if ($LASTEXITCODE -ne 0) { throw 'Docker inspection failed; stop.' }
   if ($existingLocalDb.Count -gt 0) { throw 'A local school database already exists; preserve and inspect it instead.' }
   ```

2. Create a separate fresh checkout at the exact QA path expected by the current guarded workflow. An existing directory is preserved, not replaced:

   ```powershell
   $laptopQa = Join-Path $env:TEMP 'schovera-qa-41c404875fbe43209c457a7763419c3e'
   if (Test-Path -LiteralPath $laptopQa) { throw 'QA directory exists; inspect and preserve it first.' }
   git clone --branch main --single-branch https://github.com/OmiVibes/Schovera.git $laptopQa
   if ($LASTEXITCODE -ne 0) { throw 'Clone failed; stop.' }
   Set-Location -LiteralPath $laptopQa
   npm ci --no-audit --no-fund
   if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; stop.' }
   ```

   Do not copy Om's `.env.local`, local database, `.local/` directory, keys, account files or `node_modules`. This new clone must have no private environment file.

3. Prepare a loopback-only Docker network. Reuse a named network only if its binding option is already correct; do not change an unknown network:

   ```powershell
   $networkNames = docker network ls --format '{{.Name}}'
   if ($networkNames -notcontains 'schovera-local') {
     docker network create --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' schovera-local
     if ($LASTEXITCODE -ne 0) { throw 'Network creation failed; stop.' }
   }
   $networkOptions = docker network inspect schovera-local --format '{{json .Options}}' | ConvertFrom-Json
   if ($networkOptions.'com.docker.network.bridge.host_binding_ipv4' -ne '127.0.0.1') {
     throw 'Existing network is not the required loopback setup; preserve it and stop.'
   }
   npx --no-install supabase start --network-id schovera-local
   if ($LASTEXITCODE -ne 0) { throw 'Local stack/migration startup failed; stop without reset.' }
   ```

   Supabase may display local keys: keep the terminal private. Initial startup applies repository migrations to this new local database; SQL seeding is disabled in the current configuration. Do not use `db reset`, `db push`, `link`, hosted credentials or blanket seed commands. The current M6 workflow expects 48 reviewed migrations; its startup refuses a mismatch. A fresh migration error is a blocker to investigate, not permission to drop tables or skip migration files.

4. Generate **this laptop's** ignored local configuration and synthetic issuer, then start:

   ```powershell
   node scripts/configure-local-supabase-env.mjs
   if ($LASTEXITCODE -ne 0) { throw 'Local configuration failed; do not overwrite files.' }
   node scripts/init-rfid-capability-key.mjs
   if ($LASTEXITCODE -ne 0) { throw 'Local issuer preparation failed; stop.' }
   npm run competition -- start
   if ($LASTEXITCODE -ne 0) { throw 'Competition startup failed; inspect the stated guard.' }
   npm run competition -- status
   npm run competition -- credentials
   ```

   The generator refuses existing files and gets credentials from that local Supabase programmatically. The issuer command creates a private local key and displays only its public key. Do not share or commit private output/configuration. The generated role passwords come from `competition -- credentials`, **not** a service-role key or a seed-password setting.

5. Verify Teacher, Parent and Principal through the actual browser sign-in form, then open their respective home pages. Sign out between roles or use separate browser profiles. A visible sign-in page/HTTP 200 alone does not prove accounts exist. Root `/` can display the authenticated home; automatic redirection to `/<role>/home` is not required. Test the explicit role route as well. Use the [adult checklist](ADULT_REHEARSAL_CHECKLIST.md) only after these checks pass.

On later runs, start Docker and use `competition -- start/status/credentials` again. Do not regenerate an existing environment/key pair or create more fixtures just to restart. `stop` retains the fixture; explicit `clean` can remove its accounts/progress and must not be used casually. Never clean an unfamiliar fixture. For a fresh day, follow the ownership/pending-work checks in the [technical checklist](PRESENTATION_CHECKLIST.md).

## If both people need exactly the same accounts and live data

Independent local installations will not provide that. It requires a separately reviewed shared hosted environment with accounts created there. No shared deployment is currently active or authorized by these instructions. Do not expose the local server, database or Ollama through a public tunnel as a shortcut. A GitHub repository URL is source code, not the running school website.

If startup/sign-in still fails, share only OS, exact browser URL, command name and sanitized error text. Never send passwords, tokens, `.env` contents or full Supabase status output.
