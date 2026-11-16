import { createHash } from 'node:crypto';
import {eventFromAcquisition,ReaderUnavailable} from '../rfid-gateway/reader-adapter.mjs';

/** Deterministic software adapter: never reads a physical card or board. */
export function mockReaderEvent(enrollment,scenario,observedAt) {
  const sequence={scan:1,separate:2,delayed:3,revoked:4,offline:5,unknown:6,device_revoked:7,gap:10,out_of_order:8}[scenario];
  if(!sequence||!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid synthetic reader scenario');
  const id=createHash('sha256').update(`schovera-m2:${enrollment.deviceId}:${scenario}`).digest('hex').slice(0,32).split('');
  id[12]='4';id[16]='8';const hex=id.join('');
  return {schema_version:2,event_id:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
    device_id:enrollment.deviceId,credential_ref:enrollment.credentialRef,credential_assignment_id:enrollment.assignmentId,
    credential_assignment_version:1,assignment_capability:enrollment.capability,event_type:'check_in',observed_at:observedAt,device_sequence:sequence};
}

/** In-process mock driver, not evidence of a physically connected reader. */
export class MockReaderAdapter {
  constructor(enrollment,{available=true}={}){this.enrollment=enrollment;this.available=available;}
  status(){return {mode:'mock',state:this.available?'mock_reader_active':'reader_offline',physicalConnectionVerified:false};}
  async read(scenario,observedAt){
    if(!this.available)throw new ReaderUnavailable('reader_offline');
    const event=mockReaderEvent(this.enrollment,scenario,observedAt);
    const acquisition={acquisitionId:event.event_id,sequence:event.device_sequence,observedAt:event.observed_at,eventType:event.event_type};
    // Assert mock and future acquisition mapping retain the existing wire shape.
    eventFromAcquisition(acquisition,this.enrollment);
    return acquisition;
  }
}
