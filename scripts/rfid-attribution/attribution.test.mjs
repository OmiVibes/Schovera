import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { classifyCredentialAttribution, canonicalAttributionEvent, verifyAssignmentCapability } from './attribution.mjs';

const schoolA = 'school-synthetic-a';
const schoolB = 'school-synthetic-b';
const studentA = 'student-synthetic-a';
const studentB = 'student-synthetic-b';
const assignmentA = 'assignment-synthetic-a';
const assignmentB = 'assignment-synthetic-b';
const credentialA = 'credential-synthetic-a';
const credentialB = 'credential-synthetic-b';
const device = { school_id: schoolA, active: true };
const activeA = { id: assignmentA, school_id: schoolA, student_id: studentA, student_active: true,
  credential_ref: credentialA, credential_version: 1, activated_at: '2026-01-01T00:00:00Z', revoked_at: null };
const activeB = { id: assignmentB, school_id: schoolA, student_id: studentB, student_active: true,
  credential_ref: credentialB, credential_version: 1, activated_at: '2026-10-01T00:00:00Z', revoked_at: null };
const receivedAt = '2026-10-19T10:00:00Z';
const capabilityKeys = generateKeyPairSync('ed25519');

function event(overrides = {}) {
  return {
    schema_version: 2,
    event_id: randomUUID(),
    device_id: 'device-synthetic-gate',
    credential_ref: credentialA,
    credential_assignment_id: assignmentA,
    credential_assignment_version: 1,
    assignment_capability: 'synthetic-capability-token',
    event_type: 'check_in',
    observed_at: '2026-10-19T08:00:00+05:30',
    device_sequence: 1,
    gateway_receipt_id: randomUUID(),
    ...overrides,
  };
}

function signedToken(claims) {
  const claimsBytes = Buffer.from(JSON.stringify(claims), 'utf8');
  const payload = claimsBytes.toString('base64url');
  const signature = sign(null, claimsBytes, capabilityKeys.privateKey).toString('base64url');
  return `${payload}.${signature}`;
}

function makeCapability(input, selectedDevice, claimsOverrides = {}) {
  const claims = {
    token_version: 1,
    key_id: 'test-key-1',
    assignment_id: input.credential_assignment_id,
    assignment_version: input.credential_assignment_version,
    credential_ref: input.credential_ref,
    school_id: selectedDevice.school_id,
    device_id: input.device_id,
    not_before: '2026-10-19T00:00:00Z',
    expires_at: '2026-10-20T00:00:00Z',
    ...claimsOverrides,
  };
  return verifyAssignmentCapability(signedToken(claims), capabilityKeys.publicKey, {
    assignmentId: input.credential_assignment_id,
    assignmentVersion: input.credential_assignment_version,
    credentialRef: input.credential_ref,
    schoolId: selectedDevice.school_id,
    deviceId: input.device_id,
  }, Date.parse(receivedAt));
}

function decide(input, overrides = {}) {
  const selectedDevice = overrides.device ?? device;
  const assignments = overrides.assignments ?? [activeA, activeB];
  const verifiedCapability = overrides.verifiedCapability ?? makeCapability(input, selectedDevice, overrides.capabilityClaims);
  return classifyCredentialAttribution({ event: input, device: selectedDevice, assignments, receivedAt,
    ...overrides, verifiedCapability });
}

function hash(eventValue) {
  return createHash('sha256').update(canonicalAttributionEvent(eventValue)).digest('hex');
}

describe('synthetic credential-attribution policy model (not production auth)', () => {
  it('attributes a pre-reassignment event to the exact immutable assignment A', () => {
    expect(decide(event())).toMatchObject({ state: 'attributed', student_id: studentA, credential_assignment_id: assignmentA });
  });
  it('attributes a later event only when it names the new assignment B and new credential reference', () => {
    expect(decide(event({ credential_ref: credentialB, credential_assignment_id: assignmentB })))
      .toMatchObject({ state: 'attributed', student_id: studentB, credential_assignment_id: assignmentB });
  });
  it('does not re-resolve an old delayed event to B after A is revoked and the ref reused', () => {
    const oldRefReassigned = { ...activeA, revoked_at: '2026-10-18T12:00:00Z' };
    const newAssignment = { ...activeB, credential_ref: credentialA, credential_version: 2 };
    const eventWithOldAssignment = event({ credential_ref: credentialA, credential_assignment_id: assignmentA,
      observed_at: '2026-10-17T08:00:00Z' });
    expect(decide(eventWithOldAssignment, { assignments: [oldRefReassigned, newAssignment] }))
      .toMatchObject({ state: 'unresolved', reason: 'assignment_revoked_before_server_processing', student_id: null });
  });
  it('never treats a device timestamp as proof to revive a revoked mapping', () => {
    const revoked = { ...activeA, revoked_at: '2026-10-18T12:00:00Z' };
    expect(decide(event({ observed_at: '2026-10-17T08:00:00Z' }), { assignments: [revoked, { ...activeB, credential_ref: credentialA }] }))
      .toMatchObject({ state: 'unresolved', student_id: null });
  });
  it('marks legacy v1 events unresolved because they lack immutable assignment identity', () => {
    expect(decide({ schema_version: 1, credential_ref: credentialA }))
      .toMatchObject({ state: 'unresolved', reason: 'legacy_event_has_no_assignment_id', student_id: null });
  });
  it('does not accept a forged/unknown assignment ID', () => {
    expect(decide(event({ credential_assignment_id: randomUUID() })))
      .toMatchObject({ state: 'unresolved', reason: 'assignment_unknown', student_id: null });
  });
  it('requires a server-signed capability bound to the registered device and exact assignment', () => {
    const input = event();
    expect(decide(input, { capabilityClaims: { assignment_id: assignmentB } }))
      .toMatchObject({ state: 'unresolved', reason: 'capability_binding_mismatch', student_id: null });
    expect(decide(input, { capabilityClaims: { device_id: 'another-device' } }))
      .toMatchObject({ state: 'unresolved', reason: 'capability_binding_mismatch', student_id: null });
  });
  it('rejects a tampered capability signature', () => {
    const input = event();
    const token = signedToken({
      token_version: 1, key_id: 'test-key-1', assignment_id: assignmentA, assignment_version: 1,
      credential_ref: credentialA, school_id: schoolA, device_id: input.device_id,
      not_before: '2026-10-19T00:00:00Z', expires_at: '2026-10-20T00:00:00Z',
    });
    const [payload] = token.split('.');
    const invalid = verifyAssignmentCapability(`${payload}.tampered`, capabilityKeys.publicKey, {
      assignmentId: input.credential_assignment_id, assignmentVersion: 1, credentialRef: input.credential_ref,
      schoolId: schoolA, deviceId: input.device_id,
    }, Date.parse(receivedAt));
    expect(invalid).toMatchObject({ valid: false, reason: 'capability_signature_invalid' });
  });
  it('rejects an assignment ID paired with a different credential reference', () => {
    expect(decide(event({ credential_ref: credentialB })))
      .toMatchObject({ state: 'unresolved', reason: 'assignment_credential_mismatch', student_id: null });
  });
  it('does not attribute an unsupported or stale assignment version', () => {
    expect(decide(event(), { assignments: [{ ...activeA, credential_version: 2 }] }))
      .toMatchObject({ state: 'unresolved', reason: 'assignment_version_mismatch', student_id: null });
  });
  it('does not cross school boundaries even when an assignment ID is known', () => {
    const otherSchool = { ...activeA, school_id: schoolB };
    expect(decide(event(), { assignments: [otherSchool] }))
      .toMatchObject({ state: 'unresolved', reason: 'assignment_outside_device_school', student_id: null });
  });
  it('keeps uncertain device time from proving event-time ownership', () => {
    const revoked = { ...activeA, revoked_at: '2026-10-18T12:00:00Z' };
    expect(decide(event({ observed_at: 'not-trusted-clock' }), { assignments: [revoked, { ...activeB, credential_ref: credentialA }] }))
      .toMatchObject({ state: 'unresolved', student_id: null });
  });
  it('returns the original result for a replayed event with an identical payload hash', () => {
    const input = event(); const result = decide(input);
    expect(decide(input, { priorReceipt: { payload_hash: hash(input), result } }))
      .toMatchObject({ state: 'attributed', student_id: studentA, duplicate: true });
  });
  it('preserves an already accepted historical result after later revocation', () => {
    const input = event(); const result = decide(input);
    const revoked = { ...activeA, revoked_at: '2026-10-18T12:00:00Z' };
    expect(decide(input, { assignments: [revoked, activeB], priorReceipt: { payload_hash: hash(input), result } }))
      .toMatchObject({ state: 'attributed', student_id: studentA, duplicate: true });
  });
  it('conflicts if the same event ID changes assignment evidence', () => {
    const first = event(); const storedHash = hash(first);
    expect(decide(event({ event_id: first.event_id, credential_ref: credentialB, credential_assignment_id: assignmentB }), {
      priorReceipt: { payload_hash: storedHash, result: { state: 'attributed', student_id: studentA } },
    })).toMatchObject({ state: 'conflict', reason: 'event_id_reused_with_changed_payload' });
  });
  it('keeps replaced/lost-card delayed submissions unresolved rather than assigning the replacement owner', () => {
    const revoked = { ...activeA, revoked_at: '2026-10-18T12:00:00Z' };
    expect(decide(event({ credential_assignment_id: assignmentA }), { assignments: [revoked, activeB] }))
      .toMatchObject({ state: 'unresolved', student_id: null });
  });
  it('does not resolve any event after device revocation', () => {
    expect(decide(event(), { device: { ...device, active: false } }))
      .toMatchObject({ state: 'unresolved', reason: 'device_inactive', student_id: null });
  });
  it('models concurrent sync/revoke as one serialized database outcome: sync wins => A, revoke wins => review', () => {
    const syncWins = decide(event(), { receivedAt: '2026-10-18T11:59:59Z', assignments: [
      { ...activeA, revoked_at: '2026-10-18T12:00:00Z' }, { ...activeB, credential_ref: credentialA },
    ] });
    const revokeWins = decide(event(), { receivedAt: '2026-10-18T12:00:01Z', assignments: [
      { ...activeA, revoked_at: '2026-10-18T12:00:00Z' }, { ...activeB, credential_ref: credentialA },
    ] });
    expect(syncWins).toMatchObject({ state: 'attributed', student_id: studentA });
    expect(revokeWins).toMatchObject({ state: 'unresolved', student_id: null });
  });
  it('requires an active school-scoped assignment for new automatic attribution', () => {
    expect(decide(event(), { assignments: [{ ...activeA, student_active: false }] }))
      .toMatchObject({ state: 'unresolved', reason: 'student_inactive', student_id: null });
  });
  it('rejects unexpected personal-identity fields from the proposed v2 event', () => {
    expect(decide(event({ student_id: studentA, student_name: 'synthetic name' })))
      .toMatchObject({ state: 'invalid', reason: 'invalid_v2_event_shape' });
  });
});
