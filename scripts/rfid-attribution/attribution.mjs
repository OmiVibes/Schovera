import { createHash, verify } from 'node:crypto';

const EVENT_FIELDS_V2 = [
  'schema_version', 'event_id', 'device_id', 'credential_ref', 'credential_assignment_id',
  'credential_assignment_version', 'assignment_capability', 'event_type', 'observed_at',
  'device_sequence', 'gateway_receipt_id',
];

export function canonicalAttributionEvent(event) {
  return JSON.stringify(Object.fromEntries(EVENT_FIELDS_V2.map((field) => [field, event[field]])));
}
/** Validate a server-signed, device-bound snapshot capability. The token is an authorization
 * context, not a secret and not proof that a physical tap occurred. */
export function verifyAssignmentCapability(token, publicKey, expected, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) return { valid: false, reason: 'capability_missing_or_oversized' };
  const [encodedClaims, encodedSignature, extra] = token.split('.');
  if (!encodedClaims || !encodedSignature || extra !== undefined) return { valid: false, reason: 'capability_malformed' };
  let claims;
  let signature;
  try {
    const payload = Buffer.from(encodedClaims, 'base64url');
    signature = Buffer.from(encodedSignature, 'base64url');
    claims = JSON.parse(payload.toString('utf8'));
    if (payload.toString('base64url') !== encodedClaims || signature.toString('base64url') !== encodedSignature
        || !verify(null, payload, publicKey, signature)) return { valid: false, reason: 'capability_signature_invalid' };
  } catch {
    return { valid: false, reason: 'capability_signature_invalid' };
  }
  const fields = ['token_version', 'key_id', 'assignment_id', 'assignment_version', 'credential_ref', 'school_id', 'device_id', 'not_before', 'expires_at'];
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)
      || Object.keys(claims).length !== fields.length || fields.some((field) => !Object.hasOwn(claims, field))) {
    return { valid: false, reason: 'capability_claims_invalid' };
  }
  if (claims.token_version !== 1 || !Number.isSafeInteger(claims.assignment_version) || claims.assignment_version < 1
      || typeof claims.key_id !== 'string' || !claims.key_id) return { valid: false, reason: 'capability_claims_invalid' };
  if (claims.assignment_id !== expected.assignmentId || claims.assignment_version !== expected.assignmentVersion
      || claims.credential_ref !== expected.credentialRef || claims.school_id !== expected.schoolId
      || claims.device_id !== expected.deviceId) return { valid: false, reason: 'capability_binding_mismatch' };
  const notBefore = Date.parse(claims.not_before);
  const expiresAt = Date.parse(claims.expires_at);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt) || notBefore > expiresAt
      || now < notBefore || now >= expiresAt) return { valid: false, reason: 'capability_outside_validity_window' };
  return { valid: true, claims };
}

/** Pure policy model only; it does not query a database or authenticate a device. */
export function classifyCredentialAttribution({ event, device, assignments, receivedAt, verifiedCapability = null, priorReceipt = null }) {
  if (!event || typeof event !== 'object' || !Number.isInteger(event.schema_version)) {
    return { state: 'invalid', reason: 'invalid_event' };
  }
  if (event.schema_version === 1) {
    return { state: 'unresolved', reason: 'legacy_event_has_no_assignment_id', student_id: null };
  }
  if (event.schema_version !== 2 || EVENT_FIELDS_V2.some((field) => !Object.hasOwn(event, field))
      || Object.keys(event).some((field) => !EVENT_FIELDS_V2.includes(field))) {
    return { state: 'invalid', reason: 'invalid_v2_event_shape' };
  }
  if (!Number.isSafeInteger(event.credential_assignment_version) || event.credential_assignment_version < 1
      || !['check_in', 'check_out'].includes(event.event_type)
      || !Number.isSafeInteger(event.device_sequence) || event.device_sequence < 1
      || typeof event.assignment_capability !== 'string' || event.assignment_capability.length > 4096
      || typeof event.gateway_receipt_id !== 'string' || !event.gateway_receipt_id) {
    return { state: 'invalid', reason: 'invalid_v2_event_shape' };
  }
  if (priorReceipt) {
    const payloadHash = createHash('sha256').update(canonicalAttributionEvent(event)).digest('hex');
    return priorReceipt.payload_hash === payloadHash
      ? { ...priorReceipt.result, duplicate: true }
      : { state: 'conflict', reason: 'event_id_reused_with_changed_payload' };
  }
  if (!device?.active) return { state: 'unresolved', reason: 'device_inactive', student_id: null };

  if (!verifiedCapability?.valid) {
    return { state: 'unresolved', reason: verifiedCapability?.reason ?? 'assignment_capability_unverified', student_id: null };
  }
  if (verifiedCapability.claims.assignment_id !== event.credential_assignment_id
      || verifiedCapability.claims.assignment_version !== event.credential_assignment_version
      || verifiedCapability.claims.credential_ref !== event.credential_ref
      || verifiedCapability.claims.device_id !== event.device_id
      || verifiedCapability.claims.school_id !== device.school_id) {
    return { state: 'unresolved', reason: 'assignment_capability_binding_mismatch', student_id: null };
  }

  const assignment = assignments.find((row) => row.id === event.credential_assignment_id);
  if (!assignment) return { state: 'unresolved', reason: 'assignment_unknown', student_id: null };
  if (assignment.school_id !== device.school_id) {
    return { state: 'unresolved', reason: 'assignment_outside_device_school', student_id: null };
  }
  if (assignment.credential_ref !== event.credential_ref) {
    return { state: 'unresolved', reason: 'assignment_credential_mismatch', student_id: null };
  }
  if (assignment.credential_version !== event.credential_assignment_version
      || assignment.credential_version !== verifiedCapability.claims.assignment_version) {
    return { state: 'unresolved', reason: 'assignment_version_mismatch', student_id: null };
  }
  if (assignment.revoked_at && Date.parse(assignment.revoked_at) <= Date.parse(receivedAt)) {
    return { state: 'unresolved', reason: 'assignment_revoked_before_server_processing', student_id: null };
  }
  if (!assignment.student_active) {
    return { state: 'unresolved', reason: 'student_inactive', student_id: null };
  }
  return {
    state: 'attributed',
    reason: 'exact_immutable_assignment_matches_active_school_scoped_mapping',
    student_id: assignment.student_id,
    credential_assignment_id: assignment.id,
    duplicate: false,
  };
}
