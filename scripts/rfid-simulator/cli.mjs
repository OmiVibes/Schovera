import { readFile } from 'node:fs/promises';
import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  assertSafeTarget,
  LocalEventProcessor,
  LocalReplayQueue,
  parseEventLines,
  validateBatch,
} from './core.ts';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const scenario = valueAfter('--scenario') ?? 'normal';
const target = valueAfter('--target');
assertSafeTarget(target);
const localApi = args.includes('--local-api');
if (localApi && (process.env.SCHOVERA_RFID_API_MODE !== 'local' || process.env.SCHOVERA_TEST_MODE !== 'local')) {
  throw new Error('local API simulation requires SCHOVERA_RFID_API_MODE=local and SCHOVERA_TEST_MODE=local');
}
const processor = new LocalEventProcessor();
const samplePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-events.jsonl');
const filePath = valueAfter('--file') ?? samplePath;
const events = parseEventLines(await readFile(filePath, 'utf8'));
const batchError = validateBatch(events);
if (batchError) throw new Error(batchError);
let [checkIn, checkOut] = events;
if (localApi) {
  const start = Number(valueAfter('--sequence-start'));
  if (!Number.isSafeInteger(start) || start < 1) throw new Error('local API mode requires a positive --sequence-start for the provisioned device');
  const deviceId = valueAfter('--device-id');
  const credentialRef = valueAfter('--credential-ref') ?? checkIn.credential_ref;
  checkIn = { ...checkIn, event_id: randomUUID(), device_id: deviceId, credential_ref: credentialRef, device_sequence: start };
  checkOut = { ...checkOut, event_id: randomUUID(), device_id: deviceId, credential_ref: credentialRef, device_sequence: start + 1 };
}

async function deliverLocal(event) {
  if (!localApi) return processor.process(event);
  if (!target || !valueAfter('--device-id') || !valueAfter('--private-key-file')) {
    throw new Error('local API mode requires --target, --device-id, and --private-key-file');
  }
  const deviceId = valueAfter('--device-id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
    throw new Error('--device-id must be the provisioned local device UUID');
  }
  const { validateEvent, canonicalEvent } = await import('./core.ts');
  const checked = validateEvent({ ...event, device_id: deviceId, credential_ref: valueAfter('--credential-ref') ?? event.credential_ref });
  if (!checked.ok) throw new Error(checked.error);
  const body = canonicalEvent(checked.event);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signedMessage = `POST\n/api/device/v1/events\n${timestamp}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`;
  const privateKey = createPrivateKey(await readFile(valueAfter('--private-key-file'), 'utf8'));
  const signature = sign(null, Buffer.from(signedMessage), privateKey).toString('base64');
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-schovera-device-id': deviceId,
      'x-schovera-timestamp': timestamp,
      'x-schovera-nonce': nonce,
      'x-schovera-signature': signature,
    },
    body,
  });
  const result = await response.json().catch(() => ({ error: 'invalid server response' }));
  return { statusCode: response.status, result };
}

function print(title, data) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(data, null, 2));
}

switch (scenario) {
  case 'normal':
    print('Synthetic check-in', await deliverLocal(checkIn));
    print('Synthetic check-out', await deliverLocal(checkOut));
    break;
  case 'duplicate':
    print('First delivery', await deliverLocal(checkIn));
    print('Exact network retry', await deliverLocal(checkIn));
    break;
  case 'conflict':
    print('First delivery', await deliverLocal(checkIn));
    print('Changed payload reusing event ID', await deliverLocal({ ...checkIn, event_type: 'check_out' }));
    break;
  case 'out-of-order':
    print('Sequence 2 arrives first', await deliverLocal(checkOut));
    print('Sequence 1 arrives later', await deliverLocal(checkIn));
    break;
  case 'unknown':
    print('Unknown synthetic credential', await deliverLocal({ ...checkIn, credential_ref: 'cred-synth-unknown' }));
    break;
  case 'revoked':
    if (localApi) throw new Error('revoke the local test credential with the authenticated Principal flow before running this scenario');
    processor.setCredentialState('cred-synth-001', 'revoked');
    print('Revoked synthetic credential', processor.process(checkIn));
    break;
  case 'invalid':
    print('Invalid schema version', processor.process({ ...checkIn, schema_version: 99 }));
    break;
  case 'offline-replay': {
    if (localApi) throw new Error('offline-replay is an in-memory Task 32A scenario; use the local API mode only for delivery scenarios');
    const queue = new LocalReplayQueue();
    queue.enqueue(checkIn);
    print('Destination unavailable; queued item remains pending', { delivered: queue.replay(processor, false), items: queue.items });
    print('Destination restored; replay result', { delivered: queue.replay(processor, true), items: queue.items });
    print('Repeated replay creates no second accepted event', {
      delivered: queue.replay(processor, true), accepted_events: processor.acceptedCount, items: queue.items,
    });
    break;
  }
  default:
    throw new Error(`unknown scenario "${scenario}"; choose normal, duplicate, conflict, out-of-order, unknown, revoked, invalid, or offline-replay`);
}

console.log(localApi
  ? '\nLocal API integration only — synthetic device and credential; no physical hardware or classroom attendance records were used.'
  : '\nSimulation only — synthetic data, no hardware, network, Supabase, or attendance records were used.');
