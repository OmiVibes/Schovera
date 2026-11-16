// Acquisition boundary only. Credentials must come from reviewed enrollment,
// never a raw UID lookup guessed by this adapter. No network or attendance writes.
import {validateGatewayEvent} from './event-contract.mjs';
import {signReaderSubmission,ingestReaderSubmission} from './ingress.mjs';

export class ReaderUnavailable extends Error {
  constructor(code){super(code);this.name='ReaderUnavailable';this.code=code;}
}

/** Future driver contract: read() returns a stable acquisition or throws.
 * A missing driver is never reported as connected hardware. No pins/bus assumed.
 */
export class UnconfiguredPhysicalReader {
  status(){return {mode:'physical_unconfigured',state:'reader_not_configured',physicalConnectionVerified:false};}
  async read(){throw new ReaderUnavailable('reader_not_configured');}
}

/** Map an already-enrolled, timestamped acquisition into the unchanged v2 wire
 * contract. acquisitionId and sequence must be durable at the acquisition source
 * until local acknowledgement; retry must retain ALL fields, including time.
 */
export function eventFromAcquisition(acquisition,enrollment){
  const allowed=['acquisitionId','sequence','observedAt','eventType'];
  if(!acquisition||Object.keys(acquisition).some(key=>!allowed.includes(key)))throw new ReaderUnavailable('unsupported_acquisition');
  if(!enrollment||!enrollment.readerId||!enrollment.deviceId)throw new ReaderUnavailable('reader_not_configured');
  const event={schema_version:2,event_id:acquisition.acquisitionId,device_id:enrollment.deviceId,
    credential_ref:enrollment.credentialRef,credential_assignment_id:enrollment.assignmentId,
    credential_assignment_version:enrollment.assignmentVersion??1,assignment_capability:enrollment.capability,
    event_type:acquisition.eventType,observed_at:acquisition.observedAt,device_sequence:acquisition.sequence};
  const result=validateGatewayEvent(event);
  if(!result.ok)throw new ReaderUnavailable('invalid_acquisition');
  return result.event;
}

export function captureAcquisition(store,acquisition,enrollment,options={}){
  const event=eventFromAcquisition(acquisition,enrollment);
  const submission=signReaderSubmission(event,{readerId:enrollment.readerId,key:enrollment.readerKey});
  submission.readerKey=enrollment.readerKey;
  return ingestReaderSubmission(store,submission,options);
}
