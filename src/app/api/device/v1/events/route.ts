import { createClient } from '@supabase/supabase-js';
import { DeviceRateLimiter, isLoopbackHostHeader, isLoopbackHttpUrl, parseRfidEvent, verifyDeviceSignature } from '@/lib/rfid/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateLimiter = new DeviceRateLimiter();

function reply(status: number, payload: Record<string, unknown>) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SCHOVERA_RFID_API_MODE !== 'local'
    || process.env.SCHOVERA_TEST_MODE !== 'local'
    || !isLoopbackHttpUrl(supabaseUrl)
    || !isLoopbackHostHeader(request.headers.get('host'))
    || !serviceKey) {
    return reply(404, { error: 'local device ingestion is disabled' });
  }
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return reply(415, { error: 'application/json is required' });
  }
  let raw: string | null;
  try { raw = await readBoundedBody(request); } catch { return reply(400, { error: 'invalid request body' }); }
  if (raw === null) return reply(413, { error: 'request body exceeds the local event limit' });
  const parsed = parseRfidEvent(raw);
  if (!parsed || !UUID.test(parsed.event.device_id)) return reply(400, { error: 'invalid event envelope' });

  const deviceId = parsed.event.device_id;
  const headerDevice = request.headers.get('x-schovera-device-id');
  const timestamp = request.headers.get('x-schovera-timestamp');
  const nonce = request.headers.get('x-schovera-nonce');
  const signature = request.headers.get('x-schovera-signature');
  if (headerDevice !== deviceId || !timestamp || !/^\d{13}$/.test(timestamp)
    || !nonce || !UUID.test(nonce) || !signature) {
    return reply(401, { error: 'device authentication failed' });
  }
  const now = Date.now();
  if (Math.abs(now - Number(timestamp)) > 5 * 60_000) return reply(401, { error: 'signed request is outside the allowed time window' });

  const supabase = createClient(supabaseUrl!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: device, error: lookupError } = await supabase.from('school_devices')
    .select('verification_public_key,active').eq('id', deviceId).maybeSingle();
  if (lookupError || !device?.active) return reply(403, { error: 'device is not authorized' });
  if (!verifyDeviceSignature(device.verification_public_key, signature, request.method, timestamp, nonce, raw)) {
    return reply(401, { error: 'device authentication failed' });
  }

  if (!rateLimiter.allow(deviceId, now)) return reply(429, { error: 'device rate limit exceeded' });

  const { data, error } = await supabase.rpc('process_school_entry_event', {
    p_device_id: deviceId,
    p_device_event_id: parsed.event.event_id,
    p_credential_ref: parsed.event.credential_ref,
    p_event_type: parsed.event.event_type,
    p_observed_at: parsed.event.observed_at,
    p_device_sequence: parsed.event.device_sequence,
    p_payload_hash: parsed.hash,
    p_request_nonce: nonce,
  });
  if (error) {
    if (/event id conflict/i.test(error.message)) return reply(409, { error: 'event ID was already used with different content' });
    if (/request nonce replay/i.test(error.message)) return reply(409, { error: 'request nonce was already used' });
    if (/device unavailable/i.test(error.message)) return reply(403, { error: 'device is not authorized' });
    return reply(400, { error: 'event could not be processed' });
  }
  const outcome = data?.outcome;
  if (outcome !== 'accepted' && outcome !== 'unmatched') return reply(500, { error: 'event processing result unavailable' });
  return reply(data.duplicate ? 200 : 202, {
    receipt_id: data.receipt_id,
    outcome,
    sequence_state: data.sequence_state,
    received_at: data.received_at,
    duplicate: data.duplicate === true,
  });
}
