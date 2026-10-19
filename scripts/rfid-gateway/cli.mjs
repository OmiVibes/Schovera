import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { openRuntime } from './runtime.mjs';
import { signReaderSubmission, ingestReaderSubmission, LocalAcknowledgementLost } from './ingress.mjs';
import { FakeLocalTransport, syncPendingEvents } from './transport.mjs';
import { assertSafeTarget } from '../rfid-simulator/core.ts';

const [command, ...args] = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const has = (name) => args.includes(name);

if (has('--target')) {
  try {
    assertSafeTarget(value('--target', undefined));
    throw new Error('gateway simulator has no network delivery mode; use only its in-process fake transport');
  } catch (error) {
    console.error(`Gateway target refused: ${error.message}`);
    process.exitCode = 2;
  }
} else if (!['init', 'status', 'simulate', 'sync', 'revoke-reader'].includes(command)) {
  console.error('Usage: node cli.mjs <init|status|simulate|sync|revoke-reader> [options]');
  process.exitCode = 2;
} else {
  let runtime;
  try {
    runtime = openRuntime();
    const { store, identity } = runtime;
    if (command === 'init') {
      console.log('Local synthetic gateway initialized. Reader secret stored in the ignored .local directory (not displayed).');
    } else if (command === 'status') {
      console.log(JSON.stringify({ mode: 'synthetic_local_only', storage: 'SQLite WAL', queue: store.summary() }, null, 2));
    } else if (command === 'simulate') {
      let event;
      if (has('--retry-event')) {
        const row = store.getEvent(identity.device_id, value('--retry-event', ''));
        if (!row) throw new Error('retry event was not found in this local queue');
        event = JSON.parse(row.canonical_payload);
      } else {
        const previous = Number(store.sequenceMaximum(identity.reader_id));
        event = {
          schema_version: 1,
          event_id: value('--event-id', randomUUID()),
          device_id: identity.device_id,
          credential_ref: 'cred-synth-local-only',
          event_type: value('--type', 'check_in'),
          observed_at: value('--observed-at', new Date().toISOString()),
          device_sequence: previous + 1,
        };
      }
      if (has('--retry-event') && (has('--type') || has('--event-id') || has('--observed-at'))) {
        throw new Error('--retry-event cannot be combined with payload-changing options');
      }
      const submission = signReaderSubmission(event, { readerId: identity.reader_id, key: identity.reader_key });
      submission.readerKey = identity.reader_key;
      try {
        const receipt = ingestReaderSubmission(store, submission, {
          ...(has('--fault-before-commit') ? { beforeCommit: () => { throw new Error('injected pre-commit failure'); } } : {}),
          ...(has('--fault-lost-local-ack') ? { afterCommitBeforeAck: () => { throw new Error('injected local acknowledgement loss'); } } : {}),
        });
        console.log(JSON.stringify(receipt, null, 2));
      } catch (error) {
        if (!(error instanceof LocalAcknowledgementLost)) throw error;
        console.log(JSON.stringify({ status: 'acknowledgement_lost_after_durable_commit', event_id: error.eventId,
          instruction: 'retry the same event ID; the gateway returns the persisted receipt' }, null, 2));
      }
    } else if (command === 'sync') {
      const mode = value('--mode', 'accept');
      if (!['accept', 'offline', 'rate-limited', 'permanent-failure', 'lose-response'].includes(mode)) {
        throw new Error('unsupported fake transport mode');
      }
      const keys = generateKeyPairSync('ed25519');
      const transport = new FakeLocalTransport(store, keys.publicKey, { mode });
      const results = syncPendingEvents(store, transport, keys.privateKey, {
        force: has('--force'),
        random: () => 0.5,
        ...(has('--max-attempts') ? { maxAttempts: Number(value('--max-attempts', '8')) } : {}),
      });
      console.log(JSON.stringify({ destination: 'in-process fake; no network', mode, results, queue: store.summary() }, null, 2));
    } else if (command === 'revoke-reader') {
      console.log(JSON.stringify({ revoked: store.revokeReader(identity.reader_id) }, null, 2));
    }
  } catch (error) {
    console.error(`Gateway command failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    runtime?.store.close();
  }
}
