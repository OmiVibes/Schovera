import { createHash, verify } from 'node:crypto';
import { isIP } from 'node:net';
import { validateEvent, type DeviceEvent } from '../../../scripts/rfid-simulator/core';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const EVENT_PATH = '/api/device/v1/events';

export function isLoopbackHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isLoopbackHostHeader(value: string | null): boolean {
  if (!value || value.includes('@')) return false;
  let url: URL;
  try { url = new URL(`http://${value}`); } catch { return false; }
  const hostname = url.hostname.toLowerCase();
  const address = hostname.replace(/^\[|\]$/g, '');
  const loopbackIp = address === '::1' || address.startsWith('127.') && isIP(address) === 4;
  return url.host === value.toLowerCase() && url.pathname === '/'
    && (hostname === 'localhost' || loopbackIp);
}

export function canonicalSignedMessage(method: string, timestamp: string, nonce: string, body: string): Buffer {
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  return Buffer.from(`${method.toUpperCase()}\n${EVENT_PATH}\n${timestamp}\n${nonce}\n${bodyHash}`, 'utf8');
}

export function verifyDeviceSignature(
  publicKeyPem: string,
  signatureBase64: string,
  method: string,
  timestamp: string,
  nonce: string,
  body: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== signatureBase64) return false;
    return verify(null, canonicalSignedMessage(method, timestamp, nonce, body), publicKeyPem, signature);
  } catch {
    return false;
  }
}

export function parseRfidEvent(raw: string): { event: DeviceEvent; hash: string } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const result = validateEvent(parsed);
  if (!result.ok) return null;
  const canonical = JSON.stringify({
    schema_version: result.event.schema_version,
    event_id: result.event.event_id,
    device_id: result.event.device_id,
    credential_ref: result.event.credential_ref,
    event_type: result.event.event_type,
    observed_at: result.event.observed_at,
    device_sequence: result.event.device_sequence,
  });
  return { event: result.event, hash: createHash('sha256').update(canonical).digest('hex') };
}

export class DeviceRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  allow(deviceId: string, now = Date.now(), limit = 60, windowMs = 60_000): boolean {
    if (this.windows.size > 2_000) {
      for (const [key, entry] of this.windows) {
        if (now - entry.startedAt >= windowMs) this.windows.delete(key);
      }
    }
    const current = this.windows.get(deviceId);
    if (!current || now - current.startedAt >= windowMs) {
      this.windows.set(deviceId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}
