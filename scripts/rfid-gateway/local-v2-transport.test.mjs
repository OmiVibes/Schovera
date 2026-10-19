import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyDeviceSignature } from '../../src/lib/rfid/server.ts';
import { openGatewayDatabase } from './storage.mjs';
import { hashReaderKey, ingestReaderSubmission, signReaderSubmission } from './ingress.mjs';
import { LocalSupabaseV2Transport, assertLoopbackApiUrl, syncPendingV2Events } from './local-v2-transport.mjs';
import { canonicalEventV2, eventV2Hash } from '../rfid-simulator/event-v2.ts';

const dirs = [];
const stores = [];
const now = Date.now();
const receipt = (event, extra = {}) => {
  const payload = {
  receipt_id: randomUUID(), event_id: event.event_id, outcome: 'accepted', sequence_state: 'in_order',
    received_at: new Date().toISOString(), duplicate: false, ...extra,
  };
  return { status: payload.duplicate ? 200 : 202, headers: {}, body: JSON.stringify(payload) };
};

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'schovera-v2-transport-')); dirs.push(dir);
  const store = openGatewayDatabase(path.join(dir, 'gateway.sqlite')); stores.push(store);
  const deviceId = randomUUID(); const readerId = randomUUID(); const readerKey = 'c'.repeat(64);
  store.registerReader({ readerId, deviceId, tokenHash: hashReaderKey(readerKey), now: new Date(now).toISOString() });
  const event = { schema_version: 2, event_id: randomUUID(), device_id: deviceId, credential_ref: 'opaque-ref-test',
    credential_assignment_id: randomUUID(), credential_assignment_version: 1, assignment_capability: 'synthetic.valid-shape',
    event_type: 'check_in', observed_at: new Date(now).toISOString(), device_sequence: 1 };
  const submission = signReaderSubmission(event, { readerId, key: readerKey, timestamp: now });
  submission.readerKey = readerKey;
  const local = ingestReaderSubmission(store, submission, { now });
  return { store, dir, deviceId, event, local };
}

afterEach(() => {
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* best effort test cleanup */ } }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loopback local event-v2 transport', () => {
  it('accepts only explicit HTTP loopback API URLs', () => {
    expect(assertLoopbackApiUrl('http://127.0.0.1:3000').hostname).toBe('127.0.0.1');
    expect(assertLoopbackApiUrl('http://localhost:3000').hostname).toBe('localhost');
    for (const url of ['https://127.0.0.1:3000', 'http://schovera.vercel.app', 'http://127.0.0.2:3000',
      'http://user:pass@127.0.0.1:3000', 'http://127.0.0.1:3000/path', 'http://127.0.0.1:3000/?x=1']) {
      expect(() => assertLoopbackApiUrl(url)).toThrow(/loopback/);
    }
  });

  it('signs exact canonical v2 bytes and validates a matching definitive receipt', async () => {
    const { event } = setup();
    const pair = generateKeyPairSync('ed25519'); const calls = [];
    const transport = new LocalSupabaseV2Transport({ target: 'http://127.0.0.1:3000', devicePrivateKey: pair.privateKey,
      request: async (url, body, headers) => {
        calls.push({ url, body, headers });
        expect(body).toBe(canonicalEventV2(event));
        expect(verifyDeviceSignature(pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), headers['x-schovera-signature'],
          'POST', headers['x-schovera-timestamp'], headers['x-schovera-nonce'], body, '/api/device/v2/events')).toBe(true);
        return receipt(event);
      } });
    const result = await transport.send(event);
    expect(result).toMatchObject({ event_id: event.event_id, outcome: 'accepted', duplicate: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.hostname).toBe('127.0.0.1');
  });

  it('refuses redirects, malformed responses, mismatched receipt identity and conflicts', async () => {
    const { event } = setup();
    const pair = generateKeyPairSync('ed25519');
    const make = (request) => new LocalSupabaseV2Transport({ target: 'http://127.0.0.1:3000', devicePrivateKey: pair.privateKey, request });
    await expect(make(async () => ({ status: 307, headers: { location: 'https://schovera.vercel.app' }, body: '' })).send(event))
      .rejects.toMatchObject({ errorClass: 'redirect_refused' });
    await expect(make(async () => ({ ...receipt(event), body: JSON.stringify({ ...JSON.parse(receipt(event).body), event_id: randomUUID() }) })).send(event))
      .rejects.toMatchObject({ errorClass: 'invalid_server_receipt' });
    await expect(make(async () => ({ status: 409, headers: {}, body: '{}' })).send(event))
      .rejects.toMatchObject({ errorClass: 'server_event_or_nonce_conflict' });
    await expect(make(async () => { throw new Error('request_timeout'); }).send(event))
      .rejects.toMatchObject({ errorClass: 'request_timeout' });
  });

  it('does not make v1 payloads into v2 and preserves them for review', async () => {
    const { store, event: v2, deviceId } = setup();
    const legacy = { schema_version: 1, event_id: randomUUID(), device_id: deviceId, credential_ref: 'legacy-ref',
      event_type: 'check_in', observed_at: new Date(now).toISOString(), device_sequence: 2 };
    const submission = signReaderSubmission(legacy, { readerId: store.getEvent(deviceId, v2.event_id).reader_id, key: 'c'.repeat(64), timestamp: now });
    submission.readerKey = 'c'.repeat(64);
    ingestReaderSubmission(store, submission, { now });
    const legacyPayload = JSON.stringify(legacy);
    const results = await syncPendingV2Events(store, { send: async () => { throw new Error('must not send v1'); } }, { now, force: true });
    expect(results).toContainEqual(expect.objectContaining({ event_id: legacy.event_id, state: 'attention_required', error_class: 'legacy_v1_sync_blocked' }));
    expect(store.getEvent(deviceId, legacy.event_id)).toMatchObject({ queue_state: 'attention', canonical_payload: legacyPayload });
  });

  it('persists an accepted server receipt only after validation and retries an unknown response', async () => {
    const { store, event } = setup(); const pair = generateKeyPairSync('ed25519'); let calls = 0; const nonces = new Set();
    const transport = new LocalSupabaseV2Transport({ target: 'http://127.0.0.1:3000', devicePrivateKey: pair.privateKey,
      request: async (_url, _body, headers) => {
        calls += 1; nonces.add(headers['x-schovera-nonce']);
        if (calls === 1) throw new Error('request_timeout');
        return receipt(event, { duplicate: true });
      } });
    // An exact event accepted before a lost response returns 200 + duplicate on retry.
    const first = await syncPendingV2Events(store, transport, { force: true });
    expect(first[0].state).toBe('pending');
    const rowPending = store.getEvent(event.device_id, event.event_id);
    expect(rowPending).toMatchObject({ queue_state: 'pending', remote_receipt_id: null });
    const second = await syncPendingV2Events(store, transport, { force: true });
    expect(second[0].state).toBe('delivered_to_local_server');
    const row = store.getEvent(event.device_id, event.event_id);
    expect(row).toMatchObject({ queue_state: 'delivered', remote_outcome: 'accepted', remote_receipt_id: expect.any(String) });
    expect(row.canonical_payload).toBe(canonicalEventV2(event));
    expect(row.payload_hash).toBe(eventV2Hash(event));
    expect(calls).toBe(2);
    expect(nonces.size).toBe(2);
  });

  it('commits an unresolved server receipt into attention rather than pretending it resolved', async () => {
    const { store, event } = setup(); const pair = generateKeyPairSync('ed25519'); const unresolved = receipt(event, { outcome: 'unresolved' });
    const transport = new LocalSupabaseV2Transport({ target: 'http://127.0.0.1:3000', devicePrivateKey: pair.privateKey,
      request: async () => unresolved });
    const [result] = await syncPendingV2Events(store, transport, { force: true });
    expect(result).toMatchObject({ state: 'attention_required', outcome: 'unresolved' });
    expect(store.getEvent(event.device_id, event.event_id)).toMatchObject({ queue_state: 'attention', remote_outcome: 'unresolved', remote_receipt_id: expect.any(String) });
  });
});
