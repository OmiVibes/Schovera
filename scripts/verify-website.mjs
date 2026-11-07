// Broad local regression gate. No hosted target, private-env discovery, reset or deployment.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

assertLocalTestEnvironment();
if (existsSync('.env.local')) throw new Error('Run website QA only in an isolated checkout.');
if (!process.env.npm_execpath) throw new Error('Run npm run verify:website.');
const allChecks = [
  'seed:demo', 'test:ui-copy', 'test:attendance-trend', 'test:accounts', 'test:simple-ui', 'test:workbook', 'test:rfid', 'test:gateway',
  'test:credential-attribution', 'test:entry-polling', 'test:parent-voice',
  'test:translations', 'test:fallback', 'test:attendance-insights',
  'test:release-preflight', 'test:homework-editor', 'test:hosted-demo',
  'test:online-demo', 'test:provisioner',
  'verify:attendance', 'verify:announcements', 'verify:assignments',
  'verify:corrections', 'verify:idempotency', 'verify:student-profile',
  'verify:timetable', 'verify:reliability', 'verify:phase1', 'test',
  'test:translations:db', 'test:rfid:integration', 'test:gateway:local-integration',
  'test:translations:integration', 'test:fallback:integration',
  'test:attendance-insights:integration', 'verify:accounts',
  'test:provisioner:integration', 'verify:reconnect', 'verify:role-navigation',
  'verify:accessibility-i18n', 'verify:staff-localization', 'verify:parent-voice', 'verify:simple-voice', 'verify:role-visuals',
  'verify:teacher-ai', 'verify:local-i18n-reconnect', 'verify:final-journeys',
  'verify:provisioner:browser', 'verify:simple-blue-ui', 'typecheck', 'lint',
];
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--only')) throw new Error('Use --only with comma-separated known check names, or omit it for the full gate.');
const checks = args.length ? args[1].split(',') : allChecks;
if (!checks.length || new Set(checks).size !== checks.length || checks.some(check => !allChecks.includes(check))) throw new Error('Unknown or duplicate verification check.');
const directory = `.local/website-qa/${randomUUID()}`;
mkdirSync(directory, { recursive: true });
const results = [];
for (const [index, check] of checks.entries()) {
  console.log(`Website QA ${index + 1}/${checks.length}: ${check}`);
  const start = Date.now();
  const log = `${directory}/${String(index + 1).padStart(2, '0')}-${check.replaceAll(':', '-')}.log`;
  const outcome = await new Promise(resolve => {
    const output = createWriteStream(log, { flags: 'wx', mode: 0o600 });
    const child = spawn(process.execPath, [process.env.npm_execpath, 'run', check], {
      env: process.env, windowsHide: true, stdio: ['ignore','pipe','pipe'],
    });
    let error;
    const timer = setTimeout(() => {
      error = 'ETIMEDOUT';
      if (child.pid && child.exitCode === null) {
        // Stop only this owned test's tree, including npm/browser descendants.
        if (process.platform === 'win32') {
          try { execFileSync(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* It may already have exited. */ }
        } else child.kill('SIGTERM');
      }
    }, 600000);
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.on('error', reason => { error = reason.code; });
    child.on('close', status => { clearTimeout(timer); output.end(() => resolve({ status, error })); });
  });
  results.push({ check, status: outcome.status === 0 ? 'passed' : 'failed', exit: outcome.status, error: outcome.error,
    elapsedMs: Date.now() - start, log });
  writeFileSync(`${directory}/results.json`, JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(`${check}: ${outcome.status === 0 ? 'PASSED' : 'FAILED'} (${Math.round((Date.now() - start) / 1000)}s)`);
  // A failed seed makes seeded-user browser checks misleading; stop before those.
  if (check === 'seed:demo' && outcome.status !== 0) break;
}
console.log(`Website QA report: ${directory}/results.json`);
console.log(`Completed checks: ${results.filter(result => result.status === 'passed').length}/${results.length} passed.`);
process.exitCode = results.some(result => result.status !== 'passed') || results.length !== checks.length ? 1 : 0;
