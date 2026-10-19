import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { capabilityMatchesEvent, signAssignmentCapability, validateEventV2, verifyAssignmentCapability, type DeviceEventV2 } from './event-v2';

const ids = {
  event: 'f10f4d70-1e5a-4b98-9c18-2d30cedc0081', device: 'a10f4d70-1e5a-4b98-9c18-2d30cedc0082',
  assignment: 'b10f4d70-1e5a-4b98-9c18-2d30cedc0083', school: 'c10f4d70-1e5a-4b98-9c18-2d30cedc0084',
};

function fixture() {
  const pair = generateKeyPairSync('ed25519');
  const claims = { token_version: 1 as const, key_id: 'synthetic-key-v1', assignment_id: ids.assignment,
    assignment_version: 3, credential_ref: 'opaque-ref-3', device_id: ids.device, school_id: ids.school,
    not_before: 1_800_000_000, expires_at: 1_900_000_000 };
  const event: DeviceEventV2 = { schema_version: 2, event_id: ids.event, device_id: ids.device,
    credential_ref: claims.credential_ref, credential_assignment_id: claims.assignment_id,
    credential_assignment_version: claims.assignment_version,
    assignment_capability: signAssignmentCapability(claims, pair.privateKey), event_type: 'check_in',
    observed_at: '2026-10-19T08:12:21+05:30', device_sequence: 1842 };
  return { pair, claims, event };
}

describe('RFID event v2 contract and capability', () => {
  it('validates a strict v2 event, accepts optional gateway receipt ID, rejects identity injection', () => {
    const { event } = fixture();
    expect(validateEventV2(event).ok).toBe(true);
    expect(validateEventV2({ ...event, gateway_receipt_id: ids.event }).ok).toBe(true);
    expect(validateEventV2({ ...event, student_id: ids.event }).ok).toBe(false);
    expect(validateEventV2({ ...event, schema_version: 1 }).ok).toBe(false);
    expect(validateEventV2({ ...event, credential_assignment_id: 'not-a-uuid' }).ok).toBe(false);
    expect(validateEventV2({ ...event, credential_assignment_version: 0 }).ok).toBe(false);
    expect(validateEventV2({ ...event, observed_at: '2026-02-31T08:12:21Z' }).ok).toBe(false);
  });

  it('verifies a domain-separated Ed25519 assignment token and exact event binding', () => {
    const { pair, claims, event } = fixture();
    const verified = verifyAssignmentCapability(event.assignment_capability, pair.publicKey, 1_850_000_000);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(capabilityMatchesEvent(verified.claims, event)).toBe(true);
    const expired = verifyAssignmentCapability(event.assignment_capability, pair.publicKey, 1_900_000_000);
    expect(expired.ok && expired.timeValid).toBe(false);
    expect(verifyAssignmentCapability(event.assignment_capability, generateKeyPairSync('ed25519').publicKey, 1_850_000_000).ok).toBe(false);
    expect(claims.assignment_id).toBe(event.credential_assignment_id);
  });

  it('rejects an otherwise valid capability if any identity binding differs', () => {
    const { claims, event } = fixture();
    expect(capabilityMatchesEvent(claims, { ...event, device_id: ids.school })).toBe(false);
    expect(capabilityMatchesEvent(claims, { ...event, credential_ref: 'other-ref' })).toBe(false);
    expect(capabilityMatchesEvent(claims, { ...event, credential_assignment_id: ids.school })).toBe(false);
  });
});
