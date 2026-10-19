import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { canonicalEvent, eventHash, validateEvent } from '../rfid-simulator/core.ts';

const MAX_EVENT_BYTES = 16 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export class GatewayRejection extends Error {
  constructor(code, message) { super(message); this.name = 'GatewayRejection'; this.code = code; }
}

export class LocalAcknowledgementLost extends Error {
  constructor(eventId) {
    super(`event ${eventId} committed, but its local acknowledgement was lost`);
    this.name = 'LocalAcknowledgementLost';
    this.eventId = eventId;
  }
}

function signingText({ readerId, timestamp, nonce, payloadHash }) {
  return `POST\n/gateway/v1/events\n${readerId}\n${timestamp}\n${nonce}\n${payloadHash}`;
}

export function hashReaderKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function signReaderSubmission(event, { readerId, key, timestamp = Date.now(), nonce = randomUUID() }) {
  const payloadHash = eventHash(event);
  const signature = createHmac('sha256', key).update(signingText({ readerId, timestamp, nonce, payloadHash })).digest('hex');
  return { readerId, timestamp: String(timestamp), nonce, signature, event };
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function ingestReaderSubmission(store, submission, {
  now = Date.now(),
  beforeCommit,
  afterCommitBeforeAck,
} = {}) {
  const validation = validateEvent(submission?.event);
  if (!validation.ok) throw new GatewayRejection('invalid_event', validation.error);
  const event = validation.event;
  const canonicalPayload = canonicalEvent(event);
  if (Buffer.byteLength(canonicalPayload, 'utf8') > MAX_EVENT_BYTES) {
    throw new GatewayRejection('event_too_large', 'event exceeds the local 16 KiB limit');
  }

  const reader = store.getReader(submission.readerId);
  if (!reader || !reader.active) throw new GatewayRejection('reader_unauthorized', 'synthetic reader is unknown or revoked');
  if (event.device_id !== reader.device_id) throw new GatewayRejection('reader_identity_mismatch', 'event device identity does not match the authenticated reader');
  if (!/^\d{13}$/.test(submission.timestamp) || Math.abs(now - Number(submission.timestamp)) > MAX_CLOCK_SKEW_MS) {
    throw new GatewayRejection('stale_authentication', 'local reader authentication timestamp is outside the allowed window');
  }
  if (typeof submission.nonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(submission.nonce)) {
    throw new GatewayRejection('invalid_nonce', 'local reader nonce is invalid');
  }
  const expected = createHmac('sha256', submission.readerKey)
    .update(signingText({ readerId: submission.readerId, timestamp: submission.timestamp, nonce: submission.nonce, payloadHash: eventHash(event) }))
    .digest('hex');
  if (!constantTimeEqual(expected, submission.signature)) throw new GatewayRejection('invalid_authentication', 'local reader authentication failed');
  if (hashReaderKey(submission.readerKey) !== reader.token_sha256) throw new GatewayRejection('invalid_authentication', 'local reader authentication failed');

  const prior = store.getEvent(event.device_id, event.event_id);
  if (prior) {
    if (prior.payload_hash !== eventHash(event)) throw new GatewayRejection('event_conflict', 'event ID was already used with different content');
    return acknowledgement(prior, true);
  }
  if (store.nonceExists(reader.reader_id, submission.nonce)) throw new GatewayRejection('nonce_replay', 'local reader nonce has already been used');
  if (store.eventCount() >= store.maxEvents) throw new GatewayRejection('queue_capacity', 'local queue is full; use the manual recording process');
  if (store.sequenceExists(reader.reader_id, event.device_sequence)) {
    throw new GatewayRejection('duplicate_sequence', 'reader sequence was already used by a different event');
  }

  const maximum = store.sequenceMaximum(reader.reader_id);
  const sequenceState = event.device_sequence === maximum + 1
    ? 'in_order'
    : event.device_sequence > maximum + 1 ? 'gap' : 'out_of_order';
  const receivedAt = new Date(now).toISOString();
  const receiptId = randomUUID();
  try {
    store.transaction(() => {
      store.recordNonce(reader.reader_id, submission.nonce, receivedAt);
      store.insertPending({
        event,
        readerId: reader.reader_id,
        canonicalPayload,
        payloadHash: eventHash(event),
        sequenceState,
        receiptId,
        now: receivedAt,
      });
      beforeCommit?.();
    });
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new GatewayRejection('duplicate_sequence', 'reader sequence or local event identity is already in use');
    }
    throw error;
  }

  const committed = store.getEvent(event.device_id, event.event_id);
  try { afterCommitBeforeAck?.(); } catch { throw new LocalAcknowledgementLost(event.event_id); }
  return acknowledgement(committed, false);
}

function acknowledgement(row, duplicate) {
  return {
    local_receipt_id: row.local_receipt_id,
    event_id: row.event_id,
    outcome: 'recorded_locally',
    queue_state: row.queue_state,
    sequence_state: row.sequence_state,
    duplicate,
    cloud_delivered: row.queue_state === 'delivered',
    received_at: row.local_received_at,
  };
}
