import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('./windows-readonly.ps1', import.meta.url));
const errorCodes = new Set(['identity_mismatch', 'monitor_may_be_open', 'port_busy_denied_or_unavailable',
  'serial_disconnected', 'serial_read_failed', 'serial_backpressure', 'preflight_refused', 'worker_failed']);
const exactKeys = (object, keys) => Object.keys(object).sort().join(',') === keys.sort().join(',');
export function validateReadOnlyOptions(value) {
  if (!value || !exactKeys(value, ['port', 'pnpId', 'seconds', 'dtr', 'resetRiskAccepted', 'monitorClosedConfirmed'])
    || typeof value.port !== 'string' || !/^COM[1-9][0-9]{0,4}$/.test(value.port)
    || typeof value.pnpId !== 'string' || value.pnpId.length > 256 || !/^(USB|FTDIBUS)\\[A-Za-z0-9_&+\\.-]+$/.test(value.pnpId)
    || !Number.isInteger(value.seconds) || value.seconds < 1 || value.seconds > 30
    || !['on', 'off'].includes(value.dtr) || value.resetRiskAccepted !== true || value.monitorClosedConfirmed !== true)
    throw Error('explicit_readonly_selection_and_reset_monitor_confirmation_required');
  return Object.freeze({ ...value });
}
function launch(args) {
  if (process.platform !== 'win32') throw Error('windows_readonly_capture_only');
  const names = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'];
  const env = Object.fromEntries(names.filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const executable = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  return spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', worker, ...args],
    { env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** This transport exposes start/close/forceKill only. There is deliberately no write(). */
export class ReadOnlyWindowsTransport extends EventEmitter {
  constructor(options, { spawnWorker = launch } = {}) {
    super(); this.options = validateReadOnlyOptions(options); this.spawnWorker = spawnWorker;
    this.kind = 'windows_serial_readonly'; this.started = false; this.exited = false; this.closing = false; this.opened = false; this.workerConfirmed = false;
    this.exitPromise = new Promise(resolve => { this.resolveExit = resolve; });
  }
  start() {
    if (this.started || this.closing) throw Error('readonly_transport_already_started_or_closed');
    this.started = true;
    const o = this.options;
    try {
      this.child = this.spawnWorker(['-Port', o.port, '-ConfirmPnpId', o.pnpId, '-Seconds', String(o.seconds),
        '-Dtr', o.dtr, '-ConfirmMonitorClosed', '-AcknowledgeResetRisk']);
    } catch { this.exited = true; this.resolveExit({ exited: true, workerConfirmed: false }); this.emit('failure', 'worker_start_failed'); return; }
    let buffer = ''; const decoder = new StringDecoder('utf8');
    this.child.stdout.on('data', chunk => {
      for (const ch of decoder.write(chunk)) {
        if (ch === '\n') { const line = buffer.trim(); buffer = ''; if (line) this.record(line); }
        else if (buffer.length >= 4096) { buffer = ''; this.fail('worker_protocol_refused'); return; }
        else buffer += ch;
      }
    });
    this.child.stderr.on('data', () => {}); // Never relay native exceptions, paths or input.
    this.child.on('error', () => this.fail('worker_start_failed'));
    this.child.stdin.on('error', () => { if (!this.closing) this.fail('worker_control_failed'); });
    this.child.on('close', code => {
      this.exited = true; this.opened = false;
      this.resolveExit({ exited: true, workerConfirmed: this.workerConfirmed });
      this.emit('exit', { code, workerConfirmed: this.workerConfirmed });
    });
  }
  record(text) {
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
      if (value.type === 'opened' && exactKeys(value, ['type', 'port', 'baud', 'dtr', 'rts', 'handshake'])
        && !this.opened && !this.closing && value.port === this.options.port && value.baud === 115200
        && value.dtr === this.options.dtr && value.rts === 'off' && value.handshake === 'none') {
        this.opened = true; this.emit('opened'); return;
      }
      if (value.type === 'bytes' && exactKeys(value, ['type', 'data']) && this.opened && !this.closing
        && typeof value.data === 'string' && value.data.length <= 344 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) {
        const bytes = Buffer.from(value.data, 'base64');
        if (!bytes.length || bytes.length > 256 || bytes.toString('base64') !== value.data) throw Error();
        this.emit('bytes', bytes); return;
      }
      if (value.type === 'closed' && exactKeys(value, ['type', 'reason'])
        && ['deadline', 'stop_requested', 'stdin_closed', 'disconnect', 'failure'].includes(value.reason)) {
        this.workerConfirmed = true; this.opened = false; this.emit('closed', value.reason); return;
      }
      if (value.type === 'error' && exactKeys(value, ['type', 'code']) && errorCodes.has(value.code)) { this.emit('failure', value.code); return; }
      if (this.closing && value.type === 'bytes') return; // Discard data after the observation window.
      throw Error();
    } catch { this.fail('worker_protocol_refused'); }
  }
  fail(code) { if (!this.exited) { this.emit('failure', code); this.forceKill(); } }
  forceKill() {
    this.closing = true;
    if (this.child && !this.exited) { try { this.child.kill(); } catch { /* Closure is reported, never assumed. */ } }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    if (!this.child || this.exited) return Promise.resolve({ exited: true, workerConfirmed: this.workerConfirmed });
    // CLOSE goes only to the worker's stdin pipe. The worker never forwards it to Serial.
    try { this.child.stdin.end('CLOSE\n'); } catch { this.forceKill(); }
    this.closePromise = (async () => {
      let killTimer, limitTimer;
      const limit = new Promise(resolve => { limitTimer = setTimeout(() => resolve({ exited: false, workerConfirmed: false }), 450); });
      killTimer = setTimeout(() => this.forceKill(), 200);
      try { return await Promise.race([this.exitPromise, limit]); }
      finally {
        clearTimeout(killTimer); clearTimeout(limitTimer);
        if (!this.exited) {
          this.forceKill(); this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy(); this.child.unref?.();
        }
      }
    })();
    return this.closePromise;
  }
}
