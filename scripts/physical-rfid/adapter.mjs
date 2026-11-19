import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { acquisitionId, command, parseFrame, sessionId } from './protocol.mjs';
import { PhysicalSerialLines } from './serial-lines.mjs';

const refuse = code => { throw new Error(code); };
const bounded = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

/** Stage 1 only: injected byte input/write function, RAM validation, no port/network/DB. */
export class PhysicalRfidAdapter {
  #records = new Map(); #usedSessions = new Set(); #session = null; #legacy = null;
  #connected = false; #state = 'disconnected'; #epoch = 0; #flush = null; #bindingBusy = false;
  #resetReview = false; #reports = 0; #reportWindow = 0; #suppressed = 0; #abort = new AbortController();
  constructor({ write, report = () => {}, allowLegacyMonitor = false, maxRecords = 128, maxSessions = 4,
    maxWriteAttempts = 3, writeTimeoutMs = 1000, wallNow = () => Date.now(),
    monotonicNow = () => performance.now(), newSessionId = randomUUID } = {}) {
    if (typeof write !== 'function' || typeof report !== 'function' || typeof wallNow !== 'function'
      || typeof monotonicNow !== 'function' || typeof newSessionId !== 'function'
      || !bounded(maxRecords, 1, 128) || !bounded(maxSessions, 1, 4) || !bounded(maxWriteAttempts, 1, 3)
      || !bounded(writeTimeoutMs, 10, 5000) || typeof allowLegacyMonitor !== 'boolean') refuse('invalid_adapter_configuration');
    Object.assign(this, { write, report, allowLegacyMonitor, maxRecords, maxSessions, maxWriteAttempts, writeTimeoutMs, wallNow, monotonicNow, newSessionId });
    this.lines = new PhysicalSerialLines(line => {
      if (line.code) { this.#emit(line.code); return; }
      try { this.#receive(parseFrame(line.text)); } catch { this.#emit('frame_refused'); }
    });
  }
  #emit(code, fields = {}) {
    const now = this.monotonicNow();
    if (now - this.#reportWindow >= 1000) { this.#reports = 0; this.#reportWindow = now; }
    if (this.#reports >= 16) { this.#suppressed = Math.min(Number.MAX_SAFE_INTEGER, this.#suppressed + 1); return; }
    this.#reports++;
    try { this.report(Object.freeze({ code, ...fields, source: 'simulated_serial', durable: false,
      backendWritten: false, physicalHardwareVerified: false })); } catch { /* Never relay callback errors or raw data. */ }
  }
  connect() {
    if (this.#connected) refuse('already_connected');
    this.#epoch++; this.#connected = true; this.#state = 'awaiting_identity';
    this.#abort = new AbortController(); this.lines.reset(); this.#emit('simulated_link_open');
  }
  disconnect() {
    if (!this.#connected) return;
    this.#connected = false; this.#epoch++; this.#abort.abort();
    const partial = this.lines.reset(); this.#state = 'disconnected';
    this.#emit('link_closed_ram_retained', { partialFrameDiscarded: partial });
  }
  feed(bytes) {
    if (!this.#connected) { this.#emit('input_while_disconnected'); return; }
    this.lines.push(bytes);
  }
  #receive(frame) {
    if (frame.type.startsWith('legacy_')) {
      if (frame.type === 'legacy_scan' && this.allowLegacyMonitor) {
        this.#legacy = Object.freeze({ uid: frame.uid, deviceUptimeMs: frame.deviceUptimeMs,
          hostReceivedAt: this.#receivedAt(), acquisitionId: null, retransmission: 'unknown' });
        this.#emit('legacy_observation_only_no_identity');
      } else this.#emit(frame.type === 'legacy_scan' ? 'legacy_capture_disabled' : 'legacy_diagnostic_only');
      return; // Legacy input never negotiates a session or causes an ACK.
    }
    if (frame.type === 'ready') {
      this.#epoch++; this.#abort.abort(); this.#abort = new AbortController();
      this.#resetReview ||= !!this.#session;
      this.#session = null; this.#state = 'ready';
      this.#emit(this.#resetReview ? 'reset_or_rehandshake_requires_review' : 'versioned_ready'); return;
    }
    if (frame.type === 'state') {
      const s = this.#session;
      if (!s || s.id !== frame.sessionId) { this.#state = 'identity_attention'; this.#emit('unknown_session_not_adopted'); return; }
      if ((!s.confirmed && frame.lastSequence !== 0) || frame.lastSequence < s.maximum || frame.lastSequence > s.maximum + 1) {
        this.#state = 'identity_attention'; this.#emit('source_sequence_requires_review'); return;
      }
      s.confirmed = true; this.#state = 'bound'; this.#resetReview = false;
      this.#emit('session_confirmed_in_simulation'); return;
    }
    const s = this.#session;
    if (this.#state !== 'bound' || !s?.confirmed || frame.sessionId !== s.id) { this.#emit('unbound_or_foreign_scan'); return; }
    const id = acquisitionId(s.id, frame.sequence), prior = this.#records.get(id);
    if (prior) {
      if (prior.uid !== frame.uid || prior.deviceUptimeMs !== frame.deviceUptimeMs) { this.#emit('acquisition_content_conflict'); return; }
      if (prior.attempts < this.maxWriteAttempts) prior.ack = 'pending';
      else { prior.ack = 'attention'; this.#emit('validation_ack_retry_limit'); }
      this.#emit('duplicate_acquisition', { acquisitionId: id }); return;
    }
    if (frame.sequence !== s.maximum + 1) { this.#emit('sequence_gap_or_old_acquisition'); return; }
    if (s.lastUptime !== null && frame.deviceUptimeMs < s.lastUptime) {
      this.#state = 'identity_attention'; this.#emit('uptime_regressed_requires_review'); return;
    }
    if (this.#records.size >= this.maxRecords) { this.#emit('validation_capacity_no_ack'); return; }
    const record = { acquisitionId: id, sessionId: s.id, sequence: frame.sequence, uid: frame.uid,
      deviceUptimeMs: frame.deviceUptimeMs, hostReceivedAt: this.#receivedAt(), attempts: 0, ack: 'pending', retryAt: 0 };
    this.#records.set(id, record); s.maximum = frame.sequence; s.lastUptime = frame.deviceUptimeMs;
    this.#emit('acquisition_validated_in_ram', { acquisitionId: id });
  }
  #receivedAt() {
    const time = this.wallNow();
    if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) refuse('host_clock_unavailable');
    return new Date(time).toISOString(); // Host receipt, never the device's UTC observation time.
  }
  async #write(line) {
    if (!this.#connected) return false;
    const epoch = this.#epoch, linkSignal = this.#abort.signal;
    const requestAbort = new AbortController(), signal = requestAbort.signal;
    let timer, abort;
    const stop = new Promise(resolve => {
      timer = setTimeout(() => { requestAbort.abort(); resolve(false); }, this.writeTimeoutMs);
      abort = () => { requestAbort.abort(); resolve(false); }; linkSignal.addEventListener('abort', abort, { once: true });
    });
    try {
      const sent = Promise.resolve().then(() => {
        if (signal.aborted || epoch !== this.#epoch) return false;
        return Promise.resolve(this.write(line + '\n', { signal })).then(() => true, () => false);
      });
      const okay = await Promise.race([sent, stop]);
      return okay && this.#connected && epoch === this.#epoch;
    } catch { return false; }
    finally { clearTimeout(timer); linkSignal.removeEventListener('abort', abort); }
  }
  async bindSession({ acknowledgeVolatileReset = false } = {}) {
    if (!this.#connected || !['ready', 'awaiting_bind_confirmation'].includes(this.#state) || this.#bindingBusy) refuse('binding_not_available');
    if (this.#resetReview && acknowledgeVolatileReset !== true) refuse('reset_review_required');
    if (!this.#session) {
      if (this.#usedSessions.size >= this.maxSessions) refuse('session_capacity_requires_review');
      const id = sessionId(this.newSessionId());
      if (this.#usedSessions.has(id)) refuse('session_reuse_refused');
      this.#usedSessions.add(id); this.#session = { id, maximum: 0, lastUptime: null, confirmed: false, attempts: 0 };
    }
    const s = this.#session;
    if (s.attempts >= this.maxWriteAttempts) refuse('binding_retry_limit');
    s.attempts++; this.#state = 'awaiting_bind_confirmation'; this.#bindingBusy = true;
    try {
      const written = await this.#write(command('bind', s.id));
      this.#emit(written ? 'bind_write_completed_not_device_confirmation' : 'bind_write_unconfirmed');
      return { sessionId: s.id, written, deviceConfirmed: false };
    } finally { this.#bindingBusy = false; }
  }
  flushValidationAcks() {
    if (this.#flush) return this.#flush;
    this.#flush = this.#flushAcks().finally(() => { this.#flush = null; }); return this.#flush;
  }
  async #flushAcks() {
    for (const r of this.#records.values()) {
      if (!this.#connected || this.#state !== 'bound') break;
      if (r.sessionId !== this.#session.id || r.ack !== 'pending' || r.retryAt > this.monotonicNow()) continue;
      if (r.attempts >= this.maxWriteAttempts) { r.ack = 'attention'; continue; }
      r.attempts++; // Bounded even for repeated source retransmissions.
      const written = await this.#write(command('validation_ack', r.sessionId, r.sequence));
      r.ack = written ? 'write_completed' : r.attempts >= this.maxWriteAttempts ? 'attention' : 'pending';
      if (!written) r.retryAt = this.monotonicNow() + Math.min(1000, 250 * 2 ** (r.attempts - 1));
      this.#emit(written ? 'validation_ack_write_completed_only' : 'validation_ack_write_unconfirmed', { acquisitionId: r.acquisitionId, attempt: r.attempts });
    }
  }
  inspect() {
    return { connected: this.#connected, state: this.#state, source: 'simulated_serial',
      retainedRecords: this.#records.size, retainedSessions: this.#usedSessions.size,
      validationAckAttention: [...this.#records.values()].filter(r => r.ack === 'attention').length,
      suppressedDiagnostics: this.#suppressed, legacyObservationRetained: !!this.#legacy,
      durable: false, backendWritten: false, studentsAssociated: false, physicalHardwareVerified: false };
  }
  // Sensitive inspection is deliberately separate from ordinary diagnostics.
  readPrivateObservation(id) {
    const r = this.#records.get(id);
    if (!r) return null;
    const { uid, deviceUptimeMs, hostReceivedAt, sessionId: session, sequence } = r;
    return Object.freeze({ acquisitionId: id, sessionId: session, sequence, uid, deviceUptimeMs, hostReceivedAt });
  }
  readPrivateLegacyObservation() { return this.#legacy ? { ...this.#legacy } : null; }
}
