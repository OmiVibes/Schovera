// Synthetic gateway-only CLI: never loads .env files, Supabase keys or operator passwords.
import { readFileSync } from 'node:fs';
import { createPrivateKey, randomUUID } from 'node:crypto';
import path from 'node:path';
import { manualPaths } from './manual-demo.mjs';
import { openGatewayDatabase } from './rfid-gateway/storage.mjs';
import { hashReaderKey, signReaderSubmission, ingestReaderSubmission } from './rfid-gateway/ingress.mjs';
import { LocalSupabaseV2Transport, assertLoopbackApiUrl, syncPendingV2Events } from './rfid-gateway/local-v2-transport.mjs';
import { RetryableTransportError } from './rfid-gateway/transport.mjs';

const command = process.argv[2]; let store;
try {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY || process.env.OPENAI_API_KEY) throw new Error('Gateway refuses inherited service/issuer/AI credentials; use a clean terminal environment');
  if (!['queue', 'offline', 'status', 'sync', 'duplicate'].includes(command)) throw new Error('Choose queue, offline, status, sync or duplicate');
  const { runDirectory, enrollmentPath } = manualPaths();
  const enrollment = JSON.parse(readFileSync(enrollmentPath, 'utf8'));
  if (enrollment.mode !== 'synthetic_local_only') throw new Error('Synthetic enrollment required');
  assertLoopbackApiUrl(enrollment.target);
  store = openGatewayDatabase(path.join(runDirectory, 'manual-outbox.sqlite'));
  if (!store.getReader(enrollment.readerId)) store.registerReader({ readerId: enrollment.readerId, deviceId: enrollment.deviceId, tokenHash: hashReaderKey(enrollment.readerKey), now: new Date().toISOString() });
  if (command === 'queue') {
    const event = { schema_version: 2, event_id: randomUUID(), device_id: enrollment.deviceId, credential_ref: enrollment.credentialRef, credential_assignment_id: enrollment.assignmentId, credential_assignment_version: 1, assignment_capability: enrollment.capability, event_type: 'check_in', observed_at: new Date().toISOString(), device_sequence: Math.max(Number(store.sequenceMaximum(enrollment.readerId)), enrollment.initialSequence ?? 0) + 1, gateway_receipt_id: randomUUID() };
    const ack = ingestReaderSubmission(store, { ...signReaderSubmission(event, { readerId: enrollment.readerId, key: enrollment.readerKey }), readerKey: enrollment.readerKey });
    console.log(JSON.stringify({ synthetic: true, localAcknowledgement: ack.outcome, queue: store.summary() }));
  } else if (command === 'offline' || command === 'sync') {
    const transport = command === 'offline' ? { async send() { throw new RetryableTransportError('simulated_offline'); } } : new LocalSupabaseV2Transport({ target: enrollment.target, devicePrivateKey: createPrivateKey(enrollment.devicePrivateKey) });
    const results = await syncPendingV2Events(store, transport, { force: true });
    console.log(JSON.stringify({ synthetic: true, mode: command, results, queue: store.summary() }, null, 2));
  } else if (command === 'duplicate') {
    const row = store.db.prepare('select canonical_payload from gateway_events order by device_sequence desc limit 1').get();
    if (!row) throw new Error('Queue an event first');
    const transport = new LocalSupabaseV2Transport({ target: enrollment.target, devicePrivateKey: createPrivateKey(enrollment.devicePrivateKey) });
    const receipt = await transport.send(JSON.parse(row.canonical_payload));
    console.log(JSON.stringify({ synthetic: true, canonicalRetry: receipt }, null, 2));
  } else console.log(JSON.stringify({ synthetic: true, reopenedFromDisk: true, queue: store.summary() }, null, 2));
} catch (error) { console.error(`Synthetic gateway stopped: ${error.message}`); process.exitCode = 1; }
finally { store?.close(); }
