import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostedBuildFixture, validateHostedDemoEnvironment } from '../src/lib/demo-deployment-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempPrefix = 'schovera-build-';
const hostedPreflight = process.argv.slice(2).includes('--hosted-demo');
if (process.argv.slice(2).some(arg => arg !== '--hosted-demo')) throw new Error('Unsupported isolated build option');
const publicUrl = hostedPreflight ? hostedBuildFixture.NEXT_PUBLIC_SUPABASE_URL : 'http://127.0.0.1:54321';
const publicKey = hostedPreflight ? hostedBuildFixture.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : 'sb_publishable_local_build_only_not_a_credential';
const secretSentinels = {
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic_service_role_build_leak_sentinel',
  OPENAI_API_KEY: 'synthetic_ai_build_leak_sentinel',
  SCHOVERA_BUILD_SECRET_SENTINEL: 'synthetic_private_env_build_leak_sentinel',
};
const envFileName = /^\.env(?:\.|$)/i;
const blockedExtensions = new Set(['.db', '.sqlite', '.sqlite3', '.pem', '.key', '.p12', '.pfx', '.xlsx', '.xls', '.csv']);
const blockedDirectories = new Set(['.git', '.local', '.next', '.supabase', '.vercel', 'coverage', 'node_modules', 'playwright-report', 'review', 'storage', 'test-results', 'uploads']);
const blockedFiles = new Set(['.npmrc', '.netrc', '.pypirc', '.yarnrc', 'credentials.json']);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout ?? '';
}

function shouldCopy(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => blockedDirectories.has(segment.toLowerCase()))) return false;
  if (segments.some((segment) => blockedFiles.has(segment.toLowerCase()))) return false;
  if (segments.some((segment) => envFileName.test(segment))) return false;
  if (segments.some((segment) => blockedExtensions.has(path.posix.extname(segment).toLowerCase()))) return false;
  if (segments.some((segment) => /^local-dev\.(?:err|out)$/i.test(segment))) return false;
  return true;
}

function minimalEnvironment({ npm = false, tempPath } = {}) {
  const allowedNames = [
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC',
    'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'TEMP', 'TMP',
  ];
  const env = {};
  for (const name of allowedNames) if (process.env[name]) env[name] = process.env[name];
  if (tempPath) {
    env.TEMP = tempPath;
    env.TMP = tempPath;
  }
  env.NODE_ENV = 'production';
  env.NEXT_TELEMETRY_DISABLED = '1';
  env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publicKey;
  for (const [name, value] of Object.entries(secretSentinels)) env[name] = value;
  if (hostedPreflight) {
    Object.assign(env, hostedBuildFixture, { SUPABASE_SERVICE_ROLE_KEY: '', OPENAI_API_KEY: '' });
    validateHostedDemoEnvironment(env);
  }
  if (npm) {
    if (!process.env.npm_execpath || !path.isAbsolute(process.env.npm_execpath)) {
      throw new Error('Run with npm run build:isolated so the lockfile installer can be located safely.');
    }
    env.npm_config_userconfig = path.join(os.tmpdir(), 'schovera-build-no-user-npmrc');
    env.npm_config_globalconfig = path.join(os.tmpdir(), 'schovera-build-no-global-npmrc');
    env.npm_config_cache = process.env.npm_config_cache
      || path.join(process.env.LOCALAPPDATA || os.homedir(), 'npm-cache');
  }
  return env;
}

async function startBuildEgressProxy() {
  const observedHosts = new Set();
  const allowedHosts = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
  const server = createServer((_request, response) => {
    response.writeHead(403);
    response.end();
  });
  server.on('connect', (request, clientSocket, head) => {
    const [host, rawPort] = String(request.url ?? '').split(':');
    const port = Number(rawPort);
    if (!allowedHosts.has(host?.toLowerCase()) || port !== 443) {
      console.error(`Blocked non-allowlisted build egress host: ${host || '(invalid)'}`);
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    observedHosts.add(host.toLowerCase());
    const upstream = net.connect({ host, port }, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    observedHosts,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function runAsync(command, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function ensureOnlyGeneratedEnvironmentFile(snapshotRoot) {
  const files = [];
  async function findEnvironmentFiles(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (envFileName.test(entry.name)) files.push(name);
      if (entry.isDirectory()) await findEnvironmentFiles(path.join(directory, entry.name), name);
    }
  }
  await findEnvironmentFiles(snapshotRoot);
  if (files.length !== 1 || files[0] !== '.env.production') {
    throw new Error(`Unexpected environment file set in isolated snapshot: ${files.join(', ') || '(none)'}`);
  }
  const contents = await readFile(path.join(snapshotRoot, '.env.production'), 'utf8');
  if (!contents.includes(publicUrl) || !contents.includes(publicKey)
      || (!hostedPreflight && /https:\/\/[^\s"']+\.supabase\.co/i.test(contents))) {
    throw new Error('Generated build environment failed the local-only Supabase check.');
  }
}

async function scanForSecretSentinels(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanForSecretSentinels(fullPath);
    } else if (entry.isFile()) {
      const bytes = await readFile(fullPath);
      for (const [name, sentinel] of Object.entries(secretSentinels)) {
        if (bytes.includes(Buffer.from(sentinel))) throw new Error(`Private environment sentinel found in build output (${name}).`);
      }
      if (bytes.includes(Buffer.from('service_role_build_leak_sentinel'))
          || bytes.includes(Buffer.from('ai_build_leak_sentinel'))
          || bytes.includes(Buffer.from('private_env_build_leak_sentinel'))) {
        throw new Error('A private environment sentinel fragment was found in build output.');
      }
    }
  }
}

async function main() {
  const trackedChanges = run('git', ['status', '--porcelain=v1', '--untracked-files=no']).trim();
  if (trackedChanges) throw new Error('Commit or resolve tracked changes before building; the snapshot is always made from committed files.');
  const commit = run('git', ['rev-parse', 'HEAD']).trim();
  const trackedFiles = run('git', ['ls-files', '-z']).split('\0').filter(Boolean);
  if (!trackedFiles.includes('package-lock.json') || !trackedFiles.includes('package.json')) {
    throw new Error('The committed npm manifest and lockfile are required.');
  }

  const snapshotRoot = await mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedSnapshot = path.resolve(snapshotRoot);
  if (!resolvedSnapshot.startsWith(`${resolvedTemp}${path.sep}`) || !path.basename(resolvedSnapshot).startsWith(tempPrefix)) {
    throw new Error('Refusing to use a temporary build path outside the generated isolated directory.');
  }
  let succeeded = false;
  let egressProxy;
  try {
    const privateTemp = path.join(snapshotRoot, '.tmp');
    await mkdir(privateTemp);
    for (const relativePath of trackedFiles) {
      if (!shouldCopy(relativePath)) continue;
      const sourcePath = path.join(repositoryRoot, ...relativePath.split('/'));
      const destinationPath = path.join(snapshotRoot, ...relativePath.split('/'));
      const info = await lstat(sourcePath);
      if (!info.isFile()) throw new Error(`Refusing non-regular tracked build input: ${relativePath}`);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath);
    }

    const envText = [
      `NEXT_PUBLIC_SUPABASE_URL=${publicUrl}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
      'SUPABASE_SERVICE_ROLE_KEY=',
      'OPENAI_API_KEY=',
      ...(hostedPreflight ? Object.entries(hostedBuildFixture).filter(([name]) => !name.startsWith('NEXT_PUBLIC_SUPABASE_')).map(([name,value]) => `${name}=${value}`) : []),
      '',
    ].join('\n');
    await writeFile(path.join(snapshotRoot, '.env.production'), envText, { flag: 'wx' });
    const npmConfigPath = path.join(snapshotRoot, '.npmrc');
    await writeFile(npmConfigPath, 'registry=https://registry.npmjs.org/\noffline=true\n', { flag: 'wx' });
    const npmUserConfigPath = path.join(snapshotRoot, 'npm-user.npmrc');
    await writeFile(npmUserConfigPath, 'registry=https://registry.npmjs.org/\noffline=true\n', { flag: 'wx' });
    const npmGlobalConfigPath = path.join(snapshotRoot, 'npm-global.npmrc');
    await writeFile(npmGlobalConfigPath, 'registry=https://registry.npmjs.org/\noffline=true\n', { flag: 'wx' });
    await ensureOnlyGeneratedEnvironmentFile(snapshotRoot);

    console.log(`Isolated snapshot commit: ${commit}`);
    console.log('Environment files: generated .env.production only; private and developer files excluded.');
    console.log('Installing exact lockfile dependencies offline inside the isolated snapshot...');
    const npmCli = process.env.npm_execpath;
    const npmEnv = minimalEnvironment({ npm: true, tempPath: privateTemp });
    npmEnv.NODE_ENV = 'development';
    npmEnv.npm_config_userconfig = npmUserConfigPath;
    npmEnv.npm_config_globalconfig = npmGlobalConfigPath;
    npmEnv.HTTPS_PROXY = 'http://127.0.0.1:9';
    npmEnv.https_proxy = npmEnv.HTTPS_PROXY;
    npmEnv.HTTP_PROXY = npmEnv.HTTPS_PROXY;
    npmEnv.http_proxy = npmEnv.HTTPS_PROXY;
    run(process.execPath, [npmCli, 'ci', '--offline', '--no-audit', '--no-fund'], {
      cwd: snapshotRoot,
      env: npmEnv,
      stdio: 'inherit',
    });

    console.log('Running Next.js production build with a controlled environment...');
    const buildEnv = minimalEnvironment({ tempPath: privateTemp });
    egressProxy = await startBuildEgressProxy();
    buildEnv.HTTPS_PROXY = egressProxy.url;
    buildEnv.https_proxy = egressProxy.url;
    buildEnv.HTTP_PROXY = egressProxy.url;
    buildEnv.http_proxy = egressProxy.url;
    const buildResult = await runAsync(process.execPath, [path.join(snapshotRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
      cwd: snapshotRoot,
      env: buildEnv,
    });
    await egressProxy.close();
    const observedHosts = [...egressProxy.observedHosts].sort();
    egressProxy = undefined;
    const combinedOutput = `${buildResult.stdout ?? ''}${buildResult.stderr ?? ''}`;
    const redactedOutput = Object.values(secretSentinels).reduce((output, secret) => output.split(secret).join('[REDACTED]'), combinedOutput);
    if (redactedOutput) process.stdout.write(redactedOutput);
    if (buildResult.code !== 0) throw new Error(`Next.js build failed with exit code ${buildResult.code ?? buildResult.signal ?? 'unknown'}.`);
    if (/Environments?:[^\r\n]*\.env\.local/i.test(combinedOutput)) {
      throw new Error('Next.js reported loading .env.local in the isolated build.');
    }

    await ensureOnlyGeneratedEnvironmentFile(snapshotRoot);
    const manifestPath = path.join(snapshotRoot, '.next', 'server', 'app-paths-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const builtRoutes = Object.keys(manifest);
    const expectedRoutes = ['/page', '/[role]/page', '/[role]/[section]/page', '/api/device/v1/events/route',
      '/api/device/v2/capability-keys/route', '/api/device/v2/capabilities/route', '/api/device/v2/events/route', '/api/teacher-ai/route', '/api/fallback-simulator/route'];
    const missingRoutes = expectedRoutes.filter((route) => !builtRoutes.includes(route));
    if (missingRoutes.length) throw new Error(`Expected application routes missing from build: ${missingRoutes.join(', ')}`);
    await scanForSecretSentinels(path.join(snapshotRoot, '.next'));
    console.log(`Expected routes verified: ${expectedRoutes.join(', ')}`);
    console.log('Synthetic private-environment sentinels absent from all build output.');
    console.log(`Allowlisted build egress hosts observed: ${observedHosts.join(', ') || '(none)'}. Other requests through the build proxy are denied.`);
    console.log(hostedPreflight ? 'Hosted preflight used a fixed SYNTHETIC project fixture, not live/approved cloud credentials. No deployment is authorized.' : 'The isolated build configures only loopback Supabase; it does not target Supabase or Vercel production.');
    console.log('Isolated production build passed.');
    succeeded = true;
  } finally {
    if (egressProxy) await egressProxy.close();
    if (!resolvedSnapshot.startsWith(`${resolvedTemp}${path.sep}`) || !path.basename(resolvedSnapshot).startsWith(tempPrefix)) {
      throw new Error('Temporary cleanup target failed path validation; it was not removed.');
    }
    await rm(resolvedSnapshot, { recursive: true, force: true });
    console.log(`Isolated temporary snapshot ${succeeded ? 'cleaned' : 'removed after failure'}.`);
  }
}

main().catch((error) => {
  const message = String(error?.message ?? 'unknown isolated build failure');
  console.error(`Isolated build failed: ${message.replace(/(?:sb_publishable_local_build_only_not_a_credential|synthetic_[a-z_]+_build_leak_sentinel)/g, '[REDACTED]')}`);
  process.exitCode = 1;
});
