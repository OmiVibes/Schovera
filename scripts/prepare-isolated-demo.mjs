// Local preparation only. No Vercel/Supabase login, link, push, reset or deployment.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(binary, args, cwd, env = process.env, quiet = false) {
  const result = spawnSync(binary, args, { cwd, env, encoding: 'utf8', windowsHide: true, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Local preparation failed; no remote action attempted. Inspect the failed command locally.');
  return result.stdout?.trim();
}
try {
  const dirty = run('git', ['diff', 'HEAD', '--name-only'], root, process.env, true);
  if (dirty) throw new Error('Commit intended tracked changes before creating an exact demo snapshot.');
  const target = mkdtempSync(path.join(tmpdir(), 'schovera-international-'));
  run('git', ['worktree', 'add', '--detach', target, 'HEAD'], root);
  if (existsSync(path.join(target, '.env.local'))) throw new Error('Unexpected private environment file; refusing preparation.');
  const env = Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA'].flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
  env.NEXT_TELEMETRY_DISABLED = '1';
  if (!process.env.npm_execpath) throw new Error('Use npm run demo:isolated:prepare');
  run(process.execPath, [process.env.npm_execpath, 'ci', '--offline', '--no-audit', '--no-fund'], target, env);
  run(process.execPath, ['scripts/configure-local-supabase-env.mjs'], target, env);
  run(process.execPath, ['scripts/init-rfid-capability-key.mjs'], target, env, true);
  console.log(`Prepared owned demo worktree: ${target}`);
  console.log('No demo database rows created yet. Start npm run dev:simulators-local there, then run npm run presentation:prepare in another terminal.');
  console.log('Use npm run demo:credentials privately. This helper never opens production .env.local and never creates hosted resources.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
