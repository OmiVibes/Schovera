import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const localEnvPath = fileURLToPath(new URL('../.env.development.local', import.meta.url));
let source;
try { source = await readFile(localEnvPath, 'utf8'); }
catch { throw new Error('Local build check requires .env.development.local; it never falls back to .env.local.'); }
const values = new Map();
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) values.set(match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
}
let url;
try { url = new URL(values.get('NEXT_PUBLIC_SUPABASE_URL')); }
catch { throw new Error('Local build check requires an HTTP loopback Supabase URL.'); }
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) {
  throw new Error('Refusing local build check against a hosted Supabase URL.');
}
const publishableKey = values.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!publishableKey || publishableKey.startsWith('replace-with-')) throw new Error('Local publishable key is missing.');
process.env.NEXT_PUBLIC_SUPABASE_URL = url.origin;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.OPENAI_API_KEY = '';
const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const child = spawn(process.execPath, [nextCli, 'build'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: process.env, stdio: 'inherit' });
child.on('error', (error) => { console.error(`Could not start local build check: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
