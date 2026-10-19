import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (match) values.set(match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return values;
}

const root = new URL('../', import.meta.url);
let testValues;
let developmentValues;
try {
  testValues = parseEnv(await readFile(new URL('.env.test.local', root), 'utf8'));
  developmentValues = parseEnv(await readFile(new URL('.env.development.local', root), 'utf8'));
} catch {
  throw new Error('RFID local server requires both local env files; run the safe local Supabase env generator first.');
}
const testEnv = Object.fromEntries(testValues);
assertLocalTestEnvironment(testEnv);
const testUrl = new URL(testEnv.NEXT_PUBLIC_SUPABASE_URL);
const appUrl = new URL(developmentValues.get('NEXT_PUBLIC_SUPABASE_URL') ?? '');
if (appUrl.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(appUrl.hostname.toLowerCase())
  || appUrl.origin !== testUrl.origin) {
  throw new Error('RFID local server requires matching loopback Supabase URLs in the two local env files.');
}
const publishableKey = developmentValues.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!publishableKey || publishableKey !== testEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('RFID local server requires matching local publishable keys.');
}

process.env.NEXT_PUBLIC_SUPABASE_URL = appUrl.origin;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = testEnv.SUPABASE_SERVICE_ROLE_KEY;
process.env.SCHOVERA_TEST_MODE = 'local';
process.env.SCHOVERA_RFID_API_MODE = 'local';
const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const child = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)], {
  cwd: fileURLToPath(root), env: process.env, stdio: 'inherit',
});
child.on('error', (error) => { console.error(`Could not start local RFID development server: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
