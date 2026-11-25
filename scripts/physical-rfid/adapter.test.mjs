import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PhysicalRfidAdapter } from './adapter.mjs';
import { PhysicalSerialLines } from './serial-lines.mjs';
import { acquisitionId, command, MAX_CHUNK_BYTES, MAX_FRAME_BYTES, normalizeUid, parseFrame } from './protocol.mjs';
import { simulate } from './cli.mjs';

const UID = 'FA:CE:B0:0C'; // Fictional test bytes, never an enrolled/student card.
const uid2 = 'AA:BB:CC:DD';
const sessions = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];
const bytes = s => Buffer.from(s + '\n');
function fixture(options = {}) {
  let time = 0, wall = Date.parse('2026-11-19T09:00:00Z'), id = 0;
  const writes = [], reports = [];
  const adapter = new PhysicalRfidAdapter({ write: async line => { writes.push(line); }, report: e => reports.push(e),
    monotonicNow: () => time, wallNow: () => wall, newSessionId: () => sessions[id++], ...options });
  const feed = line => adapter.feed(bytes(line));
  const scan = (seq = 1, uid = UID, uptime = 100, session = sessions[0]) => `SRFID,1,SCAN,${session},${seq},${uid},${uptime}`;
  const bind = async () => {
    adapter.connect(); feed('SRFID,1,READY'); const result = await adapter.bindSession();
    feed(`SRFID,1,STATE,${result.sessionId},0`); return result.sessionId;
  };
  return { adapter, feed, scan, bind, writes, reports, advance: n => time += n, wall: n => wall = n };
}
afterEach(() => vi.useRealTimers());

describe('Separate strict physical/legacy protocol', () => {
  it('normalizes supported UID bytes without accepting whitespace, partial hex or wrong lengths', () => {
    expect(normalizeUid('fa:ce:b0:0c')).toBe(UID);
    for (const count of [7, 10]) expect(normalizeUid(Array(count).fill('AB').join(':')).split(':')).toHaveLength(count);
    for (const uid of ['', 'F:CE:B0:0C', 'FACEB00C', ' FA:CE:B0:0C', 'FA:CE:B0:GG', '01:02:03', '01:02:03:04:05']) expect(() => normalizeUid(uid)).toThrow('invalid_uid');
  });
  it('parses the inspected legacy sketch format without inventing an acquisition identity', () => {
    expect(parseFrame('SCHOVERA_RFID_READY')).toEqual({ type: 'legacy_ready' });
    expect(parseFrame('Firmware Version: 0x82 = (unknown)')).toEqual({ type: 'legacy_version' });
    expect(parseFrame(`SCHOVERA_SCAN,${UID},32923`)).toEqual({ type: 'legacy_scan', uid: UID, deviceUptimeMs: 32923 });
    expect(parseFrame('SCHOVERA_LCD_SHOWN,1')).toEqual({ type: 'lcd_shown', version: 1 });
    expect(parseFrame('SCHOVERA_LCD_UNAVAILABLE')).toEqual({ type: 'lcd_unavailable' });
  });
  it('requires exact version/type/field counts and never accepts M7 JSON as physical input', () => {
    for (const value of ['SRFID,2,READY', 'SRFID,1,READY,extra', `SRFID,1,SCAN,${sessions[0]},1,${UID},1,extra`, '{"kind":"synthetic"}', 'PRIVATE_DEBUG_DATA']) expect(() => parseFrame(value)).toThrow();
  });
  it('enforces numeric range and spelling; source uptime is an unsigned counter, not UTC', () => {
    const f = fixture(); expect(parseFrame(f.scan(1, UID, 4294967295)).deviceUptimeMs).toBe(4294967295);
    for (const n of ['-1', '00', '1.0', '1e3', '4294967296', 'NaN']) expect(() => parseFrame(`SCHOVERA_SCAN,${UID},${n}`)).toThrow();
    for (const n of ['0', '01', '2147483648']) expect(() => parseFrame(`SRFID,1,SCAN,${sessions[0]},${n},${UID},0`)).toThrow();
  });
  it('builds only reviewed reference commands, with no durable ACK or raw passthrough', () => {
    expect(command('status')).toBe('SRFID,1,STATUS');
    expect(command('retry', sessions[0], 1)).toBe(`SRFID,1,RETRY,${sessions[0]},1`);
    expect(command('validation_ack', sessions[0], 1)).toContain('VALIDATED_RAM_ONLY');
    for (const kind of ['COMMIT_ACK', 'CLEAR', 'raw']) expect(() => command(kind, sessions[0], 1)).toThrow();
    expect(() => command('bind', sessions[0] + '\nSTATUS')).toThrow();
  });
  it('frames partial input, combined lines and split CRLF', () => {
    const frames = [], decoder = new PhysicalSerialLines(v => frames.push(v));
    decoder.push(Buffer.from('SRFID,1,REA')); decoder.push(Buffer.from('DY\r')); decoder.push(Buffer.from('\nSRFID,1,READY\n'));
    expect(frames).toEqual([{ text: 'SRFID,1,READY' }, { text: 'SRFID,1,READY' }]);
  });
  it('rejects NUL, non-ASCII, embedded CR and oversized lines, then resynchronizes', () => {
    for (const bad of [Buffer.from([0, 65]), Buffer.from([255]), Buffer.from('SR\rFID'), Buffer.alloc(MAX_FRAME_BYTES + 1, 65)]) {
      const frames = [], decoder = new PhysicalSerialLines(v => frames.push(v));
      decoder.push(Buffer.concat([bad, bytes('')])); decoder.push(bytes('SRFID,1,READY'));
      expect(frames).toEqual([{ code: 'invalid_serial_line' }, { text: 'SRFID,1,READY' }]);
    }
  });
  it('caps a whole input chunk and preserves no oversized partial buffer', () => {
    const frames = [], decoder = new PhysicalSerialLines(v => frames.push(v));
    decoder.push(Buffer.alloc(MAX_CHUNK_BYTES + 1, 65)); expect(decoder.bytes).toHaveLength(0);
    decoder.push(bytes('discard boundary')); decoder.push(bytes('SRFID,1,READY'));
    expect(frames).toEqual([{ code: 'oversized_chunk' }, { code: 'invalid_serial_line' }, { text: 'SRFID,1,READY' }]);
  });
});

describe('Stage 1 simulated adapter safety', () => {
  it('does not bind or ACK legacy scans; optional monitoring remains identity-unavailable', async () => {
    for (const allowLegacyMonitor of [false, true]) {
      const f = fixture({ allowLegacyMonitor }); f.adapter.connect(); f.feed('SCHOVERA_RFID_READY'); f.feed(`SCHOVERA_SCAN,${UID},100`);
      await f.adapter.flushValidationAcks(); expect(f.writes).toEqual([]); expect(f.adapter.inspect().retainedRecords).toBe(0);
      await expect(f.adapter.bindSession()).rejects.toThrow('binding_not_available');
      if (allowLegacyMonitor) expect(f.adapter.readPrivateLegacyObservation()).toMatchObject({ uid: UID, acquisitionId: null, retransmission: 'unknown', deviceUptimeMs: 100, hostReceivedAt: '2026-11-19T09:00:00.000Z' });
      else expect(f.adapter.readPrivateLegacyObservation()).toBeNull();
      expect(JSON.stringify(f.reports)).not.toContain(UID);
    }
  });
  it('requires explicit binding and matching device STATE before accepting a scan', async () => {
    const f = fixture(); f.adapter.connect(); f.feed(f.scan()); f.feed('SRFID,1,READY');
    const offered = await f.adapter.bindSession(); expect(offered.deviceConfirmed).toBe(false);
    f.feed(f.scan()); expect(f.adapter.inspect().retainedRecords).toBe(0);
    f.feed(`SRFID,1,STATE,${offered.sessionId},0`); f.feed(f.scan()); expect(f.adapter.inspect().retainedRecords).toBe(1);
  });
  it('retains original receipt time and identity for an exact retransmission', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); const id = acquisitionId(sessions[0], 1);
    const original = f.adapter.readPrivateObservation(id); await f.adapter.flushValidationAcks();
    f.wall(Date.parse('2026-11-19T10:00:00Z')); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    expect(f.adapter.inspect().retainedRecords).toBe(1); expect(f.adapter.readPrivateObservation(id)).toEqual(original);
    expect(f.writes.slice(1)).toEqual(Array(2).fill(command('validation_ack', sessions[0], 1) + '\n'));
  });
  it('treats a new source sequence for the same UID as a distinct acquisition', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); f.feed(f.scan(2, UID, 2200));
    expect(f.adapter.inspect().retainedRecords).toBe(2);
    expect(f.adapter.readPrivateObservation(acquisitionId(sessions[0], 1)).uid).toBe(f.adapter.readPrivateObservation(acquisitionId(sessions[0], 2)).uid);
    expect(acquisitionId(sessions[0], 1)).not.toBe(acquisitionId(sessions[0], 2));
  });
  it('refuses changed UID or source time under an already-used identity', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    f.feed(f.scan(1, uid2)); f.feed(f.scan(1, UID, 101)); await f.adapter.flushValidationAcks();
    expect(f.writes).toHaveLength(2); expect(f.adapter.inspect().retainedRecords).toBe(1);
    expect(f.reports.filter(r => r.code === 'acquisition_content_conflict')).toHaveLength(2);
  });
  it('refuses gaps without silently advancing the accepted sequence', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan(2)); expect(f.adapter.inspect().retainedRecords).toBe(0);
    f.feed(f.scan()); f.feed(f.scan(3)); f.feed(f.scan(2, UID, 200)); expect(f.adapter.inspect().retainedRecords).toBe(2);
  });
  it('holds a regressed/wrapped uptime instead of inventing a boot or timestamp', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); f.feed(f.scan(2, UID, 0)); await f.adapter.flushValidationAcks();
    expect(f.adapter.inspect()).toMatchObject({ state: 'identity_attention', retainedRecords: 1 }); expect(f.writes).toHaveLength(1);
  });
  it('discards partial framing on disconnect but retains validated RAM records for same-session replay', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); f.adapter.feed(Buffer.from(f.scan(2).slice(0, 20)));
    f.adapter.disconnect(); f.feed(f.scan(2)); await f.adapter.flushValidationAcks(); expect(f.writes).toHaveLength(1);
    f.adapter.connect(); f.feed(`SRFID,1,STATE,${sessions[0]},1`); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    expect(f.adapter.inspect().retainedRecords).toBe(1); expect(f.reports.some(r => r.partialFrameDiscarded)).toBe(true);
  });
  it('never adopts a foreign session after reconnect or host restart', async () => {
    const f = fixture(); await f.bind(); f.adapter.disconnect(); f.adapter.connect();
    f.feed(`SRFID,1,STATE,${sessions[1]},0`); f.feed(f.scan(1, UID, 0, sessions[1]));
    expect(f.adapter.inspect()).toMatchObject({ state: 'identity_attention', retainedRecords: 0 });
    const fresh = fixture(); fresh.adapter.connect(); fresh.feed(`SRFID,1,STATE,${sessions[0]},0`); expect(fresh.writes).toHaveLength(0);
  });
  it('requires reset review; a new session never overwrites an old acquisition', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); f.feed('SRFID,1,READY');
    await expect(f.adapter.bindSession()).rejects.toThrow('reset_review_required');
    const binding = await f.adapter.bindSession({ acknowledgeVolatileReset: true });
    f.feed(`SRFID,1,STATE,${binding.sessionId},0`); f.feed(f.scan(1, UID, 0, binding.sessionId)); f.feed(f.scan());
    expect(f.adapter.inspect().retainedRecords).toBe(2);
    expect(f.adapter.readPrivateObservation(acquisitionId(sessions[0], 1)).deviceUptimeMs).toBe(100);
  });
  it('rejects a source sequence regression at reconnect without resetting host history', async () => {
    const f = fixture(); await f.bind(); f.feed(f.scan()); f.adapter.disconnect(); f.adapter.connect();
    f.feed(`SRFID,1,STATE,${sessions[0]},0`); expect(f.adapter.inspect()).toMatchObject({ state: 'identity_attention', retainedRecords: 1 });
  });
  it('rejects scans at capacity without evicting old work or ACKing new work', async () => {
    const f = fixture({ maxRecords: 1 }); await f.bind(); f.feed(f.scan()); f.feed(f.scan(2)); await f.adapter.flushValidationAcks();
    expect(f.adapter.inspect().retainedRecords).toBe(1); expect(f.writes).toHaveLength(2); expect(f.writes[1]).not.toContain(',2,');
  });
  it('bounds session retention and refuses reuse of an old namespace', async () => {
    const f = fixture({ maxSessions: 1 }); await f.bind(); f.feed('SRFID,1,READY');
    await expect(f.adapter.bindSession({ acknowledgeVolatileReset: true })).rejects.toThrow('session_capacity_requires_review');
    const reused = fixture({ newSessionId: () => sessions[0] }); await reused.bind(); reused.feed('SRFID,1,READY');
    await expect(reused.adapter.bindSession({ acknowledgeVolatileReset: true })).rejects.toThrow('session_reuse_refused');
  });
  it('bounds failed ACK writes with backoff, retaining the acquisition in attention', async () => {
    let ackAttempts = 0; const f = fixture({ write: async line => { if (line.includes(',ACK,')) { ackAttempts++; throw Error(UID); } } });
    await f.bind(); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    await f.adapter.flushValidationAcks(); expect(ackAttempts).toBe(1);
    f.advance(250); await f.adapter.flushValidationAcks(); f.advance(500); await f.adapter.flushValidationAcks();
    f.advance(10000); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    expect(ackAttempts).toBe(3); expect(f.adapter.inspect()).toMatchObject({ retainedRecords: 1, validationAckAttention: 1 });
    expect(JSON.stringify(f.reports)).not.toContain(UID);
  });
  it('bounds ACK retransmissions even when every write completes locally', async () => {
    const f = fixture(); await f.bind();
    for (let i = 0; i < 10; i++) { f.feed(f.scan()); await f.adapter.flushValidationAcks(); }
    expect(f.writes).toHaveLength(4); expect(f.adapter.inspect().validationAckAttention).toBe(1);
  });
  it('retries the same offered binding identity at most three times', async () => {
    const written = []; const f = fixture({ write: async line => { written.push(line); throw Error('PRIVATE_FAILURE'); } });
    f.adapter.connect(); f.feed('SRFID,1,READY');
    for (let i = 0; i < 3; i++) await f.adapter.bindSession();
    await expect(f.adapter.bindSession()).rejects.toThrow('binding_retry_limit');
    expect(new Set(written).size).toBe(1); expect(f.adapter.inspect().state).not.toBe('bound');
  });
  it('serializes flush callers and aborts a write after its bounded deadline', async () => {
    vi.useFakeTimers(); let signal;
    const f = fixture({ write: async (line, options) => { if (line.includes(',ACK,')) { signal = options.signal; await new Promise(() => {}); } }, writeTimeoutMs: 50 });
    await f.bind(); f.feed(f.scan()); const a = f.adapter.flushValidationAcks(), b = f.adapter.flushValidationAcks(); expect(a).toBe(b);
    await vi.advanceTimersByTimeAsync(50); await a; expect(signal.aborted).toBe(true); expect(f.adapter.inspect().retainedRecords).toBe(1);
  });
  it('cancels in-flight work on disconnect without claiming a successful write', async () => {
    let release; const f = fixture({ write: async line => { if (line.includes(',ACK,')) await new Promise(r => release = r); } });
    await f.bind(); f.feed(f.scan()); const pending = f.adapter.flushValidationAcks(); await Promise.resolve(); await Promise.resolve();
    f.adapter.disconnect(); await pending; release(); await Promise.resolve();
    expect(f.reports.some(r => r.code === 'validation_ack_write_completed_only')).toBe(false); expect(f.adapter.inspect().retainedRecords).toBe(1);
  });
  it('never emits raw UIDs, arbitrary diagnostics or exception messages to ordinary reports', async () => {
    const f = fixture({ allowLegacyMonitor: true }); await f.bind(); f.feed(f.scan());
    f.feed(`SCHOVERA_SCAN,${uid2},400`); f.feed(`DEBUG_PRIVATE_${UID}`); f.feed(`SRFID,1,SCAN,${sessions[0]},2,SECRET_DATA,1`);
    expect(JSON.stringify({ reports: f.reports, snapshot: f.adapter.inspect() })).not.toMatch(/FA:CE:B0:0C|AA:BB:CC:DD|DEBUG_PRIVATE|SECRET_DATA/);
    expect(Object.isFrozen(f.adapter.readPrivateObservation(acquisitionId(sessions[0], 1)))).toBe(true);
  });
  it('bounds diagnostic output during malformed-input flooding', () => {
    const f = fixture(); f.adapter.connect(); f.adapter.feed(Buffer.from('bad\n'.repeat(100)));
    expect(f.reports).toHaveLength(16); expect(f.adapter.inspect().suppressedDiagnostics).toBeGreaterThan(0);
    f.advance(1000); f.feed('bad'); expect(f.reports).toHaveLength(17);
  });
  it('does not capture or ACK when host receipt time is unavailable', async () => {
    const f = fixture({ wallNow: () => NaN }); await f.bind(); f.feed(f.scan()); await f.adapter.flushValidationAcks();
    expect(f.adapter.inspect().retainedRecords).toBe(0); expect(f.writes).toHaveLength(1);
  });
  it('runs only fictional simulation and refuses any hardware/port CLI command', async () => {
    const reports = []; const result = await simulate(e => reports.push(e));
    expect(result).toMatchObject({ retainedRecords: 2, connected: false, durable: false, backendWritten: false, studentsAssociated: false, physicalHardwareVerified: false });
    expect(JSON.stringify(reports)).not.toContain('A1:B2:C3:D4');
    const env = Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const child = spawnSync(process.execPath, [cli, 'listen', '--port', 'COM11'], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 });
    expect(child.status).toBe(2); expect(child.stdout).toBe(''); expect(child.stderr).toContain('supports only');
  });
  it('rejects unbounded configuration and a wrong simulated binding identity', async () => {
    for (const options of [{ maxRecords: 129 }, { maxSessions: 5 }, { maxWriteAttempts: 4 }, { writeTimeoutMs: 0 }]) expect(() => fixture(options)).toThrow('invalid_adapter_configuration');
    const f = fixture({ newSessionId: randomUUID }); f.adapter.connect(); f.feed('SRFID,1,READY'); await f.adapter.bindSession();
    f.feed(`SRFID,1,STATE,${sessions[0]},0`); expect(f.adapter.inspect().state).toBe('identity_attention');
  });
});
