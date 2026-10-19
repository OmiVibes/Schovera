import { readFile } from 'node:fs/promises';
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
const processor = new LocalEventProcessor();
const samplePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-events.jsonl');
const filePath = valueAfter('--file') ?? samplePath;
const events = parseEventLines(await readFile(filePath, 'utf8'));
const batchError = validateBatch(events);
if (batchError) throw new Error(batchError);
const [checkIn, checkOut] = events;

function print(title, data) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(data, null, 2));
}

switch (scenario) {
  case 'normal':
    print('Synthetic check-in', processor.process(checkIn));
    print('Synthetic check-out', processor.process(checkOut));
    break;
  case 'duplicate':
    print('First delivery', processor.process(checkIn));
    print('Exact network retry', processor.process(checkIn));
    break;
  case 'conflict':
    print('First delivery', processor.process(checkIn));
    print('Changed payload reusing event ID', processor.process({ ...checkIn, event_type: 'check_out' }));
    break;
  case 'out-of-order':
    print('Sequence 2 arrives first', processor.process(checkOut));
    print('Sequence 1 arrives later', processor.process(checkIn));
    break;
  case 'unknown':
    print('Unknown synthetic credential', processor.process({ ...checkIn, credential_ref: 'cred-synth-unknown' }));
    break;
  case 'revoked':
    processor.setCredentialState('cred-synth-001', 'revoked');
    print('Revoked synthetic credential', processor.process(checkIn));
    break;
  case 'invalid':
    print('Invalid schema version', processor.process({ ...checkIn, schema_version: 99 }));
    break;
  case 'offline-replay': {
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

console.log('\nSimulation only — synthetic data, no hardware, network, Supabase, or attendance records were used.');
