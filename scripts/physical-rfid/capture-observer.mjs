import { parseFrame } from './protocol.mjs';
import { PhysicalSerialLines } from './serial-lines.mjs';

/** Capture statistics only. Private tuples never leave this object or become events. */
export class ReadOnlyObserver {
  #seen = new Set(); #lastUptime = null; #epoch = 0; #ended = false; #reports = 0; #window = 0;
  constructor({ report = () => {}, stop = () => {}, now = () => performance.now(), maxTuples = 256 } = {}) {
    if (!Number.isInteger(maxTuples) || maxTuples < 1 || maxTuples > 1024) throw Error('invalid_capture_capacity');
    Object.assign(this, { report, stop, now, maxTuples });
    this.counts = { bytesReceived: 0, validScanFrames: 0, distinctObservationTuples: 0, exactRepeatedTuples: 0,
      invalidFrames: 0, bootOrReadyIndications: 0, possibleResetIndications: 0, firmwareVersionIndications: 0,
      uptimeRegressions: 0, lastDeviceUptimeMs: null, otherVersionedFrames: 0, suppressedDiagnostics: 0, partialFrameDiscarded: false };
    this.lines = new PhysicalSerialLines(line => {
      if (this.#ended) return;
      if (line.code) { this.#invalid(); return; }
      let frame;
      try { frame = parseFrame(line.text); } catch { this.#invalid(); return; }
      if (frame.type === 'legacy_ready') {
        this.counts.bootOrReadyIndications++;
        if (this.counts.validScanFrames) this.counts.possibleResetIndications++;
        this.#epoch++; this.#lastUptime = null; this.#emit('boot_or_ready_indication');
      } else if (frame.type === 'legacy_version') {
        this.counts.firmwareVersionIndications++; this.#emit('reader_version_indication_unverified');
      } else if (frame.type === 'legacy_scan') {
        if (this.#lastUptime !== null && frame.deviceUptimeMs < this.#lastUptime) {
          this.counts.uptimeRegressions++; this.#emit('uptime_regressed_reset_wrap_or_order_unknown');
        }
        this.#lastUptime = frame.deviceUptimeMs; this.counts.lastDeviceUptimeMs = frame.deviceUptimeMs;
        this.counts.validScanFrames++;
        const tuple = `${this.#epoch}|${frame.uid}|${frame.deviceUptimeMs}`;
        if (this.#seen.has(tuple)) this.counts.exactRepeatedTuples++;
        else {
          if (this.#seen.size >= this.maxTuples) { this.stop('observation_capacity'); return; }
          this.#seen.add(tuple); this.counts.distinctObservationTuples++;
        }
        this.#emit('legacy_scan_observed');
      } else { this.counts.otherVersionedFrames++; this.#emit('versioned_frame_observed_no_response'); }
    });
  }
  #emit(code) {
    const time = this.now();
    if (time - this.#window >= 1000) { this.#reports = 0; this.#window = time; }
    if (this.#reports++ >= 16) { this.counts.suppressedDiagnostics++; return; }
    this.report({ code, ...this.snapshot() }); // Only numeric/boolean statistics; never tuple/UID/text.
  }
  #invalid() { this.counts.invalidFrames++; this.#emit('invalid_serial_frame'); }
  feed(bytes) {
    if (this.#ended) return;
    if (!(bytes instanceof Uint8Array)) { this.#invalid(); return; }
    this.counts.bytesReceived += bytes.byteLength;
    if (this.counts.bytesReceived > 2 * 1024 * 1024) { this.stop('capture_byte_limit'); return; }
    this.lines.push(bytes);
  }
  end() {
    if (this.#ended) return;
    this.#ended = true; this.counts.partialFrameDiscarded = this.lines.reset();
  }
  snapshot() {
    return { ...this.counts, retransmissionIdentityAvailable: false, physicalPresentationsVerified: false,
      studentsAssociated: false, backendWritten: false, serialPayloadWrites: 0 };
  }
}
