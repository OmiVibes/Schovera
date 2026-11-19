// Separate Stage 1 reference protocol. Never import or relax the M7 validator.
export const MAX_FRAME_BYTES = 192;
export const MAX_CHUNK_BYTES = 4096;
export const MAX_SEQUENCE = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class PhysicalProtocolError extends Error {
  constructor(code) { super(code); this.name = 'PhysicalProtocolError'; this.code = code; }
}
const refuse = code => { throw new PhysicalProtocolError(code); };
export function uint(text, maximum, minimum = 0) {
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(text)) refuse('invalid_number');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) refuse('invalid_number');
  return number;
}
export function sessionId(text) {
  if (typeof text !== 'string' || !UUID.test(text)) refuse('invalid_session');
  return text;
}
export function normalizeUid(text) {
  if (typeof text !== 'string' || !/^[0-9a-f]{2}(?::[0-9a-f]{2})+$/i.test(text)
    || ![4, 7, 10].includes(text.split(':').length)) refuse('invalid_uid');
  return text.toUpperCase();
}
export function acquisitionId(session, sequence) {
  sessionId(session); uint(String(sequence), MAX_SEQUENCE, 1);
  return `${session}:${sequence}`; // Physical source identity, not a v2 event UUID.
}
export function parseFrame(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FRAME_BYTES || !/^[\x20-\x7e]+$/.test(text)) refuse('invalid_frame');
  if (text === 'SCHOVERA_RFID_READY') return { type: 'legacy_ready' };
  if (/^Firmware Version: 0x[0-9a-f]{1,2} = (?:\((?:unknown|clone|counterfeit chip)\)|v[0-9]+\.[0-9]+)$/i.test(text)) return { type: 'legacy_version' };
  const fields = text.split(',');
  if (fields[0] === 'SCHOVERA_SCAN' && fields.length === 3) return {
    type: 'legacy_scan', uid: normalizeUid(fields[1]), deviceUptimeMs: uint(fields[2], 4294967295),
  };
  if (fields[0] !== 'SRFID' || fields[1] !== '1') refuse('unsupported_protocol');
  if (fields.length === 3 && fields[2] === 'READY') return { type: 'ready' };
  if (fields.length === 5 && fields[2] === 'STATE') return {
    type: 'state', sessionId: sessionId(fields[3]), lastSequence: uint(fields[4], MAX_SEQUENCE),
  };
  if (fields.length === 7 && fields[2] === 'SCAN') return {
    type: 'scan', sessionId: sessionId(fields[3]), sequence: uint(fields[4], MAX_SEQUENCE, 1),
    uid: normalizeUid(fields[5]), deviceUptimeMs: uint(fields[6], 4294967295),
  };
  refuse('invalid_frame');
}
export function command(type, session, sequence) {
  if (type === 'status') return 'SRFID,1,STATUS';
  sessionId(session);
  if (type === 'bind') return `SRFID,1,BIND,${session}`;
  uint(String(sequence), MAX_SEQUENCE, 1);
  if (type === 'validation_ack') return `SRFID,1,ACK,${session},${sequence},VALIDATED_RAM_ONLY`;
  if (type === 'retry') return `SRFID,1,RETRY,${session},${sequence}`;
  refuse('unsupported_command');
}
