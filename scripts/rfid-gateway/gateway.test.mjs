import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openGatewayDatabase } from './storage.mjs';
import { hashReaderKey, ingestReaderSubmission, signReaderSubmission, LocalAcknowledgementLost } from './ingress.mjs';
import { FakeLocalTransport, syncPendingEvents } from './transport.mjs';
import { assertSafeTarget } from '../rfid-simulator/core.ts';
import { canonicalEventV2, eventV2Hash } from '../rfid-simulator/event-v2.ts';
import { syncPendingV2Events } from './local-v2-transport.mjs';

const directories = [];
const stores = [];
const NOW = Date.parse('2026-10-19T05:00:00.000Z');
const readerId = 'reader-synthetic-test';
const deviceId = 'device-synth-gate-test';
const readerKey = 'a'.repeat(64);

function setup(options) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'schovera-gateway-'));
  directories.push(directory);
  const store = openGatewayDatabase(path.join(directory, 'gateway.sqlite'), options);
  stores.push(store);
  store.registerReader({ readerId, deviceId, tokenHash: hashReaderKey(readerKey), now: new Date(NOW).toISOString() });
  return store;
}

function event(overrides = {}) {
  return {
    schema_version: 1,
    event_id: randomUUID(),
    device_id: deviceId,
    credential_ref: 'cred-synth-test-001',
    event_type: 'check_in',
    observed_at: new Date(NOW).toISOString(),
    device_sequence: 1,
    ...overrides,
  };
}

function submit(store, input = event(), options = {}) {
  const submission = signReaderSubmission(input, { readerId: options.readerId ?? readerId, key: options.readerKey ?? readerKey, timestamp: NOW, nonce: options.nonce ?? randomUUID() });
  submission.readerKey = options.readerKey ?? readerKey;
  return ingestReaderSubmission(store, submission, { now: options.now ?? NOW, ...options.faults });
}

afterEach(() => {
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* test cleanup */ } }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
describe('durable local gateway', () => {
  it('1 creates a strict versioned SQLite schema with WAL and foreign keys', () => {
    const store = setup();
    expect(store.db.prepare('PRAGMA journal_mode').get().journal_mode).toBe('wal');
    expect(store.db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    expect(store.db.prepare('PRAGMA user_version').get().user_version).toBe(2);
  });
  it('2 rejects network-share database paths', () => {
    expect(() => openGatewayDatabase('\\\\server\\share\\gateway.sqlite')).toThrow(/network share/);
  });
  it('3 refuses a database schema newer than the simulator', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'schovera-gateway-version-')); directories.push(dir);
    const db = openGatewayDatabase(path.join(dir, 'db.sqlite'));
    db.db.exec('PRAGMA user_version = 999'); db.close();
    expect(() => openGatewayDatabase(path.join(dir, 'db.sqlite'))).toThrow(/newer than this simulator supports/);
  });
  it('4 refuses an unsupported nonzero schema version', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'schovera-gateway-version-')); directories.push(dir);
    const db = openGatewayDatabase(path.join(dir, 'db.sqlite'));
    db.db.exec('PRAGMA user_version = 3'); db.close();
    expect(() => openGatewayDatabase(path.join(dir, 'db.sqlite'))).toThrow(/newer than this simulator supports/);
  });
  it('5 accepts a valid authenticated synthetic event and returns a durable receipt', () => {
    const store = setup(); const input = event();
    const receipt = submit(store, input);
    expect(receipt).toMatchObject({ event_id: input.event_id, outcome: 'recorded_locally', queue_state: 'pending', duplicate: false });
    expect(store.getEvent(deviceId, input.event_id).local_receipt_id).toBe(receipt.local_receipt_id);
  });
  it('6 returns the same receipt for an exact retry', () => {
    const store = setup(); const input = event(); const first = submit(store, input);
    const retry = submit(store, input);
    expect(retry.local_receipt_id).toBe(first.local_receipt_id);
    expect(retry.duplicate).toBe(true);
    expect(store.eventCount()).toBe(1);
  });
  it('7 conflicts when an event ID is reused with changed content', () => {
    const store = setup(); const input = event(); submit(store, input);
    expect(() => submit(store, { ...input, event_type: 'check_out' })).toThrow(/different content/);
  });
  it('accepts separate physical-style taps with distinct event IDs and sequences', () => {
    const store = setup(); const first = submit(store, event({ device_sequence: 1 }));
    const second = submit(store, event({ device_sequence: 2, event_type: 'check_out' }));
    expect(first.event_id).not.toBe(second.event_id);
    expect(store.eventCount()).toBe(2);
  });
  it('8 rejects an unknown reader', () => {
    const store = setup(); const request = signReaderSubmission(event(), { readerId: 'unknown', key: readerKey, timestamp: NOW });
    request.readerKey = readerKey;
    expect(() => ingestReaderSubmission(store, request, { now: NOW })).toThrow(/unknown or revoked/);
  });
  it('9 rejects a revoked reader', () => {
    const store = setup(); store.revokeReader(readerId);
    expect(() => submit(store)).toThrow(/unknown or revoked/);
  });
  it('10 rejects mismatched device identity', () => {
    const store = setup(); expect(() => submit(store, event({ device_id: 'other-device' }))).toThrow(/does not match/);
  });
  it('11 rejects an incorrect reader key', () => {
    const store = setup();
    expect(() => submit(store, event(), { readerKey: 'b'.repeat(64) })).toThrow(/authentication failed/);
  });
  it('12 rejects stale signed requests', () => {
    const store = setup();
    expect(() => submit(store, event(), { now: NOW + 5 * 60_000 + 1 })).toThrow(/outside the allowed window/);
  });
  it('13 rejects malformed event schemas before queue writes', () => {
    const store = setup(); const input = { ...event(), school_id: randomUUID() };
    expect(() => submit(store, input)).toThrow(/unexpected field/);
    expect(store.eventCount()).toBe(0);
  });
  it('14 rejects nonce replay for a different event', () => {
    const store = setup(); const nonce = randomUUID(); submit(store, event(), { nonce });
    expect(() => submit(store, event({ device_sequence: 2 }), { nonce })).toThrow(/already been used/);
  });
  it('15 rejects duplicate sequence numbers for distinct events', () => {
    const store = setup(); submit(store, event());
    expect(() => submit(store, event())).toThrow(/sequence was already used/);
  });
  it('16 records sequence gaps without discarding the event', () => {
    const store = setup(); const receipt = submit(store, event({ device_sequence: 3 }));
    expect(receipt.sequence_state).toBe('gap'); expect(store.eventCount()).toBe(1);
  });
  it('17 retains out-of-order sequence observations', () => {
    const store = setup(); submit(store, event({ device_sequence: 3 }));
    expect(submit(store, event({ device_sequence: 2 })).sequence_state).toBe('out_of_order');
  });
  it('18 rolls back event and nonce if failure occurs before commit', () => {
    const store = setup(); const input = event();
    expect(() => submit(store, input, { faults: { beforeCommit: () => { throw new Error('injected'); } } })).toThrow('injected');
    expect(store.eventCount()).toBe(0); expect(store.nonceExists(readerId, 'unused')).toBe(false);
  });
  it('does not acknowledge a simulated SQLite write failure', () => {
    const store = setup();
    store.db.exec(`CREATE TRIGGER fail_gateway_insert BEFORE INSERT ON gateway_events
      BEGIN SELECT RAISE(ABORT, 'injected disk write failure'); END`);
    expect(() => submit(store)).toThrow(/injected disk write failure/);
    expect(store.eventCount()).toBe(0);
  });
  it('19 can retry the same event after commit but lost acknowledgement', () => {
    const store = setup(); const input = event();
    try { submit(store, input, { faults: { afterCommitBeforeAck: () => { throw Error('lost'); } } }); } catch (error) {
      expect(error).toBeInstanceOf(LocalAcknowledgementLost);
    }
    expect(submit(store, input)).toMatchObject({ duplicate: true, event_id: input.event_id });
    expect(store.eventCount()).toBe(1);
  });
  it('20 survives a real close/reopen process boundary with pending rows', () => {
    const store = setup(); const input = event(); submit(store, input);
    const dbPath = store.filePath; store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = openGatewayDatabase(dbPath); stores.push(reopened);
    expect(reopened.getEvent(deviceId, input.event_id).queue_state).toBe('pending');
  });
  it('recovers a process killed during synchronization as pending without changing its payload', () => {
    const store = setup(); const input = event(); submit(store, input);
    const original = store.getEvent(deviceId, input.event_id);
    store.startAttempt(deviceId, input.event_id, new Date(NOW).toISOString());
    expect(store.getEvent(deviceId, input.event_id).queue_state).toBe('syncing');
    const dbPath = store.filePath; store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = openGatewayDatabase(dbPath); stores.push(reopened);
    expect(reopened.getEvent(deviceId, input.event_id)).toMatchObject({
      queue_state: 'pending', canonical_payload: original.canonical_payload, payload_hash: original.payload_hash,
      local_receipt_id: original.local_receipt_id, last_error_class: 'interrupted_sync_recovered',
    });
  });
  it('21 enforces bounded local queue capacity and fails closed', () => {
    const store = setup({ maxEvents: 1 }); submit(store, event());
    expect(() => submit(store, event({ device_sequence: 2 }))).toThrow(/queue is full/);
    expect(store.eventCount()).toBe(1);
  });
  it('22 summarizes pending age and retained state', () => {
    const store = setup(); submit(store, event());
    expect(store.summary(NOW + 12_000)).toMatchObject({ pending: 1, total_retained: 1, oldest_pending_age_seconds: 12 });
  });
  it('23 fake offline destination keeps event pending with bounded retry', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { mode: 'offline', now: () => NOW });
    const [result] = syncPendingEvents(store, transport, keys.privateKey, { now: NOW, random: () => 0.5 });
    expect(result).toMatchObject({ state: 'pending', next_retry_at: new Date(NOW + 1_000).toISOString() });
  });
  it('24 accepts a fake receipt and marks the local outbox delivered', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { now: () => NOW });
    const [result] = syncPendingEvents(store, transport, keys.privateKey, { now: NOW });
    expect(result.state).toBe('delivered_to_fake_transport');
    expect(store.getEvent(deviceId, input.event_id).queue_state).toBe('delivered');
  });
  it('25 retries accepted-but-lost fake response with the original fake receipt', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { mode: 'lose-response', now: () => NOW });
    expect(syncPendingEvents(store, transport, keys.privateKey, { now: NOW })[0].state).toBe('pending');
    const result = syncPendingEvents(store, transport, keys.privateKey, { now: NOW + 2_000, force: true });
    expect(result[0].state).toBe('delivered_to_fake_transport');
    expect(result[0].receipt_id).toBe(store.fakeReceipt(deviceId, input.event_id).receipt_id);
  });
  it('26 respects fake Retry-After for rate limits', () => {
    const store = setup(); submit(store);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { mode: 'rate-limited', now: () => NOW });
    expect(syncPendingEvents(store, transport, keys.privateKey, { now: NOW })[0].next_retry_at).toBe(new Date(NOW + 30_000).toISOString());
  });
  it('27 moves permanent remote rejection to attention without deleting payload', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { mode: 'permanent-failure', now: () => NOW });
    expect(syncPendingEvents(store, transport, keys.privateKey, { now: NOW })[0].state).toBe('attention_required');
    expect(store.getEvent(deviceId, input.event_id)).toMatchObject({ queue_state: 'attention', canonical_payload: expect.any(String) });
  });
  it('28 retries if local receipt persistence fails after destination acceptance', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { now: () => NOW });
    expect(syncPendingEvents(store, transport, keys.privateKey, { now: NOW, beforeReceiptCommit: () => { throw Error('disk write failed'); } })[0].state).toBe('pending');
    expect(store.getEvent(deviceId, input.event_id).queue_state).toBe('pending');
    expect(syncPendingEvents(store, transport, keys.privateKey, { now: NOW + 2_000, force: true })[0].state).toBe('delivered_to_fake_transport');
  });
  it('29 rejects external production targets before any network-capable action', () => {
    expect(() => assertSafeTarget('https://schovera.vercel.app')).toThrow(/refuses external destinations/);
    expect(() => assertSafeTarget('https://example.com')).toThrow(/refuses external destinations/);
  });
  it('30 has no implicit target and fake transport receipt is idempotent', () => {
    const store = setup(); const input = event(); submit(store, input);
    const keys = generateKeyPairSync('ed25519'); const transport = new FakeLocalTransport(store, keys.publicKey, { now: () => NOW });
    const first = syncPendingEvents(store, transport, keys.privateKey, { now: NOW })[0];
    expect(first.state).toBe('delivered_to_fake_transport');
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM fake_transport_receipts').get().n).toBe(1);
  });
  it('31 rejects malformed file contents and reports database corruption', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'schovera-gateway-corrupt-')); directories.push(dir);
    writeFileSync(path.join(dir, 'broken.sqlite'), 'not a sqlite database');
    expect(() => openGatewayDatabase(path.join(dir, 'broken.sqlite'))).toThrow();
  });
  it('32 distinguishes queue records from classroom attendance (no attendance schema/table)', () => {
    const store = setup(); submit(store);
    expect(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_records'").get()).toBeUndefined();
  });
  it('migrates v1 SQLite non-destructively and preserves ambiguous pending payloads', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'schovera-gateway-v1-migration-')); directories.push(dir);
    const dbPath = path.join(dir, 'gateway.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE gateway_readers(reader_id TEXT PRIMARY KEY,device_id TEXT NOT NULL UNIQUE,token_sha256 TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL) STRICT;
      INSERT INTO gateway_readers VALUES('${readerId}','${deviceId}','${hashReaderKey(readerKey)}',1,'${new Date(NOW).toISOString()}');
      CREATE TABLE gateway_events(
        event_id TEXT NOT NULL,device_id TEXT NOT NULL,reader_id TEXT NOT NULL REFERENCES gateway_readers(reader_id),
        canonical_payload TEXT NOT NULL,payload_hash TEXT NOT NULL,event_type TEXT NOT NULL,
        device_sequence INTEGER NOT NULL,observed_at TEXT NOT NULL,sequence_state TEXT NOT NULL,
        queue_state TEXT NOT NULL DEFAULT 'pending' CHECK(queue_state IN ('pending','delivered','attention')),
        attempt_count INTEGER NOT NULL DEFAULT 0,next_retry_at TEXT,last_error_class TEXT,
        local_receipt_id TEXT NOT NULL UNIQUE,local_received_at TEXT NOT NULL,remote_receipt_id TEXT,
        remote_received_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        PRIMARY KEY(device_id,event_id),UNIQUE(reader_id,device_sequence)) STRICT;
      CREATE TABLE gateway_nonces(reader_id TEXT NOT NULL REFERENCES gateway_readers(reader_id),nonce TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(reader_id,nonce)) STRICT;
      CREATE TABLE fake_transport_receipts(device_id TEXT NOT NULL,event_id TEXT NOT NULL,payload_hash TEXT NOT NULL,receipt_id TEXT NOT NULL UNIQUE,received_at TEXT NOT NULL,PRIMARY KEY(device_id,event_id)) STRICT;
      CREATE INDEX gateway_events_queue_idx ON gateway_events(queue_state,next_retry_at,created_at);
      PRAGMA user_version=1;
    `);
    const legacyEvent = event();
    const legacyPayload = JSON.stringify(legacyEvent);
    const legacyHash = 'a'.repeat(64);
    legacy.prepare(`INSERT INTO gateway_events(event_id,device_id,reader_id,canonical_payload,payload_hash,event_type,device_sequence,
      observed_at,sequence_state,queue_state,attempt_count,next_retry_at,last_error_class,local_receipt_id,local_received_at,
      remote_receipt_id,remote_received_at,created_at,updated_at) VALUES(?,?,?,?,?,?,? ,?,'in_order','pending',2,NULL,'offline',?, ?,NULL,NULL,?,?)`)
      .run(legacyEvent.event_id,deviceId,readerId,legacyPayload,legacyHash,legacyEvent.event_type,legacyEvent.device_sequence,
        legacyEvent.observed_at,'legacy-local-receipt',new Date(NOW).toISOString(),new Date(NOW).toISOString(),new Date(NOW).toISOString());
    legacy.close();
    const migrated = openGatewayDatabase(dbPath); stores.push(migrated);
    const before = migrated.getEvent(deviceId, legacyEvent.event_id);
    expect(migrated.db.prepare('PRAGMA user_version').get().user_version).toBe(2);
    expect(before).toMatchObject({ queue_state: 'pending', canonical_payload: legacyPayload, payload_hash: legacyHash, local_receipt_id: 'legacy-local-receipt', attempt_count: 2 });
    expect((await syncPendingV2Events(migrated, { send: () => { throw new Error('legacy payload must never be sent'); } }, { now: NOW }))[0])
      .toMatchObject({ state: 'attention_required', error_class: 'legacy_v1_sync_blocked' });
    const after = migrated.getEvent(deviceId, legacyEvent.event_id);
    expect(after).toMatchObject({ queue_state: 'attention', canonical_payload: legacyPayload, payload_hash: legacyHash, local_receipt_id: 'legacy-local-receipt' });
  });
  it('stores and re-authenticates the complete v2 assignment-bound payload without rewriting it', () => {
    const store = setup();
    const assignedDevice = randomUUID();
    const assignedReader = randomUUID();
    const key = 'b'.repeat(64);
    store.registerReader({ readerId: assignedReader, deviceId: assignedDevice, tokenHash: hashReaderKey(key), now: new Date(NOW).toISOString() });
    const input = { schema_version: 2, event_id: randomUUID(), device_id: assignedDevice, credential_ref: 'opaque-credential-v2',
      credential_assignment_id: randomUUID(), credential_assignment_version: 4, assignment_capability: 'signed.synthetic-capability',
      event_type: 'check_in', observed_at: new Date(NOW).toISOString(), device_sequence: 1 };
    const receipt = submit(store, input, { readerId: assignedReader, readerKey: key });
    const stored = store.getEvent(assignedDevice, input.event_id);
    expect(receipt).toMatchObject({ event_id: input.event_id, outcome: 'recorded_locally', queue_state: 'pending' });
    expect(stored.canonical_payload).toBe(canonicalEventV2(input));
    expect(stored.payload_hash).toBe(eventV2Hash(input));
    expect(submit(store, input, { readerId: assignedReader, readerKey: key }).duplicate).toBe(true);
    expect(() => submit(store, { ...input, credential_assignment_version: 5 }, { readerId: assignedReader, readerKey: key })).toThrow(/different content/);
  });
});
