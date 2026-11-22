#!/usr/bin/env node
// Read-only destination-laptop check. It never starts services, installs
// dependencies, reads environment files, opens serial, or writes demo data.
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { origin } from './guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SUPABASE_HEALTH = 'http://127.0.0.1:54321/auth/v1/health';
export const APP_HEALTH = `${origin}/`;

function run(command, args, timeout = 5000) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function tcpReachable(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function httpStatus(url) {
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    return response.status;
  } catch {
    return null;
  }
}

export function evaluatePortableHost(snapshot) {
  const checks = [];
  const add = (name, state, detail) => checks.push({ name, state, detail });
  const node = /^v?(\d+)\.(\d+)\.(\d+)/.exec(snapshot.nodeVersion ?? '');
  const nodeOk = !!node && Number(node[1]) === 22 && Number(node[2]) >= 18;
  const win11 = /Windows 11/i.test(snapshot.windowsName ?? '') && Number(snapshot.windowsBuild) >= 22631;
  const win10 = /Windows 10/i.test(snapshot.windowsName ?? '');
  const windowsState = snapshot.platform !== 'win32' ? 'BLOCKED' : win11 ? 'PASS' : win10 ? 'REVIEW' : 'BLOCKED';
  add('Windows host', windowsState, snapshot.windowsName || (snapshot.platform === 'win32' ? `Windows build ${snapshot.windowsBuild || 'not identified'}` : 'Windows x64 is required by this prepared demo path'));
  add('Processor architecture', snapshot.arch === 'x64' ? 'PASS' : 'BLOCKED', snapshot.arch ?? 'unknown');
  add('Node.js', nodeOk ? 'PASS' : 'BLOCKED', `${snapshot.nodeVersion ?? 'not installed'} (competition target: >=22.18 <23; package engine alone is broader)`);
  const ramGiB = Number(snapshot.ramBytes) / (1024 ** 3);
  const memoryState = Number(snapshot.ramBytes) >= 8_000_000_000 ? (ramGiB >= 16 ? 'PASS' : 'REVIEW') : 'BLOCKED';
  add('System memory', memoryState,
    `${Number.isFinite(ramGiB) ? ramGiB.toFixed(1) : 'unknown'} GiB; Docker Desktop lists 8 GB system RAM, 16 GiB recommended for rehearsal headroom`);
  const virtualizationState = snapshot.virtualizationReady === true ? 'PASS' : snapshot.virtualizationReady === false && !snapshot.dockerReady ? 'BLOCKED' : 'REVIEW';
  add('Virtualization support', virtualizationState,
    snapshot.virtualizationReady === true ? 'firmware virtualization and SLAT reported available' : snapshot.virtualizationReady === false ? 'Windows reports a missing virtualization feature; verify local Docker Desktop/WSL2 support' : 'could not verify; Docker Desktop setup must confirm WSL2/Hyper-V support');
  add('Docker engine', snapshot.dockerReady ? 'PASS' : 'BLOCKED', snapshot.dockerVersion ? `available (${snapshot.dockerVersion})` : 'Docker Desktop/engine unavailable');
  add('Project dependencies', snapshot.dependenciesReady ? 'PASS' : 'BLOCKED', snapshot.dependenciesReady ? 'lockfile and local Next/Supabase executables found' : 'run reviewed offline-capable preparation before launch');
  add('Local PostgreSQL', snapshot.databaseReachable ? 'PASS' : 'BLOCKED', snapshot.databaseReachable ? 'TCP port 54322 accepts a local connection' : 'not reachable on 127.0.0.1:54322');
  add('Local Supabase Auth', snapshot.supabaseStatus === 200 ? 'PASS' : 'BLOCKED', snapshot.supabaseStatus === 200 ? 'loopback health returned HTTP 200' : 'not healthy on 127.0.0.1:54321');
  add('Schovera website', snapshot.appStatus === 200 ? 'PASS' : 'BLOCKED', snapshot.appStatus === 200 ? 'loopback page returned HTTP 200' : 'not healthy on 127.0.0.1:3106');
  add('Raspberry Pi link', snapshot.piSshReachable ? 'PASS' : 'BLOCKED', snapshot.piSshReachable ? `SSH port reachable at ${snapshot.piHost}:22` : `SSH port not reachable at ${snapshot.piHost}:22`);
  add('RFID reader', 'NOT CHECKED', 'requires a separate read-only Pi USB identity/port-owner check; this preflight does not open serial');
  add('Attendance processing', 'NOT CHECKED', 'requires an explicitly approved fictional signed event and dashboard verification');
  const blocker = checks.some((check) => check.state === 'BLOCKED');
  const review = checks.some((check) => check.state === 'REVIEW');
  return { hostReady: !blocker && !review, checks };
}

function readWindowsDetails() {
  if (process.platform !== 'win32') return {};
  const script = "$o=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{name=$o.Caption;build=$o.BuildNumber}|ConvertTo-Json -Compress";
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const result = JSON.parse(raw.trim());
    return { windowsName: String(result.name ?? 'Windows').replace(/[\r\n\t]/g, ' ').slice(0, 100), windowsBuild: String(result.build ?? '') };
  } catch {
    return { windowsName: 'Windows (edition/build query unavailable)' };
  }
}

async function inspectHost({ piHost = '10.42.0.1' } = {}) {
  const dependencyPaths = [
    path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next'),
    path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase'),
  ];
  const dockerInfo = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  let virtualizationReady;
  if (process.platform === 'win32') {
    const ps = "$p=Get-CimInstance Win32_Processor | Select-Object -First 1; [pscustomobject]@{virtualization=$p.VirtualizationFirmwareEnabled;slat=$p.SecondLevelAddressTranslationExtensions}|ConvertTo-Json -Compress";
    try {
      const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
      virtualizationReady = result.virtualization === true && result.slat === true;
    } catch { virtualizationReady = null; }
  }
  const snapshot = {
    platform: process.platform,
    arch: os.arch(),
    nodeVersion: process.version,
    ramBytes: os.totalmem(),
    virtualizationReady,
    dockerReady: !!dockerInfo,
    dockerVersion: dockerInfo,
    dependenciesReady: existsSync(path.join(ROOT, 'package-lock.json')) && dependencyPaths.every(existsSync),
    databaseReachable: await tcpReachable('127.0.0.1', 54322),
    supabaseStatus: await httpStatus(SUPABASE_HEALTH),
    appStatus: await httpStatus(APP_HEALTH),
    piHost,
    piSshReachable: await tcpReachable(piHost, 22),
    ...readWindowsDetails(),
  };
  return evaluatePortableHost(snapshot);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let piHost = '10.42.0.1';
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--pi-host' || !args[i + 1] || args[i + 1].startsWith('--')) {
      console.error('Usage: node scripts/competition/portable-preflight.mjs [--pi-host <address>]');
      process.exitCode = 2;
      break;
    }
    piHost = args[++i];
  }
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(piHost) || piHost.includes('..')) {
    console.error('Invalid Pi host; use an IP address or DNS hostname.');
    process.exitCode = 2;
  }
  if (!process.exitCode) {
    const result = await inspectHost({ piHost });
    for (const check of result.checks) console.log(`${check.state.padEnd(12)} ${check.name}: ${check.detail}`);
    console.log(result.hostReady ? 'HOST PREFLIGHT PASS (does not certify reader or attendance acceptance)' : 'HOST PREFLIGHT NOT READY');
    if (!result.hostReady) process.exitCode = 1;
  }
}
