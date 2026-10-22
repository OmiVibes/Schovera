import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  await access(new URL('../.env.local', import.meta.url));
  throw new Error('Local development requires an isolated checkout without .env.local; private file was not opened.');
} catch(error) {
  if(error?.code !== 'ENOENT')throw error;
}

const localEnvPath = fileURLToPath(new URL('../.env.development.local', import.meta.url));
let localEnvText;
try {
  localEnvText = await readFile(localEnvPath, 'utf8');
} catch {
  throw new Error('Local Supabase env is missing. Start local Supabase and run scripts/configure-local-supabase-env.mjs first.');
}

const localEnv = new Map();
for (const line of localEnvText.split(/\r?\n/)) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) localEnv.set(match[1], match[2].trim());
}

let url;
try {
  url = new URL(localEnv.get('NEXT_PUBLIC_SUPABASE_URL'));
} catch {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL in .env.development.local must be a loopback HTTP URL.');
}
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())) {
  throw new Error('Refusing to start local development against a hosted Supabase URL.');
}
const publishableKey = localEnv.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!publishableKey) throw new Error('Local Supabase publishable key is missing from .env.development.local.');

// Do not allow Next to inherit the hosted service-role key from .env.local.
process.env.NEXT_PUBLIC_SUPABASE_URL = url.toString().replace(/\/$/, '');
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const child = spawn(process.execPath, [nextCli, 'dev', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(`Could not start local Next.js: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
