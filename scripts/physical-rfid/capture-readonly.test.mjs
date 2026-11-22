import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { parseCaptureArgs, runReadOnlyCapture } from './capture-readonly.mjs';
import { ReadOnlyObserver } from './capture-observer.mjs';

const UID = 'FA:CE:B0:0C'; // Fictional test bytes only.
const options = { port: 'COM11', pnpId: 'USB\\VID_1A86&PID_7523\\TEST-ONLY', seconds: 30,
  dtr: 'on', resetRiskAccepted: true, monitorClosedConfirmed: true };
const scan = (at = 100, uid = UID) => `SCHOVERA_SCAN,${uid},${at}\n`;
class MockReadOnlyTransport extends EventEmitter {
  constructor() { super(); this.closed = false; this.start = vi.fn(); this.forceKill = vi.fn(() => { this.closed = true; });
    this.close = vi.fn(async () => { this.closed = true; return { exited: true, workerConfirmed: true }; }); }
}
function running({ transport = new MockReadOnlyTransport(), ...extra } = {}) {
  const reports = [], signals = new EventEmitter();
  const done = runReadOnlyCapture(options, { createTransport: () => transport, report: v => reports.push(v), processSignals: signals, ...extra });
  return { transport, reports, signals, done };
}
afterEach(() => vi.useRealTimers());

describe('Read-only argument and observer contracts', () => {
  it('requires exact port/PnP, bounded duration, explicit DTR, reset acknowledgement and monitor confirmation', () => {
    const args = ['--port', 'COM11', '--confirm-pnp-id', options.pnpId, '--seconds', '30', '--dtr', 'on', '--ack-reset-risk', '--confirm-monitor-closed'];
    expect(parseCaptureArgs(args)).toEqual(options);
    for (const bad of [[], [...args, '--port', 'COM12'], [...args, '--write', 'ACK'], args.filter(v => v !== '--ack-reset-risk'), args.filter(v => v !== '--confirm-monitor-closed')]) expect(() => parseCaptureArgs(bad)).toThrow();
    for (const value of ['31', '0', '30.0', '030', '-1']) expect(() => parseCaptureArgs(args.map(v => v === '30' ? value : v))).toThrow();
    expect(() => parseCaptureArgs(args.map(v => v === 'on' ? 'auto' : v))).toThrow();
  });
  it('counts three legacy observations from fragmented/combined CRLF without leaking UID data', () => {
    const reports = [], observer = new ReadOnlyObserver({ report: r => reports.push(r) });
    const text = scan(100).trimEnd() + '\r\n' + scan(2200) + scan(4400);
    observer.feed(Buffer.from(text.slice(0, 17))); observer.feed(Buffer.from(text.slice(17, 32))); observer.feed(Buffer.from(text.slice(32)));
    expect(observer.snapshot()).toMatchObject({ validScanFrames: 3, distinctObservationTuples: 3, exactRepeatedTuples: 0,
      physicalPresentationsVerified: false, retransmissionIdentityAvailable: false, lastDeviceUptimeMs: 4400 });
    expect(JSON.stringify(reports)).not.toContain(UID);
  });
  it('counts exact repeated tuples conservatively, including an older observation after a later one', () => {
    const observer = new ReadOnlyObserver(); observer.feed(Buffer.from(scan(100) + scan(2200) + scan(100)));
    expect(observer.snapshot()).toMatchObject({ validScanFrames: 3, exactRepeatedTuples: 1, distinctObservationTuples: 2, uptimeRegressions: 1, physicalPresentationsVerified: false });
  });
  it('reports READY/reset indications and separates observations across indicated epochs without claiming a confirmed boot', () => {
    const observer = new ReadOnlyObserver(); observer.feed(Buffer.from('SCHOVERA_RFID_READY\nFirmware Version: 0x82 = (unknown)\n' + scan(100) + 'SCHOVERA_RFID_READY\n' + scan(100)));
    expect(observer.snapshot()).toMatchObject({ validScanFrames: 2, distinctObservationTuples: 2, bootOrReadyIndications: 2,
      possibleResetIndications: 1, firmwareVersionIndications: 1, physicalPresentationsVerified: false });
  });
  it('rejects malformed/oversized/NUL frames and resumes at a valid newline boundary', () => {
    const observer = new ReadOnlyObserver(); observer.feed(Buffer.from('PRIVATE_DATA\n' + 'X'.repeat(193) + '\n\0bad\n' + scan()));
    expect(observer.snapshot()).toMatchObject({ invalidFrames: 3, validScanFrames: 1 });
  });
  it('does not combine an unfinished frame after capture end', () => {
    const observer = new ReadOnlyObserver(); observer.feed(Buffer.from('SCHOVERA_SCAN,')); observer.end(); observer.feed(Buffer.from(UID + ',100\n'));
    expect(observer.snapshot()).toMatchObject({ partialFrameDiscarded: true, validScanFrames: 0 });
  });
  it('caps tuple tracking and byte volume instead of retaining unbounded input', () => {
    const stops = [], observer = new ReadOnlyObserver({ maxTuples: 1, stop: code => stops.push(code) });
    observer.feed(Buffer.from(scan(1) + scan(2))); observer.feed(Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(stops).toEqual(['observation_capacity', 'capture_byte_limit']); expect(observer.snapshot().distinctObservationTuples).toBe(1);
  });
});

describe('Mocked capture lifecycle; no hardware transports execute', () => {
  it('closes on the bounded deadline, retaining only sanitized results and removing signal listeners', async () => {
    vi.useFakeTimers(); const r = running(); r.transport.emit('opened'); r.transport.emit('bytes', Buffer.from(scan()));
    await vi.advanceTimersByTimeAsync(30000); const result = await r.done;
    expect(result).toMatchObject({ reason: 'deadline', portOpened: true, validScanFrames: 1, serialPayloadWrites: 0, backendWritten: false, source: 'mock_serial', closureEvidence: 'worker_closed_and_exited', exitCode: 0 });
    expect(r.transport.close).toHaveBeenCalledTimes(1); expect(r.signals.listenerCount('SIGINT')).toBe(0);
    expect(r.transport.listenerCount('bytes')).toBe(0); expect(JSON.stringify(r.reports)).not.toContain(UID);
  });
  it('closes once on Ctrl+C even when disconnect and exit also arrive', async () => {
    const r = running(); r.transport.emit('opened'); r.signals.emit('SIGINT'); r.transport.emit('failure', 'serial_disconnected'); r.transport.emit('exit');
    expect(await r.done).toMatchObject({ reason: 'sigint', exitCode: 130 }); expect(r.transport.close).toHaveBeenCalledTimes(1);
  });
  it('distinguishes supervisor termination from Ctrl+C and reports conventional SIGTERM status', async () => {
    const r = running(); r.transport.emit('opened'); r.signals.emit('SIGTERM');
    expect(await r.done).toMatchObject({ reason: 'sigterm', exitCode: 143 });
    expect(r.transport.close).toHaveBeenCalledTimes(1);
    expect(r.signals.listenerCount('SIGTERM')).toBe(0);
  });
  it('handles AbortSignal cancellation and never starts when already cancelled', async () => {
    const controller = new AbortController(); const r = running({ signal: controller.signal }); controller.abort();
    expect(await r.done).toMatchObject({ reason: 'cancelled', exitCode: 1 });
    const factory = vi.fn(); expect(await runReadOnlyCapture(options, { signal: controller.signal, createTransport: factory })).toMatchObject({ reason: 'cancelled_before_open', exitCode: 1 });
    expect(factory).not.toHaveBeenCalled();
  });
  it('reports unexpected disconnect without reopening or selecting a different port', async () => {
    const r = running(); r.transport.emit('opened'); r.transport.emit('bytes', Buffer.from(scan())); r.transport.emit('failure', 'serial_disconnected');
    expect(await r.done).toMatchObject({ reason: 'serial_disconnected', validScanFrames: 1, exitCode: 1 });
    expect(r.transport.start).toHaveBeenCalledTimes(1); expect(r.transport.close).toHaveBeenCalledTimes(1);
  });
  it('reports ownership or identity refusal without accepting data or retrying another device', async () => {
    for (const code of ['port_busy_denied_or_unavailable', 'identity_mismatch', 'monitor_may_be_open']) {
      const r = running(); r.transport.emit('failure', code);
      expect(await r.done).toMatchObject({ reason: code, portOpened: false, validScanFrames: 0, exitCode: 1 });
      expect(r.transport.start).toHaveBeenCalledTimes(1);
    }
  });
  it('closes on a start exception without echoing the exception or any UID', async () => {
    const transport = new MockReadOnlyTransport(); transport.start = () => { throw Error(UID); };
    const r = running({ transport }); expect(await r.done).toMatchObject({ reason: 'transport_start_failed', exitCode: 1 });
    expect(transport.close).toHaveBeenCalledTimes(1); expect(JSON.stringify(r.reports)).not.toContain(UID);
  });
  it('closes on a reporting exception, preserving a structured failure result', async () => {
    const transport = new MockReadOnlyTransport();
    const result = await runReadOnlyCapture(options, { createTransport: () => transport, processSignals: new EventEmitter(), report: () => { throw Error(UID); } });
    expect(result).toMatchObject({ reason: 'reporting_failure', exitCode: 1 }); expect(transport.start).not.toHaveBeenCalled(); expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('forces closure if graceful shutdown stalls, reporting unconfirmed closure honestly', async () => {
    vi.useFakeTimers(); const transport = new MockReadOnlyTransport(); transport.close = vi.fn(() => new Promise(() => {}));
    const r = running({ transport }); transport.emit('opened'); await vi.advanceTimersByTimeAsync(30500);
    expect(await r.done).toMatchObject({ reason: 'deadline', closureEvidence: 'unconfirmed', exitCode: 1 }); expect(transport.forceKill).toHaveBeenCalled();
  });
  it('stops if no open confirmation arrives and drops late bytes', async () => {
    vi.useFakeTimers(); const r = running(); await vi.advanceTimersByTimeAsync(5000); r.transport.emit('bytes', Buffer.from(scan()));
    expect(await r.done).toMatchObject({ reason: 'port_startup_timeout', validScanFrames: 0, portOpened: false, exitCode: 1 });
  });
  it('starts a full 30-second capture window only after serial readiness', async () => {
    vi.useFakeTimers(); const r = running();
    await vi.advanceTimersByTimeAsync(4000); // Startup time is independent of the capture budget.
    r.transport.emit('opened');
    await vi.advanceTimersByTimeAsync(29900);
    r.transport.emit('bytes', Buffer.from(scan(29900)));
    expect(r.transport.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(await r.done).toMatchObject({ reason: 'deadline', portOpened: true, captureElapsedMs: 30000, validScanFrames: 1, exitCode: 0 });
  });
  it('has no command/write calls even for versioned READY/SCAN input', async () => {
    const r = running(); r.transport.write = vi.fn(() => { throw Error('Never allowed'); }); r.transport.emit('opened');
    r.transport.emit('bytes', Buffer.from('SRFID,1,READY\nSRFID,1,SCAN,10000000-0000-4000-8000-000000000001,1,' + UID + ',100\n'));
    r.signals.emit('SIGINT'); expect(await r.done).toMatchObject({ otherVersionedFrames: 2, serialPayloadWrites: 0 }); expect(r.transport.write).not.toHaveBeenCalled();
  });
  it('refuses bytes before the worker confirms the configured port opened', async () => {
    const r = running(); r.transport.emit('bytes', Buffer.from(scan())); expect(await r.done).toMatchObject({ reason: 'bytes_before_open_confirmation', validScanFrames: 0, exitCode: 1 });
  });
  it('force-closes and reports failure when cleanup itself throws', async () => {
    const transport = new MockReadOnlyTransport(); transport.close = vi.fn(() => { throw Error(UID); });
    const r = running({ transport }); transport.emit('opened'); r.signals.emit('SIGINT');
    expect(await r.done).toMatchObject({ reason: 'sigint', exitCode: 130, closureEvidence: 'unconfirmed' });
    expect(transport.forceKill).toHaveBeenCalledTimes(1); expect(JSON.stringify(r.reports)).not.toContain(UID);
  });
  it('fails closed when startup does not confirm the port within five seconds', async () => {
    vi.useFakeTimers(); const transport = new MockReadOnlyTransport();
    const done = runReadOnlyCapture({ ...options, seconds: 1 }, { createTransport: () => transport, report: () => {}, processSignals: new EventEmitter() });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await done).toMatchObject({ reason: 'port_startup_timeout', portOpened: false, validScanFrames: 0, exitCode: 1 });
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
});
