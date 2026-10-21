# Schovera — start here

**School. Home. Together.** Schovera connects Teachers, linked Parents and school Principals. The current international demonstration uses fictional records only.

## Choose your guide

- **Aarohi and the second presenter:** [student handbook](docs/SCHOVERA_INTERNATIONAL_DEMO_GUIDE_FOR_AAROHI.md).
- **Current engineering results and limitations:** [Task 32R report](docs/43_TASK_32R_INTERNATIONAL_SOFTWARE_FINALIZATION.md).
- **Local environment and build security:** [safe Supabase development](docs/25_SAFE_SUPABASE_DEVELOPMENT.md).
- **Earlier personal QA checklist:** [Task 32P](docs/41_TASK_32P_FINAL_SOFTWARE_TESTING.md). Its two-child example is historical; the presentation fixture has 20 fictional students.
- **Pilot, impact and business assumptions:** [Task 32O](docs/40_TASK_32O_PILOT_IMPACT_BUSINESS_MODEL.md).
- **Separate hosted demo proposal:** [release approval guide](docs/42_ISOLATED_ONLINE_DEMO_PREPARATION.md). No deployment is authorized.

## Safe local launch (Windows PowerShell)

Use Node 22.13–22.x and the installed Docker Desktop Linux engine. Never read, copy, move or edit the original production `.env.local`. Start local Supabase using the existing loopback Docker network:

```powershell
Set-Location 'D:\Notes\Degree\Projects\Schovera'
docker info --format '{{.ServerVersion}}'
npx supabase start --network-id schovera-local
# CLI status/start may display local keys. Do not share that output.
npm run demo:isolated:prepare
```

The preparation helper creates an owned temporary Git worktree at the committed HEAD, installs lockfile dependencies offline **inside** it, and generates ignored loopback env files and a synthetic issuer key. It refuses tracked modifications; it does not copy untracked/private data or create hosted resources. If a dependency is not cached or Docker is unavailable, it stops—do not weaken guards. If `schovera-local` does not yet exist, follow the loopback-only network instructions in the safe-development guide before starting Supabase.

Copy the exact worktree path printed by the helper. In terminal 1:

```powershell
Set-Location '<exact printed worktree path>'
# Only after checking local API/database isolation, apply reviewed pending LOCAL migrations:
npx supabase migration up --local
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3100'
$env:TEACHER_AI_PROVIDER = 'ollama'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'gemma3:1b'
$env:OPENAI_API_KEY = ''
npm run dev:simulators-local -- --port 3100
```

In terminal 2, use the **same** worktree:

```powershell
Set-Location '<same exact printed worktree path>'
$env:SCHOVERA_TEST_URL = 'http://127.0.0.1:3100'
npm run presentation:prepare
npm run demo:credentials # Read privately. Never publish these generated passwords.
```

Open **http://127.0.0.1:3100**. Use separate browser sessions for each role. Presentation provisioning is repeat-safe after completion and refuses to overwrite an unrelated manual/partial fixture. Its manifest journals owned IDs for recovery. There are 20 fictional students, two classes and ten guardian accounts. Surnames are not proof of a biological relationship; these are fictional guardian/ward links. No real children are represented.

Stop your server with Ctrl+C. Only when finished and explicitly willing to erase this fixture's progress, run `npm run demo:clean` from that worktree. It removes only the journal-owned synthetic school/accounts. Never run a remote reset or a broad clean against shared/production data. Remove the exact owned temporary worktree only after checking the path is under your temporary directory and its journal is cleaned; preserve all pre-existing worktrees.

## Project map

| Location | Purpose |
|---|---|
| `src/app/` | Next.js routes, layout and styles; local-only device/fake-provider routes and Teacher AI |
| `src/components/` | Shared role workspace, entry panels, translations, speech controls, insights, homework editor, AI/spreadsheet UI |
| `src/lib/` | Auth client, localization, persisted-read helpers, speech/rules/security logic |
| `supabase/migrations/` | Ordered schema/security history. Do not delete or rewrite old migrations |
| `scripts/verify-*`, `*.test.*` | Active browser/database/unit regressions; inspect package scripts before running |
| `scripts/rfid-*` | Hardware-free simulator, durable SQLite gateway, attribution policy and signed local transport |
| `scripts/presentation-demo.mjs` | Owned fictional 20-student presentation provisioning |
| `docs/` | Numbered task evidence/history and active runbooks; older plans are not proof of current behavior |
| `.local/` | Ignored generated fixture journals, keys, SQLite and QA evidence; never publish secrets |

`review/`, `AGENTS.md`, `CLAUDE.md`, `local-dev.err` and `local-dev.out` are protected pre-existing developer artifacts, not deletion candidates. A filename that looks old does not prove it is unused. No historical migrations or evidence are removed in Task 32R.

## Verification

From an isolated worktree with local Supabase and a matching safe server running, `npm run verify:task32r` runs the supported regression batch and records each command result. `npm run verify:presentation` exercises the owned 20-person school, browser workflows, 88 screenshots and modeled slow-link measurements. It changes that synthetic fixture; do not run it during a presentation or on someone else's manual fixture. Run `npm run build:isolated` from a clean committed tree for production compilation; never run a raw build in the production-env checkout.

Automatic translation is not enabled: the tested small model changed the meaning of a negation, and the installed larger model lacked available memory. Use editable human drafts and Principal review. Voice is browser/OS-dependent; **AUDIO NOT VERIFIED** unless a person actually hears it. SMS/calls are simulated. Entry events are synthetic, not proof of identity, safety or classroom attendance. A separate hosted demo and real school pilot still require explicit approval.
