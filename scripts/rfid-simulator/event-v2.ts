import { createHash, sign, verify, type KeyObject } from 'node:crypto';

export const EVENT_V2_SCHEMA_VERSION = 2 as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DOMAIN = 'schovera-rfid-assignment-capability-v1\n';
const EVENT_FIELDS = ['schema_version','event_id','device_id','credential_ref','credential_assignment_id','credential_assignment_version','assignment_capability','event_type','observed_at','device_sequence','gateway_receipt_id'] as const;

function validObservedAt(value: string): boolean {
  if (!ISO.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === datePart;
}

export type AssignmentCapabilityClaims = {
  token_version: 1;
  key_id: string;
  assignment_id: string;
  assignment_version: number;
  credential_ref: string;
  device_id: string;
  school_id: string;
  not_before: number;
  expires_at: number;
};

export type DeviceEventV2 = {
  schema_version: 2;
  event_id: string;
  device_id: string;
  credential_ref: string;
  credential_assignment_id: string;
  credential_assignment_version: number;
  assignment_capability: string;
  event_type: 'check_in' | 'check_out';
  observed_at: string;
  device_sequence: number;
  gateway_receipt_id?: string;
};

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

export function signAssignmentCapability(claims: AssignmentCapabilityClaims, privateKey: KeyObject): string {
  const encoded = b64url(JSON.stringify(claims));
  const signature = sign(null, Buffer.from(`${DOMAIN}${encoded}`, 'utf8'), privateKey);
  return `${encoded}.${b64url(signature)}`;
}

export function verifyAssignmentCapability(token: string, publicKey: KeyObject, nowSeconds = Math.floor(Date.now() / 1000)):
  | { ok: true; claims: AssignmentCapabilityClaims; timeValid: boolean; temporalState: 'valid' | 'not_yet_valid' | 'expired' }
  | { ok: false; error: string } {
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, error: 'invalid capability' };
  const [encoded, signatureText, ...rest] = token.split('.');
  if (!encoded || !signatureText || rest.length || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(signatureText)) return { ok: false, error: 'invalid capability' };
  try {
    const signature = Buffer.from(signatureText, 'base64url');
    if (signature.length !== 64 || signature.toString('base64url') !== signatureText
      || !verify(null, Buffer.from(`${DOMAIN}${encoded}`, 'utf8'), publicKey, signature)) return { ok: false, error: 'invalid capability signature' };
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AssignmentCapabilityClaims;
    const fields = ['token_version','key_id','assignment_id','assignment_version','credential_ref','device_id','school_id','not_before','expires_at'];
    if (!claims || typeof claims !== 'object' || Object.keys(claims).sort().join(',') !== [...fields].sort().join(',')) return { ok: false, error: 'invalid capability claims' };
    if (claims.token_version !== 1 || typeof claims.key_id !== 'string' || !OPAQUE.test(claims.key_id)
      || !UUID.test(claims.assignment_id) || !UUID.test(claims.device_id) || !UUID.test(claims.school_id)
      || !Number.isSafeInteger(claims.assignment_version) || claims.assignment_version < 1
      || typeof claims.credential_ref !== 'string' || !OPAQUE.test(claims.credential_ref)
      || !Number.isSafeInteger(claims.not_before) || !Number.isSafeInteger(claims.expires_at)
      || claims.not_before >= claims.expires_at) return { ok: false, error: 'invalid capability claims' };
    if (claims.not_before > nowSeconds) return { ok: true, claims, timeValid: false, temporalState: 'not_yet_valid' };
    if (claims.expires_at <= nowSeconds) return { ok: true, claims, timeValid: false, temporalState: 'expired' };
    return { ok: true, claims, timeValid: true, temporalState: 'valid' };
  } catch { return { ok: false, error: 'invalid capability' }; }
}

/** Reads only the untrusted key selector so a verifier can load a candidate public key. */
export function peekCapabilityKeyId(token: string): string | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof value.key_id === 'string' && OPAQUE.test(value.key_id) ? value.key_id : null;
  } catch { return null; }
}

export function peekCapabilitySelector(token: string): { key_id: string; school_id: string } | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof value.key_id === 'string' && OPAQUE.test(value.key_id) && typeof value.school_id === 'string' && UUID.test(value.school_id)
      ? { key_id: value.key_id, school_id: value.school_id } : null;
  } catch { return null; }
}

export function validateEventV2(value: unknown): { ok: true; event: DeviceEventV2 } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'event must be a JSON object' };
  const row = value as Record<string, unknown>;
  const allowed = new Set(EVENT_FIELDS);
  if (Object.keys(row).some((key) => !allowed.has(key as typeof EVENT_FIELDS[number]))) return { ok: false, error: 'unexpected event field' };
  if (row.schema_version !== 2 || !UUID.test(String(row.event_id)) || !UUID.test(String(row.device_id))
    || !UUID.test(String(row.credential_assignment_id))) return { ok: false, error: 'invalid version or UUID field' };
  if (typeof row.credential_ref !== 'string' || !OPAQUE.test(row.credential_ref)
    || !Number.isSafeInteger(row.credential_assignment_version) || Number(row.credential_assignment_version) < 1
    || typeof row.assignment_capability !== 'string' || row.assignment_capability.length > 4096) return { ok: false, error: 'invalid assignment evidence' };
  if (row.event_type !== 'check_in' && row.event_type !== 'check_out') return { ok: false, error: 'invalid event type' };
  if (typeof row.observed_at !== 'string' || !validObservedAt(row.observed_at)) return { ok: false, error: 'invalid observed_at' };
  if (!Number.isSafeInteger(row.device_sequence) || Number(row.device_sequence) < 1) return { ok: false, error: 'invalid device sequence' };
  if (row.gateway_receipt_id !== undefined && (typeof row.gateway_receipt_id !== 'string' || !UUID.test(row.gateway_receipt_id))) return { ok: false, error: 'invalid gateway receipt id' };
  return { ok: true, event: row as DeviceEventV2 };
}

export function canonicalEventV2(event: DeviceEventV2): string {
  return JSON.stringify(Object.fromEntries(EVENT_FIELDS.filter((field) => field !== 'gateway_receipt_id' || event.gateway_receipt_id !== undefined).map((field) => [field, event[field]])));
}

export function eventV2Hash(event: DeviceEventV2): string {
  return createHash('sha256').update(canonicalEventV2(event), 'utf8').digest('hex');
}

export function capabilityMatchesEvent(claims: AssignmentCapabilityClaims, event: DeviceEventV2): boolean {
  return claims.assignment_id === event.credential_assignment_id
    && claims.assignment_version === event.credential_assignment_version
    && claims.credential_ref === event.credential_ref
    && claims.device_id === event.device_id;
}
