import { createHash, randomUUID, sign, verify } from 'node:crypto';
import { canonicalEvent, eventHash } from '../rfid-simulator/core.ts';

export class RetryableTransportError extends Error {
  constructor(errorClass, retryAfterMs = null) {
    super(errorClass);
    this.name = 'RetryableTransportError';
    this.errorClass = errorClass;
    this.retryAfterMs = retryAfterMs;
  }
}

export class AttentionTransportError extends Error {
  constructor(errorClass) {
    super(errorClass);
    this.name = 'AttentionTransportError';
    this.errorClass = errorClass;
  }
}

function authMessage(event, timestamp, nonce) {
  const body = canonicalEvent(event);
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return {
    body,
    bodyHash,
    message: `POST\n/api/device/v1/events\n${timestamp}\n${nonce}\n${bodyHash}`,
  };
}

export function createFutureRequestAuth(event, privateKey, { timestamp = Date.now(), nonce = randomUUID() } = {}) {
  const canonical = authMessage(event, String(timestamp), nonce);
  return {
    timestamp: String(timestamp),
    nonce,
    payload_hash: canonical.bodyHash,
    signature: sign(null, Buffer.from(canonical.message), privateKey).toString('base64'),
  };
}

/** A deterministic, persistent fake destination. It never performs network I/O. */
export class FakeLocalTransport {
  constructor(store, publicKey, { mode = 'accept', now = () => Date.now() } = {}) {
    this.store = store;
    this.publicKey = publicKey;
    this.mode = mode;
    this.now = now;
    this.lostResponseOnce = mode === 'lose-response';
    this.seenNonces = new Set();
  }

  send(event, auth) {
    const now = this.now();
    if (!/^\d{13}$/.test(auth.timestamp) || Math.abs(now - Number(auth.timestamp)) > 5 * 60_000) {
      throw new AttentionTransportError('stale_request_auth');
    }
    if (!auth.nonce || this.seenNonces.has(auth.nonce)) throw new AttentionTransportError('request_nonce_replay');
    const canonical = authMessage(event, auth.timestamp, auth.nonce);
    if (canonical.bodyHash !== auth.payload_hash || !verify(null, Buffer.from(canonical.message), this.publicKey, Buffer.from(auth.signature, 'base64'))) {
      throw new AttentionTransportError('request_signature_invalid');
    }
    this.seenNonces.add(auth.nonce);

    if (this.mode === 'offline') throw new RetryableTransportError('destination_unavailable');
    if (this.mode === 'rate-limited') throw new RetryableTransportError('rate_limited', 30_000);
    if (this.mode === 'permanent-failure') throw new AttentionTransportError('destination_rejected');

    let receipt = this.store.fakeReceipt(event.device_id, event.event_id);
    const duplicate = Boolean(receipt);
    const payloadHash = eventHash(event);
    if (receipt && receipt.payload_hash !== payloadHash) throw new AttentionTransportError('remote_event_conflict');
    if (!receipt) {
      receipt = {
        receipt_id: `fake-${randomUUID()}`,
        received_at: new Date(now).toISOString(),
        payload_hash: payloadHash,
      };
      this.store.transaction(() => this.store.insertFakeReceipt(
        event.device_id, event.event_id, payloadHash, receipt.receipt_id, receipt.received_at,
      ));
    }
    if (this.lostResponseOnce) {
      this.lostResponseOnce = false;
      throw new RetryableTransportError('response_lost_after_fake_acceptance');
    }
    return { receipt_id: receipt.receipt_id, received_at: receipt.received_at, duplicate };
  }
}

export function retryDelayMs(attempt, { retryAfterMs = null, random = Math.random, baseMs = 1_000, capMs = 60_000 } = {}) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return Math.min(capMs, retryAfterMs);
  const boundedAttempt = Math.max(0, Math.min(20, attempt - 1));
  const ceiling = Math.min(capMs, baseMs * (2 ** boundedAttempt));
  return Math.floor(ceiling * (0.5 + random()));
}

export function syncPendingEvents(store, transport, privateKey, {
  now = Date.now(),
  limit = 100,
  force = false,
  maxAttempts = 8,
  random = Math.random,
  beforeReceiptCommit,
} = {}) {
  const results = [];
  for (const row of store.duePending(new Date(now).toISOString(), limit, force)) {
    store.startAttempt(row.device_id, row.event_id, new Date(now).toISOString());
    const attempt = row.attempt_count + 1;
    const event = JSON.parse(row.canonical_payload);
    try {
      const auth = createFutureRequestAuth(event, privateKey, { timestamp: now });
      const receipt = transport.send(event, auth);
      store.markDelivered(row.device_id, row.event_id, receipt, new Date(now).toISOString(), beforeReceiptCommit);
      results.push({ event_id: row.event_id, state: 'delivered_to_fake_transport', receipt_id: receipt.receipt_id });
    } catch (error) {
      if (error instanceof RetryableTransportError) {
        if (attempt >= maxAttempts) {
          store.markAttention(row.device_id, row.event_id, { errorClass: 'retry_limit_exceeded', now: new Date(now).toISOString() });
          results.push({ event_id: row.event_id, state: 'attention_required', error_class: 'retry_limit_exceeded' });
          continue;
        }
        const delay = retryDelayMs(attempt, { retryAfterMs: error.retryAfterMs, random });
        const nextRetryAt = new Date(now + delay).toISOString();
        store.recordRetry(row.device_id, row.event_id, { nextRetryAt, errorClass: error.errorClass, now: new Date(now).toISOString() });
        results.push({ event_id: row.event_id, state: 'pending', error_class: error.errorClass, next_retry_at: nextRetryAt });
        continue;
      }
      const errorClass = error instanceof AttentionTransportError ? error.errorClass : 'local_receipt_write_failed';
      // A local receipt commit failure is retryable: the fake/remote destination may
      // already have accepted the immutable event, so the next attempt deduplicates.
      if (!(error instanceof AttentionTransportError) && attempt < maxAttempts) {
        const delay = retryDelayMs(attempt, { random });
        const nextRetryAt = new Date(now + delay).toISOString();
        store.recordRetry(row.device_id, row.event_id, { nextRetryAt, errorClass, now: new Date(now).toISOString() });
        results.push({ event_id: row.event_id, state: 'pending', error_class: errorClass, next_retry_at: nextRetryAt });
        continue;
      }
      store.markAttention(row.device_id, row.event_id, { errorClass, now: new Date(now).toISOString() });
      results.push({ event_id: row.event_id, state: 'attention_required', error_class: errorClass });
    }
  }
  return results;
}
