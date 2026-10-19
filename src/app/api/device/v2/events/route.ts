import { createPublicKey } from 'node:crypto';
import { capabilityMatchesEvent, eventV2Hash, peekCapabilitySelector, validateEventV2, verifyAssignmentCapability } from '../../../../../../scripts/rfid-simulator/event-v2';
import { DeviceRateLimiter, verifyDeviceSignature } from '../../../../../lib/rfid/server';
import { localRfidServer } from '../../../../../lib/rfid/v2-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateLimiter = new DeviceRateLimiter();

function reply(status: number, payload: Record<string, unknown>) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  const config = localRfidServer(request);
  if (!config) return reply(404, { error: 'local device ingestion is disabled' });
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'application/json is required' });
  let raw: string | null;
  try { raw = await readBody(request); } catch { return reply(400, { error: 'invalid request body' }); }
  if (raw === null) return reply(413, { error: 'request body exceeds the local event limit' });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return reply(400, { error: 'invalid request body' }); }
  const parsed = validateEventV2(input);
  if (!parsed.ok || !UUID.test(parsed.event.device_id)) return reply(400, { error: 'invalid event envelope' });
  const event = parsed.event;
  const headerDevice = request.headers.get('x-schovera-device-id');
  const timestamp = request.headers.get('x-schovera-timestamp');
  const nonce = request.headers.get('x-schovera-nonce');
  const signature = request.headers.get('x-schovera-signature');
  if (headerDevice !== event.device_id || !timestamp || !/^\d{13}$/.test(timestamp) || !nonce || !UUID.test(nonce) || !signature) return reply(401, { error: 'device authentication failed' });
  const now = Date.now();
  if (Math.abs(now - Number(timestamp)) > 5 * 60_000) return reply(401, { error: 'signed request is outside the allowed time window' });

  const selector = peekCapabilitySelector(event.assignment_capability);
  if (!selector) return reply(401, { error: 'assignment capability is invalid' });
  const { data: capabilityKey, error: keyError } = await config.service.from('rfid_capability_signing_keys')
    .select('school_id,verification_public_key,active').eq('key_id', selector.key_id).eq('school_id', selector.school_id).maybeSingle();
  if (keyError || !capabilityKey?.active) return reply(401, { error: 'assignment capability is unavailable' });
  const { data: device, error: deviceError } = await config.service.from('school_devices')
    .select('verification_public_key,active,school_id').eq('id', event.device_id).maybeSingle();
  if (deviceError || !device?.active || device.school_id !== capabilityKey.school_id) return reply(403, { error: 'device is not authorized' });
  if (!verifyDeviceSignature(device.verification_public_key, signature, request.method, timestamp, nonce, raw, '/api/device/v2/events')) return reply(401, { error: 'device authentication failed' });
  let verified;
  try { verified = verifyAssignmentCapability(event.assignment_capability, createPublicKey(capabilityKey.verification_public_key)); }
  catch { return reply(401, { error: 'assignment capability is invalid' }); }
  if (!verified.ok || !capabilityMatchesEvent(verified.claims, event) || verified.claims.school_id !== capabilityKey.school_id) return reply(401, { error: 'assignment capability is invalid' });
  if (!rateLimiter.allow(event.device_id, now)) return reply(429, { error: 'device rate limit exceeded' });

  const { data, error } = await config.service.rpc('process_school_entry_event_v2', {
    p_device_id: event.device_id,
    p_device_event_id: event.event_id,
    p_credential_ref: event.credential_ref,
    p_assignment_id: event.credential_assignment_id,
    p_assignment_version: event.credential_assignment_version,
    p_capability_key_id: verified.claims.key_id,
    p_capability_school_id: verified.claims.school_id,
    p_event_type: event.event_type,
    p_observed_at: event.observed_at,
    p_device_sequence: event.device_sequence,
    p_payload_hash: eventV2Hash(event),
    p_request_nonce: nonce,
    p_capability_time_valid: verified.timeValid,
    p_gateway_receipt_id: event.gateway_receipt_id ?? null,
  });
  if (error) {
    if (/event id conflict/i.test(error.message)) return reply(409, { error: 'event ID was already used with different content' });
    if (/request nonce replay/i.test(error.message)) return reply(409, { error: 'request nonce was already used' });
    if (/device unavailable/i.test(error.message)) return reply(403, { error: 'device is not authorized' });
    return reply(400, { error: 'event could not be processed' });
  }
  if (data?.outcome !== 'accepted' && data?.outcome !== 'unresolved') return reply(500, { error: 'event processing result unavailable' });
  return reply(data.duplicate ? 200 : 202, {
    receipt_id: data.receipt_id,
    outcome: data.outcome,
    sequence_state: data.sequence_state,
    received_at: data.received_at,
    duplicate: data.duplicate === true,
  });
}
