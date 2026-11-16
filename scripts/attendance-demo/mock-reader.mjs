import { createHash } from 'node:crypto';

/** Deterministic software adapter: never reads a physical card or board. */
export function mockReaderEvent(enrollment,scenario,observedAt) {
  const sequence={scan:1,separate:2,delayed:3,revoked:4}[scenario];
  if(!sequence||!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid synthetic reader scenario');
  const id=createHash('sha256').update(`schovera-m2:${enrollment.deviceId}:${scenario}`).digest('hex').slice(0,32).split('');
  id[12]='4';id[16]='8';const hex=id.join('');
  return {schema_version:2,event_id:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
    device_id:enrollment.deviceId,credential_ref:enrollment.credentialRef,credential_assignment_id:enrollment.assignmentId,
    credential_assignment_version:1,assignment_capability:enrollment.capability,event_type:'check_in',observed_at:observedAt,device_sequence:sequence};
}
