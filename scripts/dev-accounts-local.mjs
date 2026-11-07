// Local privileged account-creation server; never discovers production env files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
const root = new URL('../', import.meta.url);
if (existsSync(new URL('.env.local', root)))
  throw new Error(
    'Use an isolated checkout without .env.local. File was not opened.',
  );
if (
  readdirSync(root).some(
    (name) =>
      /^\.env(?:\.|$)/.test(name) &&
      !name.endsWith('.example') &&
      !['.env.development.local', '.env.test.local'].includes(name),
  )
)
  throw new Error('Unexpected environment file; refusing to launch.');
const parse = (name) =>
  Object.fromEntries(
    readFileSync(new URL(name, root), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
const test = parse('.env.test.local'),
  app = parse('.env.development.local');
if (
  Object.keys(app).some(
    (name) =>
      ![
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      ].includes(name),
  )
)
  throw new Error(
    'Development env must contain only the two local public Supabase values.',
  );
assertLocalTestEnvironment(test);
if (
  test.NEXT_PUBLIC_SUPABASE_URL !== app.NEXT_PUBLIC_SUPABASE_URL ||
  test.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !==
    app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)
  throw new Error('Local environment files disagree.');
const names = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'LOCALAPPDATA',
  'APPDATA',
  'USERPROFILE',
];
const env = Object.fromEntries(
  names
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: app.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: test.SUPABASE_SERVICE_ROLE_KEY,
  SCHOVERA_TEST_MODE: 'local',
  SCHOVERA_ACCOUNT_MANAGEMENT_MODE: 'local',
  NEXT_TELEMETRY_DISABLED: '1',
});
const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 2 || args[0] !== '--port' || !/^\d{4,5}$/.test(args[1]))
)
  throw new Error('Only --port <number> is supported.');
const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/next/dist/bin/next', import.meta.url),
    ),
    'dev',
    '--hostname',
    '127.0.0.1',
    ...args,
  ],
  { env, cwd: fileURLToPath(root), stdio: 'inherit', windowsHide: true },
);
child.on('error', () => {
  console.error('Could not launch the account-management server.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
