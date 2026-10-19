import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const GATEWAY_SCHEMA_VERSION = 1;

function assertLocalFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('gateway database path is required');
  if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
    throw new Error('gateway storage must be on a local filesystem, not a network share');
  }
}

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* transaction already rolled back by SQLite */ }
    throw error;
  }
}

export function openGatewayDatabase(filePath, { maxEvents = 10_000 } = {}) {
  assertLocalFilePath(filePath);
  const resolved = path.resolve(filePath);
  if (resolved !== ':memory:') mkdirSync(path.dirname(resolved), { recursive: true });

  let db;
  try {
    db = new DatabaseSync(resolved, { timeout: 5_000 });
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = Number(db.prepare('PRAGMA user_version').get().user_version);
    if (version > GATEWAY_SCHEMA_VERSION) {
      throw new Error(`gateway database schema ${version} is newer than this simulator supports (${GATEWAY_SCHEMA_VERSION})`);
    }
    if (version !== 0 && version !== GATEWAY_SCHEMA_VERSION) {
      throw new Error(`gateway database schema ${version} is unsupported; preserve the file for review`);
    }
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integrity !== 'ok') throw new Error(`gateway database integrity check failed: ${integrity}`);

    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    if (version === 0) {
      transaction(db, () => {
        db.exec(`
          CREATE TABLE gateway_readers (
            reader_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL UNIQUE,
            token_sha256 TEXT NOT NULL CHECK(length(token_sha256) = 64),
            active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
            created_at TEXT NOT NULL
          ) STRICT;

          CREATE TABLE gateway_events (
            event_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            reader_id TEXT NOT NULL REFERENCES gateway_readers(reader_id),
            canonical_payload TEXT NOT NULL,
            payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
            event_type TEXT NOT NULL CHECK(event_type IN ('check_in', 'check_out')),
            device_sequence INTEGER NOT NULL CHECK(device_sequence > 0),
            observed_at TEXT NOT NULL,
            sequence_state TEXT NOT NULL CHECK(sequence_state IN ('in_order', 'gap', 'out_of_order')),
            queue_state TEXT NOT NULL DEFAULT 'pending' CHECK(queue_state IN ('pending', 'delivered', 'attention')),
            attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
            next_retry_at TEXT,
            last_error_class TEXT,
            local_receipt_id TEXT NOT NULL UNIQUE,
            local_received_at TEXT NOT NULL,
            remote_receipt_id TEXT,
            remote_received_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (device_id, event_id),
            UNIQUE (reader_id, device_sequence)
          ) STRICT;

          CREATE TABLE gateway_nonces (
            reader_id TEXT NOT NULL REFERENCES gateway_readers(reader_id),
            nonce TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (reader_id, nonce)
          ) STRICT;

          CREATE TABLE fake_transport_receipts (
            device_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
            receipt_id TEXT NOT NULL UNIQUE,
            received_at TEXT NOT NULL,
            PRIMARY KEY (device_id, event_id)
          ) STRICT;

          CREATE INDEX gateway_events_queue_idx ON gateway_events(queue_state, next_retry_at, created_at);
          PRAGMA user_version = ${GATEWAY_SCHEMA_VERSION};
        `);
      });
    }
    db.exec('PRAGMA foreign_keys = ON;');
    const configuredCapacity = Number.isSafeInteger(maxEvents) && maxEvents > 0 ? maxEvents : 10_000;
    return new GatewayStore(db, resolved, configuredCapacity);
  } catch (error) {
    try { db?.close(); } catch { /* preserve the original open/validation failure */ }
    throw error;
  }
}

export class GatewayStore {
  constructor(db, filePath, maxEvents) {
    this.db = db;
    this.filePath = filePath;
    this.maxEvents = maxEvents;
  }

  close() { this.db.close(); }

  transaction(work) { return transaction(this.db, work); }

  registerReader({ readerId, deviceId, tokenHash, now }) {
    this.db.prepare(`INSERT INTO gateway_readers(reader_id, device_id, token_sha256, created_at)
      VALUES (?, ?, ?, ?)`).run(readerId, deviceId, tokenHash, now);
  }

  getReader(readerId) {
    return this.db.prepare('SELECT * FROM gateway_readers WHERE reader_id = ?').get(readerId) ?? null;
  }

  revokeReader(readerId) {
    return this.db.prepare('UPDATE gateway_readers SET active = 0 WHERE reader_id = ? AND active = 1').run(readerId).changes > 0;
  }

  getEvent(deviceId, eventId) {
    return this.db.prepare('SELECT * FROM gateway_events WHERE device_id = ? AND event_id = ?').get(deviceId, eventId) ?? null;
  }

  nonceExists(readerId, nonce) {
    return Boolean(this.db.prepare('SELECT 1 AS found FROM gateway_nonces WHERE reader_id = ? AND nonce = ?').get(readerId, nonce));
  }

  recordNonce(readerId, nonce, now) {
    this.db.prepare('INSERT INTO gateway_nonces(reader_id, nonce, created_at) VALUES (?, ?, ?)').run(readerId, nonce, now);
  }

  sequenceMaximum(readerId) {
    return Number(this.db.prepare('SELECT COALESCE(MAX(device_sequence), 0) AS sequence FROM gateway_events WHERE reader_id = ?').get(readerId).sequence);
  }

  sequenceExists(readerId, sequence) {
    return Boolean(this.db.prepare('SELECT 1 AS found FROM gateway_events WHERE reader_id = ? AND device_sequence = ?').get(readerId, sequence));
  }

  eventCount() {
    return Number(this.db.prepare('SELECT COUNT(*) AS count FROM gateway_events').get().count);
  }

  insertPending({ event, readerId, canonicalPayload, payloadHash, sequenceState, receiptId, now }) {
    this.db.prepare(`INSERT INTO gateway_events(
      event_id, device_id, reader_id, canonical_payload, payload_hash, event_type,
      device_sequence, observed_at, sequence_state, queue_state, local_receipt_id,
      local_received_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .run(event.event_id, event.device_id, readerId, canonicalPayload, payloadHash,
        event.event_type, event.device_sequence, event.observed_at, sequenceState,
        receiptId, now, now, now);
  }

  listEvents({ state, limit = 100 } = {}) {
    const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
    if (state) return this.db.prepare(`SELECT * FROM gateway_events WHERE queue_state = ? ORDER BY created_at, device_sequence LIMIT ?`).all(state, bounded);
    return this.db.prepare('SELECT * FROM gateway_events ORDER BY created_at, device_sequence LIMIT ?').all(bounded);
  }

  duePending(now, limit = 100, force = false) {
    const bounded = Math.max(1, Math.min(500, Math.floor(limit)));
    if (force) return this.db.prepare(`SELECT * FROM gateway_events WHERE queue_state = 'pending' ORDER BY created_at, device_sequence LIMIT ?`).all(bounded);
    return this.db.prepare(`SELECT * FROM gateway_events WHERE queue_state = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY created_at, device_sequence LIMIT ?`).all(now, bounded);
  }

  startAttempt(deviceId, eventId, now) {
    this.db.prepare(`UPDATE gateway_events SET attempt_count = attempt_count + 1,
      next_retry_at = NULL, updated_at = ? WHERE device_id = ? AND event_id = ? AND queue_state = 'pending'`)
      .run(now, deviceId, eventId);
  }

  recordRetry(deviceId, eventId, { nextRetryAt, errorClass, now }) {
    this.db.prepare(`UPDATE gateway_events SET queue_state = 'pending', next_retry_at = ?,
      last_error_class = ?, updated_at = ? WHERE device_id = ? AND event_id = ? AND queue_state = 'pending'`)
      .run(nextRetryAt, errorClass, now, deviceId, eventId);
  }

  markAttention(deviceId, eventId, { errorClass, now }) {
    this.db.prepare(`UPDATE gateway_events SET queue_state = 'attention', next_retry_at = NULL,
      last_error_class = ?, updated_at = ? WHERE device_id = ? AND event_id = ? AND queue_state = 'pending'`)
      .run(errorClass, now, deviceId, eventId);
  }

  markDelivered(deviceId, eventId, receipt, now, beforeCommit) {
    return transaction(this.db, () => {
      beforeCommit?.();
      this.db.prepare(`UPDATE gateway_events SET queue_state = 'delivered', remote_receipt_id = ?,
        remote_received_at = ?, next_retry_at = NULL, last_error_class = NULL, updated_at = ?
        WHERE device_id = ? AND event_id = ? AND queue_state = 'pending'`)
        .run(receipt.receipt_id, receipt.received_at, now, deviceId, eventId);
    });
  }

  fakeReceipt(deviceId, eventId) {
    return this.db.prepare('SELECT * FROM fake_transport_receipts WHERE device_id = ? AND event_id = ?').get(deviceId, eventId) ?? null;
  }

  insertFakeReceipt(deviceId, eventId, payloadHash, receiptId, receivedAt) {
    this.db.prepare(`INSERT INTO fake_transport_receipts(device_id, event_id, payload_hash, receipt_id, received_at)
      VALUES (?, ?, ?, ?, ?)`).run(deviceId, eventId, payloadHash, receiptId, receivedAt);
  }

  summary(now = Date.now()) {
    const counts = Object.fromEntries(this.db.prepare('SELECT queue_state, COUNT(*) AS count FROM gateway_events GROUP BY queue_state')
      .all().map((row) => [row.queue_state, Number(row.count)]));
    const oldest = this.db.prepare(`SELECT created_at FROM gateway_events WHERE queue_state = 'pending'
      ORDER BY created_at LIMIT 1`).get();
    const oldestAt = oldest ? Date.parse(oldest.created_at) : null;
    return {
      pending: counts.pending ?? 0,
      delivered_to_fake_transport: counts.delivered ?? 0,
      attention_required: counts.attention ?? 0,
      total_retained: this.eventCount(),
      oldest_pending_age_seconds: oldestAt === null ? null : Math.max(0, Math.floor((now - oldestAt) / 1000)),
    };
  }
}
