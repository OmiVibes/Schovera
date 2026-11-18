// Byte framing only. Never print unvalidated Serial text, including DIAG text.
import {MAX_BYTES} from './protocol.mjs';

const diagnostics = new Map([
  ['DIAG Schovera M7A UNO R4 WiFi; synthetic only; RFID not implemented', 'boot'],
  ['DIAG WiFi diagnostics default OFF; no HTTP requests or cloud credentials', 'wifi_default_off'],
  ['DIAG synthetic_only; no_reader; RAM_only; no_gateway_delivery', 'status_synthetic_ram_only'],
  ['DIAG host_only_endpoint http://127.0.0.1:3187/v1/dry-run; NOT contacted', 'endpoint_not_contacted'],
  ['DIAG discarded_synthetic_RAM_only', 'discarded_ram_only'],
  ['DIAG no_pending_synthetic_message', 'device_has_no_pending_message'],
  ['DIAG arm_refused_invalid_or_pending', 'arm_refused'],
  ['DIAG clear_refused', 'discard_refused'],
  ['DIAG command_too_large', 'command_rejected'],
]);

export class SerialLines {
  constructor(onLine) { this.onLine=onLine; this.reset(); }
  reset() { this.bytes=[]; this.invalid=false; this.pendingCR=false; }
  push(chunk) {
    for (const byte of chunk) {
      if (byte===10) {
        if (this.invalid) this.onLine({type:'rejected',code:'invalid_or_oversized_serial_line'});
        else if (this.bytes.length) {
          const text=Buffer.from(this.bytes).toString('ascii');
          if (text.startsWith('DIAG ')) this.onLine({type:'diag',code:diagnostics.get(text)??'unrecognized_diagnostic'});
          else this.onLine({type:'candidate',text});
        }
        this.reset();
      } else if (byte===13) {
        if(this.pendingCR)this.invalid=true;
        this.pendingCR=true;
      } else {
        if(this.pendingCR){this.invalid=true;this.pendingCR=false;}
        if (byte<32 || byte>126 || this.bytes.length>=MAX_BYTES) this.invalid=true;
        else if (!this.invalid) this.bytes.push(byte);
      }
    }
  }
}
