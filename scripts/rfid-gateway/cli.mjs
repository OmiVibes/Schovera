import { randomUUID, generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openRuntime } from './runtime.mjs';
import { openGatewayDatabase } from './storage.mjs';
import { signReaderSubmission, ingestReaderSubmission, LocalAcknowledgementLost } from './ingress.mjs';
import { FakeLocalTransport, RetryableTransportError, syncPendingEvents } from './transport.mjs';
import { LocalSupabaseV2Transport, assertLoopbackApiUrl, syncPendingV2Events } from './local-v2-transport.mjs';
import { assertSafeTarget } from '../rfid-simulator/core.ts';

const [command, ...args] = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const has = (name) => args.includes(name);
const LCD_ARGS = ['--lcd-event-id','--lcd-device-id','--lcd-port','--lcd-usb-id'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function lcdOptions() {
  const any = LCD_ARGS.some(has) || has('--ack-lcd-reset-risk') || has('--confirm-monitor-closed');
  if (!any) return null;
  if (LCD_ARGS.some(name => !has(name)) || !has('--ack-lcd-reset-risk') || !has('--confirm-monitor-closed')) {
    throw new Error('LCD output requires an exact event, device, stable serial path, USB identity, reset acknowledgement and closed-monitor confirmation');
  }
  const valueSet = Object.fromEntries(LCD_ARGS.map(name => [name, value(name, '')]));
  if (!UUID.test(valueSet['--lcd-event-id']) || !UUID.test(valueSet['--lcd-device-id'])
    || !/^\/dev\/serial\/by-id\/[A-Za-z0-9_.:+-]{1,200}$/.test(valueSet['--lcd-port'])
    || !/^[0-9a-f]{4}:[0-9a-f]{4}:[A-Za-z0-9_.+-]{1,128}$/.test(valueSet['--lcd-usb-id'])) {
    throw new Error('LCD output selection is invalid');
  }
  if (process.platform !== 'linux') throw new Error('LCD serial output is supported only on the Pi Linux gateway');
  return { eventId: valueSet['--lcd-event-id'], deviceId: valueSet['--lcd-device-id'],
    port: valueSet['--lcd-port'], usbId: valueSet['--lcd-usb-id'] };
}

if (has('--target') && command !== 'sync-v2') {
  try {
    assertSafeTarget(value('--target', undefined));
    throw new Error('gateway simulator has no network delivery mode; use only its in-process fake transport');
  } catch (error) {
    console.error(`Gateway target refused: ${error.message}`);
    process.exitCode = 2;
  }
} else if (!['init', 'status', 'simulate', 'sync', 'sync-v2', 'revoke-reader'].includes(command)) {
  console.error('Usage: node cli.mjs <init|status|simulate|sync|sync-v2|revoke-reader> [options]');
  process.exitCode = 2;
} else {
  let runtime;
  try {
    if (command === 'sync-v2') {
      if (!has('--local-only')) throw new Error('sync-v2 requires the explicit --local-only safety flag');
      const target = value('--target', undefined);
      if (!target) throw new Error('sync-v2 requires an explicit --target loopback URL');
      const targetUrl = assertLoopbackApiUrl(target);
      if (process.env.SCHOVERA_TEST_URL && targetUrl.origin !== new URL(process.env.SCHOVERA_TEST_URL).origin) {
        throw new Error('sync target does not match SCHOVERA_TEST_URL');
      }
      const databasePath = value('--database', undefined);
      const keyFile = value('--device-key-file', undefined);
      const lcd = lcdOptions();
      if (!databasePath || !keyFile || !path.isAbsolute(databasePath) || !path.isAbsolute(keyFile)) {
        throw new Error('sync-v2 requires absolute --database and --device-key-file paths; private keys are never accepted as arguments');
      }
      const key = createPrivateKey(readFileSync(keyFile, 'utf8'));
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('device key file must contain an Ed25519 private key');
      const store = openGatewayDatabase(databasePath);
      try {
        const transport = has('--simulate-offline')
          ? { async send() { throw new RetryableTransportError('simulated_offline'); } }
          : new LocalSupabaseV2Transport({ target, devicePrivateKey: key });
        if (lcd) {
          const selected = store.getEvent(lcd.deviceId, lcd.eventId);
          if (!selected || selected.queue_state !== 'pending') throw new Error('selected LCD event is not pending for this device');
          const selectedEvent = JSON.parse(selected.canonical_payload);
          if (selectedEvent.schema_version !== 2 || selectedEvent.device_id !== lcd.deviceId || selectedEvent.event_id !== lcd.eventId) {
            throw new Error('selected LCD event binding does not match the pending v2 event');
          }
        }
        const onDelivered = lcd ? async ({ event, receipt }) => {
          if (event.device_id !== lcd.deviceId || event.event_id !== lcd.eventId) return 'not_selected';
          if (receipt.outcome !== 'accepted' || typeof receipt.student_display_name !== 'string') return 'display_name_unavailable';
          const { buildLcdWelcomeFrame } = await import('../physical-rfid/lcd-protocol.mjs');
          const frame = buildLcdWelcomeFrame(receipt.student_display_name);
          const worker = fileURLToPath(new URL('../physical-rfid/linux-lcd-display.py', import.meta.url));
          const result = spawnSync('/usr/bin/python3', ['-I','-B',worker,lcd.port,lcd.usbId,'ack-reset-risk','monitor-closed'], {
            input: JSON.stringify({ frame }), encoding: 'utf8', windowsHide: true, timeout: 7000, maxBuffer: 1024,
          });
          if (result.error || result.status !== 0) throw new Error('lcd_display_failed');
          let status;
          try { status = JSON.parse(result.stdout); } catch { throw new Error('lcd_display_failed'); }
          return status?.code === 'lcd_command_acknowledged' && status.serialPayloadWrites === 1
            ? 'command_acknowledged' : 'ack_timeout';
        } : undefined;
        const results = await syncPendingV2Events(store, transport, {
          force: has('--force'),
          ...(has('--max-attempts') ? { maxAttempts: Number(value('--max-attempts', '8')) } : {}),
          ...(lcd ? { onlyEvent: { deviceId: lcd.deviceId, eventId: lcd.eventId }, onDelivered } : {}),
        });
        console.log(JSON.stringify({ destination: has('--simulate-offline') ? 'simulated offline; no HTTP request' : 'loopback local Supabase API', results, queue: store.summary() }, null, 2));
      } finally { store.close(); }
    } else {
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
    }
  } catch (error) {
    console.error(`Gateway command failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    runtime?.store.close();
  }
}
