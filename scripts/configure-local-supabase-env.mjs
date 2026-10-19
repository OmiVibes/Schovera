import { execFileSync } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
let status;
try {
  status = execFileSync(process.execPath, [cliPath, 'status', '--output', 'env'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch {
  throw new Error('Could not read local Supabase status. No environment files were written.');
}

function parseStatus(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    let value = raw;
    if (raw.startsWith('"') && raw.endsWith('"')) value = JSON.parse(raw);
    else if (raw.startsWith("'") && raw.endsWith("'")) value = raw.slice(1, -1);
    values.set(match[1], value);
  }
  return values;
}

function isLoopbackHttp(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const values = parseStatus(status);
const apiUrl = values.get('API_URL');
const publishableKey = values.get('PUBLISHABLE_KEY') || values.get('ANON_KEY');
const serviceRoleKey = values.get('SERVICE_ROLE_KEY');
if (!isLoopbackHttp(apiUrl) || !publishableKey || !serviceRoleKey) {
  throw new Error('Supabase status did not provide complete loopback-only local credentials; no env files were written.');
}

const targets = [
  ['.env.development.local', [
    '# Generated from `npx supabase status`; local-only, do not commit.',
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  ].join('\n') + '\n'],
  ['.env.test.local', [
    '# Generated from `npx supabase status`; local-only, do not commit.',
    'SCHOVERA_TEST_MODE=local',
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    'SCHOVERA_TEST_URL=http://127.0.0.1:3000',
    'SCHOVERA_DEMO_PASSWORD=SchoveraLocalTest2026!',
  ].join('\n') + '\n'],
];

for (const [file] of targets) {
  try {
    await access(file);
    throw new Error(`${file} already exists; refusing to overwrite it. Move it aside manually if it is a stale local-only file.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const written = [];
try {
  for (const [file, contents] of targets) {
    await writeFile(file, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    written.push(file);
  }
} catch (error) {
  // Do not leave a half-configured pair. These files were created by this
  // invocation only, and no pre-existing user file is ever overwritten.
  await Promise.all(written.map((file) => import('node:fs/promises').then(({ unlink }) => unlink(file))));
  throw error;
}

console.log('Created .env.development.local and .env.test.local from local Supabase status; credential values were not printed.');
