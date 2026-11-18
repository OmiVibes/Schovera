// Trusted HOST-only fictional enrollment. No Serial port or network listener here.
import {createHash,createPublicKey,randomUUID} from 'node:crypto';
import {validateMessage,DEVICE} from '../arduino-local/protocol.mjs';
import {verifyAssignmentCapability,capabilityMatchesEvent} from '../rfid-simulator/event-v2.ts';
import {eventFromAcquisition,captureAcquisition} from '../rfid-gateway/reader-adapter.mjs';
import {canonicalGatewayEvent,gatewayEventHash} from '../rfid-gateway/event-contract.mjs';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class UsbCaptureRefusal extends Error {constructor(code){super(code);this.code=code;}}
const refuse=code=>{throw new UsbCaptureRefusal(code);};
export const enrollmentDigest=e=>createHash('sha256').update(JSON.stringify(e)).digest('hex');

export function verifyUsbBinding(scope,enrollment,now=Date.now(),{existingOnly=false}={}) {
  if(!scope||scope.version!==1||scope.mode!=='m7c_synthetic_usb'||enrollment?.mode!=='synthetic_local_only'
    ||!['runId','schoolId','sessionId','ownerId','studentId','principalId'].every(k=>UUID.test(scope[k]??''))
    ||scope.runId!==enrollment.runId||scope.enrollmentSha256!==enrollmentDigest(enrollment)
    ||!Number.isSafeInteger(scope.createdAt)||!Number.isSafeInteger(scope.expiresAt)
    ||scope.expiresAt-scope.createdAt!==15*60_000||scope.createdAt>now+5000)refuse('synthetic_binding_refused');
  if(!existingOnly&&now>=scope.expiresAt)refuse('usb_session_expired');
  let verified;try{verified=verifyAssignmentCapability(enrollment.capability,createPublicKey(scope.capabilityPublicKey),Math.floor(now/1000));}catch{refuse('assignment_capability_refused');}
  const probe=eventFromAcquisition({acquisitionId:scope.sessionId,sequence:1,observedAt:new Date(now).toISOString(),eventType:'check_in'},enrollment);
  if(!verified.ok||(!existingOnly&&!verified.timeValid)||verified.claims.school_id!==scope.schoolId
    ||verified.claims.key_id!==scope.keyId||!capabilityMatchesEvent(verified.claims,probe))refuse('assignment_capability_refused');
  return verified.claims;
}

export function syntheticLine(sessionId,a) {
  return JSON.stringify({schema:'schovera.arduino.acquisition',version:1,kind:'synthetic',device:DEVICE,
    session_id:sessionId,acquisition_id:a.acquisitionId,sequence:a.sequence,observed_at:a.observedAt,event_type:a.eventType});
}

export class TrustedUsbCapture {
  constructor({store,scope,enrollment,authorize,now=()=>Date.now()}) {
    if(typeof authorize!=='function')refuse('fresh_host_authorization_required');
    verifyUsbBinding(scope,enrollment,now(),{existingOnly:true});
    this.store=store;this.scope=scope;this.enrollment=enrollment;this.authorize=authorize;this.now=now;
    this.intent=null;this.lastIssuedSequence=0;this.inFlight=null;this.closed=false;
    this.worker=store.acquireWorker();if(!this.worker)refuse('gateway_worker_busy');
    try{this.reader();}catch(error){store.releaseWorker(this.worker);throw error;}
  }
  reader() {
    if(this.closed)refuse('gateway_capture_closed');
    const lease=this.store.db.prepare('SELECT token,pid FROM gateway_delivery_worker WHERE id=1').get();
    if(!lease||lease.token!==this.worker||Number(lease.pid)!==process.pid)refuse('gateway_worker_busy');
    const reader=this.store.getReader(this.enrollment.readerId);
    if(!reader?.active)refuse('reader_unauthorized');
    if(reader.device_id!==this.enrollment.deviceId||reader.token_sha256!==hashReaderKey(this.enrollment.readerKey))refuse('reader_identity_mismatch');
  }
  async authorized() {
    verifyUsbBinding(this.scope,this.enrollment,this.now());this.reader();
    let allowed=false;try{allowed=await this.authorize();}catch{refuse('fresh_host_authorization_unavailable');}
    if(allowed!==true)refuse('fresh_host_authorization_refused');
    verifyUsbBinding(this.scope,this.enrollment,this.now());this.reader();
  }
  async issueIntent() {
    if(this.intent)return this.intent;
    await this.authorized();
    if(this.intent)return this.intent;
    if(this.store.eventCount()>=this.store.maxEvents)refuse('queue_capacity');
    // One firmware RAM slot. Never pre-insert an event before incoming Serial.
    const sequence=Math.max(this.store.sequenceMaximum(this.enrollment.readerId),this.lastIssuedSequence)+1;
    const acquisition={acquisitionId:randomUUID(),sequence,observedAt:new Date(this.now()).toISOString(),eventType:'check_in'};
    const text=syntheticLine(this.scope.sessionId,acquisition);validateMessage(text,{sessionId:this.scope.sessionId});
    this.intent={acquisition,text,command:`ARM ${this.scope.sessionId} ${acquisition.acquisitionId} ${sequence} ${acquisition.observedAt}`};
    this.lastIssuedSequence=sequence;return this.intent;
  }
  receive(text,hooks={}) {
    let acquisition;try{acquisition=validateMessage(text,{sessionId:this.scope.sessionId});}catch{refuse('invalid_or_foreign_usb_acquisition');}
    const event=eventFromAcquisition(acquisition,this.enrollment),canonical=canonicalGatewayEvent(event);
    if(this.inFlight){if(this.inFlight.canonical!==canonical)refuse('capture_busy_or_conflicting');return this.inFlight.promise;}
    const promise=this.capture(acquisition,event,canonical,hooks).finally(()=>{this.inFlight=null;});
    this.inFlight={canonical,promise};return promise;
  }
  async capture(acquisition,event,canonical,hooks) {
    this.reader();verifyUsbBinding(this.scope,this.enrollment,this.now(),{existingOnly:true});
    const prior=this.store.getEvent(event.device_id,event.event_id);
    if(prior){if(prior.reader_id!==this.enrollment.readerId||prior.canonical_payload!==canonical||prior.payload_hash!==gatewayEventHash(event))refuse('event_conflict');}
    else {
      if(!this.intent||JSON.stringify(this.intent.acquisition)!==JSON.stringify(acquisition))refuse('operator_intent_required');
      await this.authorized();
    }
    // Existing HMAC validation + WAL/FULL SQLite transaction + post-commit ACK.
    const receipt=captureAcquisition(this.store,acquisition,this.enrollment,{now:this.now(),...hooks});
    const proof=this.receipt(acquisition.acquisitionId);
    if(receipt.outcome!=='recorded_locally'||receipt.local_receipt_id!==proof.receipt.local_receipt_id
      ||receipt.received_at!==proof.receipt.received_at||receipt.event_id!==proof.receipt.event_id)refuse('local_receipt_mismatch');
    return {...proof,receipt};
  }
  receipt(eventId) {
    if(!UUID.test(eventId))refuse('invalid_acquisition_id');
    verifyUsbBinding(this.scope,this.enrollment,this.now(),{existingOnly:true});
    const row=this.store.getEvent(this.enrollment.deviceId,eventId);if(!row)refuse('no_committed_local_receipt');
    let event;try{event=JSON.parse(row.canonical_payload);}catch{refuse('stored_event_corrupt');}
    const mapped=eventFromAcquisition({acquisitionId:eventId,sequence:event.device_sequence,observedAt:event.observed_at,eventType:event.event_type},this.enrollment);
    if(row.reader_id!==this.enrollment.readerId||row.canonical_payload!==canonicalGatewayEvent(mapped)||row.payload_hash!==gatewayEventHash(mapped)
      ||!UUID.test(row.local_receipt_id)||!Number.isFinite(Date.parse(row.local_received_at)))refuse('local_receipt_mismatch');
    return {receipt:{local_receipt_id:row.local_receipt_id,event_id:row.event_id,outcome:'recorded_locally',queue_state:row.queue_state,
      sequence_state:row.sequence_state,received_at:row.local_received_at},durable:true,destinationDelivered:false,
      synthetic:true,classroomConfirmation:'Teacher action required'};
  }
  releaseIntent(eventId) {
    // This permits an operator-requested CLEAR only AFTER a real receipt read.
    const result=this.receipt(eventId);
    if(this.intent?.acquisition.acquisitionId===eventId)this.intent=null;
    return result;
  }
  close(){if(!this.closed){this.closed=true;this.store.releaseWorker(this.worker);}}
}
