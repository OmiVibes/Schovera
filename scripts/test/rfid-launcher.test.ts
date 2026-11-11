import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const names = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'];
const sentinel = 'harmless-aud04-private-sentinel';
function run(options: { extra?: Record<string, string>; file?: string; devExtra?: string; url?: string; keypair?: boolean; args?: string[] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'schovera-rfid-launcher-'));
  try {
    mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules/next/dist/bin'), { recursive: true });
    for (const file of ['scripts/dev-rfid-local.mjs', 'scripts/lib/local-test-env.mjs']) copyFileSync(path.resolve(file), path.join(root, file));
    const url = options.url ?? 'http://127.0.0.1:54321';
    const publicEnv = `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-local-public\n`;
    writeFileSync(path.join(root, '.env.development.local'), publicEnv + (options.devExtra ?? ''));
    writeFileSync(path.join(root, '.env.test.local'), publicEnv + `SCHOVERA_TEST_MODE=local\nSUPABASE_SERVICE_ROLE_KEY=synthetic-local-service\nOPENAI_API_KEY=${sentinel}\n`);
    if (options.file) writeFileSync(path.join(root, options.file), `UNRELATED=${sentinel}\n`);
    if (options.keypair) {
      mkdirSync(path.join(root, '.local/schovera-rfid-gateway'), { recursive: true });
      writeFileSync(path.join(root, '.local/schovera-rfid-gateway/capability-issuer.private.pem'), 'synthetic-file-key');
      writeFileSync(path.join(root, '.local/schovera-rfid-gateway/capability-issuer.key-id'), 'synthetic-file-id');
    }
    const env = Object.fromEntries(names.filter(n => process.env[n]).map(n => [n, process.env[n]]));
    // Inspect the actual spawned child's environment, never dumping its values.
    writeFileSync(path.join(root, 'node_modules/next/dist/bin/next'), `
      const assert=require('node:assert/strict');
      const allowed=${JSON.stringify(names)};
      const fixed={NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-local-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-local-service',SCHOVERA_TEST_MODE:'local',SCHOVERA_RFID_API_MODE:'local',SCHOVERA_FALLBACK_MODE:'local',NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE:'local',NEXT_PUBLIC_SCHOVERA_DEMO:'true',NEXT_TELEMETRY_DISABLED:'1',TEACHER_AI_PROVIDER:'ollama',OLLAMA_BASE_URL:'http://127.0.0.1:11434'};
      for(const [key,value]of Object.entries(fixed))assert.equal(process.env[key],value);
      for(const [key,value]of Object.entries(${JSON.stringify(env)}))assert.equal(process.env[key],value);
      assert.ok(process.env.SystemRoot || process.env.PATH || process.env.Path);
      for(const key of ['OPENAI_API_KEY','GEMINI_API_KEY','AWS_SECRET_ACCESS_KEY','NEXT_PUBLIC_UNRELATED','NODE_OPTIONS','NODE_PATH','HTTPS_PROXY','OLLAMA_MODEL','SCHOVERA_ACCOUNT_MANAGEMENT_MODE'])assert.equal(process.env[key],undefined);
      assert.equal(process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY,${options.keypair ? "'synthetic-file-key'" : 'undefined'});
      assert.equal(process.env.SCHOVERA_RFID_CAPABILITY_KEY_ID,${options.keypair ? "'synthetic-file-id'" : 'undefined'});
      assert.deepEqual(process.argv.slice(2),['dev','--hostname','127.0.0.1',${(options.args ?? ['--port', '3104']).map(a => JSON.stringify(a)).join(',')}]);
      console.log('CHILD_ALLOWLIST_VERIFIED');
    `);
    const result = spawnSync(process.execPath, ['scripts/dev-rfid-local.mjs', ...(options.args ?? ['--port', '3104'])], {
      cwd: root, env: { ...env, ...options.extra, NODE_ENV: 'test' }, encoding: 'utf8', windowsHide: true, timeout: 15000,
    });
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(sentinel);
    return { code: result.status, output };
  } finally {
    // Only the exact mkdtemp-owned directory is removed; never a caller path.
    expect(path.dirname(root)).toBe(tmpdir());
    expect(path.basename(root)).toMatch(/^schovera-rfid-launcher-/);
    rmSync(root, { recursive: true, force: true });
  }
}

it('starts with required local values and Windows OS paths; no shell credentials required', () => {
  const result = run(); expect(result.code).toBe(0); expect(result.output).toContain('CHILD_ALLOWLIST_VERIFIED');
});
it('excludes synthetic shell credentials, public injection and runtime overrides from the actual child', () => {
  const result = run({ keypair: true, extra: {
    OPENAI_API_KEY: sentinel, GEMINI_API_KEY: sentinel, AWS_SECRET_ACCESS_KEY: sentinel,
    NEXT_PUBLIC_UNRELATED: sentinel, HTTPS_PROXY: sentinel, NODE_OPTIONS: '--no-warnings',
    NODE_PATH: sentinel, OLLAMA_MODEL: sentinel, TEACHER_AI_PROVIDER: 'openai',
    OLLAMA_BASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: sentinel,
    SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY: sentinel, SCHOVERA_RFID_CAPABILITY_KEY_ID: sentinel,
    SCHOVERA_ACCOUNT_MANAGEMENT_MODE: 'local',
  } }); expect(result.code).toBe(0); expect(result.output).toContain('CHILD_ALLOWLIST_VERIFIED');
});
it.each(['.env.local', '.env.production', '.env.development'])('refuses unexpected %s without exposing contents', file => {
  const result = run({ file }); expect(result.code).not.toBe(0); expect(result.output).not.toContain('CHILD_ALLOWLIST_VERIFIED');
});
it('refuses extra development-file credentials that Next would discover', () => {
  const result = run({ devExtra: `OPENAI_API_KEY=${sentinel}\n` }); expect(result.code).not.toBe(0); expect(result.output).toContain('only the two local public');
});
it('retains the external Supabase refusal', () => {
  const result = run({ url: 'https://example.invalid' }); expect(result.code).not.toBe(0); expect(result.output).toContain('loopback');
});
it.each([['--hostname', '0.0.0.0'], ['--port', '99999']])('refuses non-local startup arguments %j', (...args) => {
  const result = run({ args }); expect(result.code).not.toBe(0); expect(result.output).toContain('Only --port');
});
