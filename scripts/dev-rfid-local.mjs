import { access, readFile } from 'node:fs/promises';
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
try {
  await access(new URL('.env.local', root));
  throw new Error('RFID local server refuses to start while .env.local exists because Next.js may load it. Use a disposable clean checkout without private environment files.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
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
process.env.SCHOVERA_FALLBACK_MODE = 'local';
process.env.NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE = 'local';
process.env.NEXT_PUBLIC_SCHOVERA_DEMO = 'true';
// Never inherit an arbitrary issuer key from the developer shell. V2 is enabled
// only by the explicit, ignored local keypair created by the local key command.
delete process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY;
delete process.env.SCHOVERA_RFID_CAPABILITY_KEY_ID;
try {
  const keyDirectory = new URL('../.local/schovera-rfid-gateway/', import.meta.url);
  const [privateKey, keyId] = await Promise.all([
    readFile(new URL('capability-issuer.private.pem', keyDirectory), 'utf8'),
    readFile(new URL('capability-issuer.key-id', keyDirectory), 'utf8'),
  ]);
  const cleanKeyId = keyId.trim();
  if (!cleanKeyId || !/^[A-Za-z0-9._:-]{1,128}$/.test(cleanKeyId)) throw new Error('invalid local capability key id');
  process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY = privateKey;
  process.env.SCHOVERA_RFID_CAPABILITY_KEY_ID = cleanKeyId;
} catch (error) {
  if (error?.code !== 'ENOENT') throw new Error('Local capability issuer keypair is invalid; refusing to start the RFID server.');
  console.log('Local RFID v2 capability issuer is disabled; run `npm run rfid:capability-key:init` to create a local synthetic keypair.');
}
const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const child = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)], {
  cwd: fileURLToPath(root), env: process.env, stdio: 'inherit',
});
child.on('error', (error) => { console.error(`Could not start local RFID development server: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
