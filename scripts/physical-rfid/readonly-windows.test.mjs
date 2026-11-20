import { expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ReadOnlyWindowsTransport, validateReadOnlyOptions } from './readonly-windows.mjs';

const options = { port: 'COM11', pnpId: 'USB\\VID_1A86&PID_7523\\TEST-ONLY', seconds: 30, dtr: 'on', resetRiskAccepted: true, monitorClosedConfirmed: true };
function childFixture() {
  const child = new EventEmitter(), control = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(chunk, _, done) { control.push(chunk.toString()); done(); } });
  child.kill = vi.fn(() => { queueMicrotask(() => child.emit('close', 2)); return true; }); child.unref = vi.fn();
  const launch = vi.fn(() => child), transport = new ReadOnlyWindowsTransport(options, { spawnWorker: launch });
  const errors = [], bytes = []; transport.on('failure', e => errors.push(e)); transport.on('bytes', b => bytes.push(b));
  const emit = value => child.stdout.write(JSON.stringify(value) + '\n');
  const opened = () => emit({ type: 'opened', port: 'COM11', baud: 115200, dtr: 'on', rts: 'off', handshake: 'none' });
  return { child, control, launch, transport, emit, opened, errors, bytes };
}
afterEach(() => vi.useRealTimers());

it('does not launch in the constructor; requires exact selection/confirmations and passes fixed arguments only', async () => {
  for (const patch of [{ port: 'COM11;calc' }, { pnpId: '' }, { dtr: undefined }, { resetRiskAccepted: false }, { monitorClosedConfirmed: false }, { seconds: 31 }]) expect(() => validateReadOnlyOptions({ ...options, ...patch })).toThrow();
  const f = childFixture(); expect(f.launch).not.toHaveBeenCalled(); f.transport.start();
  expect(f.launch).toHaveBeenCalledWith(['-Port', 'COM11', '-ConfirmPnpId', options.pnpId, '-Seconds', '30', '-Dtr', 'on', '-ConfirmMonitorClosed', '-AcknowledgeResetRisk']);
  f.child.emit('close', 0); await f.transport.close();
});
it('refuses mismatched worker port/baud/DTR confirmation', async () => {
  for (const patch of [{ port: 'COM12' }, { baud: 9600 }, { dtr: 'off' }]) {
    const f = childFixture(); f.transport.start(); f.emit({ type: 'opened', port: 'COM11', baud: 115200, dtr: 'on', rts: 'off', handshake: 'none', ...patch });
    expect(f.errors).toEqual(['worker_protocol_refused']); await f.transport.close();
  }
});
it('transports fragmented private worker bytes but does not expose payload-write operations', async () => {
  const f = childFixture(); f.transport.start(); f.opened();
  const line = JSON.stringify({ type: 'bytes', data: Buffer.from('SCHOVERA_RFID_READY\n').toString('base64') }) + '\n';
  f.child.stdout.write(line.slice(0, 9)); f.child.stdout.write(line.slice(9)); expect(f.bytes[0].toString()).toBe('SCHOVERA_RFID_READY\n');
  expect(f.transport.write).toBeUndefined(); const closed = f.transport.close(); f.emit({ type: 'closed', reason: 'stop_requested' }); f.child.emit('close', 0);
  expect(await closed).toEqual({ exited: true, workerConfirmed: true }); expect(f.control).toEqual(['CLOSE\n']);
});
it('handles exact PnP/ownership refusal with sanitized codes and no fallback port', async () => {
  for (const code of ['identity_mismatch', 'port_busy_denied_or_unavailable', 'monitor_may_be_open']) {
    const f = childFixture(); f.transport.start(); f.emit({ type: 'error', code }); expect(f.errors).toEqual([code]); expect(f.bytes).toHaveLength(0);
    f.child.emit('close', 0); await f.transport.close(); expect(f.launch).toHaveBeenCalledTimes(1);
  }
});
it('rejects oversized/unknown worker records and never relays raw stderr or injected error messages', async () => {
  for (const frame of ['PRIVATE_UID_SENTINEL\n', JSON.stringify({ type: 'error', code: 'PRIVATE_UID_SENTINEL' }) + '\n', 'x'.repeat(4098) + '\n', JSON.stringify({ type: 'bytes', data: 'A'.repeat(348) }) + '\n']) {
    const f = childFixture(); f.transport.start(); f.child.stderr.write('PRIVATE_UID_SENTINEL'); f.child.stdout.write(frame);
    expect(f.errors[0]).toBe('worker_protocol_refused'); expect(JSON.stringify(f.errors)).not.toContain('PRIVATE_UID_SENTINEL'); await f.transport.close();
  }
});
it('closes once and force-terminates only its owned worker if it does not respond', async () => {
  vi.useFakeTimers(); const f = childFixture(); f.transport.start(); f.opened();
  const a = f.transport.close(), b = f.transport.close(); expect(a).toBe(b);
  await vi.advanceTimersByTimeAsync(200); expect(await a).toMatchObject({ exited: true });
  expect(f.control).toEqual(['CLOSE\n']); expect(f.child.kill).toHaveBeenCalledTimes(1);
});
it('never imports backend, database or a writable synthetic bridge in the capture code', () => {
  for (const name of ['capture-readonly.mjs', 'capture-observer.mjs', 'readonly-windows.mjs']) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    const imports = source.split('\n').filter(line => /^import /.test(line)).join('\n');
    expect(imports).not.toMatch(/supabase|sqlite|rfid-gateway|arduino-local|adapter\.mjs|school-operations/);
  }
});
it.runIf(process.platform === 'win32')('parses the actual PowerShell worker without executing it and restricts serial method calls to reads/open/cleanup', () => {
  const worker = fileURLToPath(new URL('./windows-readonly.ps1', import.meta.url)).replaceAll("'", "''");
  const script = `$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${worker}',[ref]$tokens,[ref]$errors);if($errors.Count){exit 2};$calls=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Expression.Extent.Text -match '^\\$serial(?:\\.|$)'},$true);$names=@($calls | ForEach-Object {$_.Member.Value});if(@($names | Where-Object {$_ -notin @('Open','Read','Close','Dispose')}).Count){exit 3};$names | ConvertTo-Json -Compress`;
  const env = Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const executable = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toEqual(expect.arrayContaining(['Open', 'Read', 'Close', 'Dispose']));
});
it.runIf(process.platform === 'win32')('executes only the actual pure PnP comparison helper with mocked descriptors and refuses wrong/ambiguous/missing bindings', () => {
  const worker = fileURLToPath(new URL('./windows-readonly.ps1', import.meta.url)).replaceAll("'", "''");
  const script = `$tokens=$null;$issues=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${worker}',[ref]$tokens,[ref]$issues);if($issues.Count){exit 2};$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Confirm-ReadOnlyIdentity'},$true);. ([scriptblock]::Create($fn.Extent.Text));$id='USB\\MOCK-ONLY';Confirm-ReadOnlyIdentity -ExpectedPort COM11 -ExpectedPnpId $id -AvailablePorts @('COM11') -Bindings @(@{port='COM11';pnpId=$id});$cases=@(@{ports=@('COM12');bindings=@(@{port='COM12';pnpId=$id})},@{ports=@('COM11');bindings=@(@{port='COM11';pnpId='USB\\WRONG'})},@{ports=@('COM11');bindings=@(@{port='COM11';pnpId=$id},@{port='COM11';pnpId=$id})},@{ports=@('COM11');bindings=@()});$denied=0;foreach($case in $cases){try{Confirm-ReadOnlyIdentity -ExpectedPort COM11 -ExpectedPnpId $id -AvailablePorts $case.ports -Bindings $case.bindings;exit 3}catch{if($_.Exception.Message -ne 'identity_mismatch'){exit 4};$denied++}};if($denied -ne 4){exit 5};'PASS_PURE_IDENTITY_COMPARISON_NO_PORT_ACCESS'`;
  const env = Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(0); expect(result.stdout).toContain('PASS_PURE_IDENTITY_COMPARISON_NO_PORT_ACCESS');
});
