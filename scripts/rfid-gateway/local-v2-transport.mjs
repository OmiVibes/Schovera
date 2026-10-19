import { createHash, randomUUID, sign } from 'node:crypto';
import http from 'node:http';
import { canonicalGatewayEvent } from './event-contract.mjs';
import { AttentionTransportError, RetryableTransportError, retryDelayMs } from './transport.mjs';

const EVENT_PATH = '/api/device/v2/events';
const MAX_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEQUENCE_STATES = new Set(['in_order', 'gap', 'out_of_order']);

export function assertLoopbackApiUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('local API target must be a valid loopback URL'); }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname.toLowerCase()) || url.username || url.password
    || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('local API target must be plain HTTP on a loopback host with no credentials, path, query, or fragment');
  }
  return url;
}

export class DefinitiveRemoteAttention extends Error {
  constructor(receipt, reason) {
    super(reason);
    this.name = 'DefinitiveRemoteAttention';
    this.receipt = receipt;
    this.errorClass = reason;
  }
}

function retryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.min(60 * 60_000, Math.max(0, Number(value) * 1000));
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.min(60 * 60_000, Math.max(0, time - now)) : null;
}

function requestJson(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Node's direct http.request does not consult HTTP(S)_PROXY or follow redirects.
    const request = http.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || 80,
      method: 'POST', path: EVENT_PATH, agent: false,
      headers: { ...headers, 'content-length': Buffer.byteLength(body), host: url.host },
    }, (response) => {
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('request_timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

function parseReceipt(body, event) {
  let data;
  try { data = JSON.parse(body); } catch { throw new AttentionTransportError('invalid_server_receipt'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).some((key) => !['receipt_id', 'event_id', 'outcome', 'sequence_state', 'received_at', 'duplicate'].includes(key))
    || !UUID.test(data.receipt_id ?? '') || !['accepted', 'unresolved'].includes(data.outcome)
    || data.event_id !== event.event_id
    || !SEQUENCE_STATES.has(data.sequence_state) || typeof data.received_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.received_at)
    || !Number.isFinite(Date.parse(data.received_at))
    || typeof data.duplicate !== 'boolean') throw new AttentionTransportError('invalid_server_receipt');
  return { receipt_id: data.receipt_id, outcome: data.outcome, sequence_state: data.sequence_state,
    received_at: data.received_at, duplicate: data.duplicate, event_id: event.event_id };
}

export class LocalSupabaseV2Transport {
  constructor({ target, devicePrivateKey, timeoutMs = 5_000, request = requestJson }) {
    this.url = assertLoopbackApiUrl(target);
    if (!devicePrivateKey) throw new Error('device signing key is required');
    this.devicePrivateKey = devicePrivateKey;
    this.timeoutMs = Math.max(500, Math.min(30_000, timeoutMs));
    this.request = request;
  }

  async send(event) {
    if (event.schema_version !== 2) throw new AttentionTransportError('legacy_v1_sync_blocked');
    const body = canonicalGatewayEvent(event);
    if (Buffer.byteLength(body) > MAX_BYTES) throw new AttentionTransportError('event_too_large');
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    const message = Buffer.from(`POST\n${EVENT_PATH}\n${timestamp}\n${nonce}\n${bodyHash}`, 'utf8');
    const signature = sign(null, message, this.devicePrivateKey).toString('base64');
    let response;
    try {
      response = await this.request(this.url, body, {
        'content-type': 'application/json',
        'x-schovera-device-id': event.device_id,
        'x-schovera-timestamp': timestamp,
        'x-schovera-nonce': nonce,
        'x-schovera-signature': signature,
      }, this.timeoutMs);
    } catch (error) {
      if (error?.message === 'response_too_large') throw new AttentionTransportError('invalid_server_receipt');
      throw new RetryableTransportError(error?.message === 'request_timeout' ? 'request_timeout' : 'local_api_unavailable');
    }
    if (response.status >= 300 && response.status < 400) throw new AttentionTransportError('redirect_refused');
    if (response.status === 429) throw new RetryableTransportError('rate_limited', retryAfterMs(response.headers?.['retry-after']));
    if (response.status >= 500) throw new RetryableTransportError('local_api_server_error');
    if (response.status === 401 || response.status === 403) throw new AttentionTransportError('device_or_capability_revoked');
    if (response.status === 409) throw new AttentionTransportError('server_event_or_nonce_conflict');
    if (response.status === 400 || response.status === 413 || response.status === 415) throw new AttentionTransportError('server_rejected_event');
    if (response.status !== 200 && response.status !== 202) throw new AttentionTransportError('unexpected_server_status');
    const receipt = parseReceipt(response.body, event);
    if ((response.status === 200) !== receipt.duplicate) throw new AttentionTransportError('inconsistent_server_receipt');
    if (receipt.outcome === 'unresolved') throw new DefinitiveRemoteAttention(receipt, 'server_recorded_unresolved_event');
    return receipt;
  }
}

export async function syncPendingV2Events(store, transport, {
  now = Date.now(), limit = 10, force = false, maxAttempts = 8, random = Math.random, beforeReceiptCommit,
} = {}) {
  const rows = store.duePending(new Date(now).toISOString(), Math.min(10, Math.max(1, limit)), force);
  const results = [];
  for (const row of rows) {
    let event;
    try { event = JSON.parse(row.canonical_payload); } catch {
      store.markAttention(row.device_id, row.event_id, { errorClass: 'stored_event_corrupt', now: new Date(now).toISOString() });
      results.push({ event_id: row.event_id, state: 'attention_required', error_class: 'stored_event_corrupt' });
      continue;
    }
    if (event.schema_version !== 2) {
      store.markAttention(row.device_id, row.event_id, { errorClass: 'legacy_v1_sync_blocked', now: new Date(now).toISOString() });
      results.push({ event_id: row.event_id, state: 'attention_required', error_class: 'legacy_v1_sync_blocked' });
      continue;
    }
    store.startAttempt(row.device_id, row.event_id, new Date(now).toISOString());
    const attempt = Number(row.attempt_count) + 1;
    try {
      const receipt = await transport.send(event);
      store.markDelivered(row.device_id, row.event_id, receipt, new Date().toISOString(), beforeReceiptCommit);
      results.push({ event_id: row.event_id, state: 'delivered_to_local_server', receipt_id: receipt.receipt_id, outcome: receipt.outcome });
    } catch (error) {
      if (error instanceof DefinitiveRemoteAttention) {
        store.markRemoteAttention(row.device_id, row.event_id, error.receipt, error.errorClass, new Date().toISOString(), beforeReceiptCommit);
        results.push({ event_id: row.event_id, state: 'attention_required', receipt_id: error.receipt.receipt_id, outcome: error.receipt.outcome });
      } else if (error instanceof RetryableTransportError && attempt < maxAttempts) {
        const delay = retryDelayMs(attempt, { retryAfterMs: error.retryAfterMs, random, capMs: 60 * 60_000 });
        const nextRetryAt = new Date(Date.now() + delay).toISOString();
        store.recordRetry(row.device_id, row.event_id, { nextRetryAt, errorClass: error.errorClass, now: new Date().toISOString() });
        results.push({ event_id: row.event_id, state: 'pending', error_class: error.errorClass, next_retry_at: nextRetryAt });
      } else if (error instanceof RetryableTransportError) {
        store.markAttention(row.device_id, row.event_id, { errorClass: 'retry_limit_exceeded', now: new Date().toISOString() });
        results.push({ event_id: row.event_id, state: 'attention_required', error_class: 'retry_limit_exceeded' });
      } else {
        const code = error instanceof AttentionTransportError ? error.errorClass : 'local_receipt_commit_failed';
        if (!(error instanceof AttentionTransportError) && attempt < maxAttempts) {
          const nextRetryAt = new Date(Date.now() + retryDelayMs(attempt, { random })).toISOString();
          store.recordRetry(row.device_id, row.event_id, { nextRetryAt, errorClass: code, now: new Date().toISOString() });
          results.push({ event_id: row.event_id, state: 'pending', error_class: code, next_retry_at: nextRetryAt });
        } else {
          store.markAttention(row.device_id, row.event_id, { errorClass: code, now: new Date().toISOString() });
          results.push({ event_id: row.event_id, state: 'attention_required', error_class: code });
        }
      }
    }
  }
  return results;
}
