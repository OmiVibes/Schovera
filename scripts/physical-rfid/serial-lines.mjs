import { MAX_FRAME_BYTES, MAX_CHUNK_BYTES } from './protocol.mjs';

/** Bounded ASCII framing. Raw candidate text is private adapter input, not a log. */
export class PhysicalSerialLines {
  constructor(onLine) { this.onLine = onLine; this.reset(); }
  reset() {
    const partial = !!(this.bytes?.length || this.invalid || this.pendingCR);
    this.bytes = []; this.invalid = false; this.pendingCR = false;
    return partial;
  }
  push(chunk) {
    if (!(chunk instanceof Uint8Array)) { this.onLine({ code: 'invalid_chunk' }); return; }
    if (chunk.byteLength > MAX_CHUNK_BYTES) {
      this.bytes = []; this.invalid = true; this.pendingCR = false;
      this.onLine({ code: 'oversized_chunk' }); return;
    }
    for (const byte of chunk) {
      if (byte === 10) {
        const line = this.invalid ? { code: 'invalid_serial_line' }
          : this.bytes.length ? { text: Buffer.from(this.bytes).toString('ascii') } : null;
        this.reset(); if (line) this.onLine(line);
      } else if (byte === 13) {
        if (this.pendingCR) this.invalid = true;
        this.pendingCR = true;
      } else {
        if (this.pendingCR || byte < 32 || byte > 126 || this.bytes.length >= MAX_FRAME_BYTES) this.invalid = true;
        this.pendingCR = false;
        if (!this.invalid) this.bytes.push(byte);
      }
    }
  }
}
