// Trusted host adapter; never imported by M7 or the read-only monitor.
// Reviewed enrollment is required. No UID lookup against school/student tables.
import {createHash,createHmac,createPublicKey,timingSafeEqual} from 'node:crypto';
import {parseFrame} from './protocol.mjs';
import {eventFromAcquisition,captureAcquisition} from '../rfid-gateway/reader-adapter.mjs';
import {verifyAssignmentCapability,capabilityMatchesEvent} from '../rfid-simulator/event-v2.ts';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
export const cardDigest=(uid,key)=>createHmac('sha256',key).update(uid).digest('hex');
const refuse=code=>{throw Error(code);};
function verifyCapability(e,b,now,requireCurrent){
  let v;try{v=verifyAssignmentCapability(e.capability,createPublicKey(b.capabilityPublicKey),Math.floor(now/1000));}catch{refuse('assignment_capability_refused');}
  const event=eventFromAcquisition({acquisitionId:b.sessionId,sequence:1,observedAt:new Date(now).toISOString(),eventType:b.eventType},e);
  if(!v.ok||v.claims.school_id!==b.schoolId||!capabilityMatchesEvent(v.claims,event)||(requireCurrent&&!v.timeValid))refuse('assignment_capability_refused');
}
export function prepareReviewedLocalReader(store,enrollment,binding){
  if(binding?.reviewedEnrollment!==true||binding.mode!=='physical_legacy_host_receipt_time'||!uuid.test(enrollment?.readerId??'')||!/^[a-f0-9]{64}$/.test(enrollment.readerKey??''))refuse('reviewed_physical_binding_required');
  verifyCapability(enrollment,binding,Date.now(),true);
  const reader=store.getReader(enrollment.readerId),hash=hashReaderKey(enrollment.readerKey);
  if(reader){if(!reader.active||reader.device_id!==enrollment.deviceId||reader.token_sha256!==hash)refuse('reader_unauthorized');return;}
  store.registerReader({readerId:enrollment.readerId,deviceId:enrollment.deviceId,tokenHash:hash,now:new Date().toISOString()});
}
function eventIdentity(session,uidHash,uptime){
  const hex=digest(`schovera-legacy-host-observation-v1\n${session}\n${uidHash}\n${uptime}`).split('');
  hex[12]='8';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);const h=hex.join('').slice(0,32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** Experimental bounded legacy ingestion. The gateway queue remains the ONLY
 * outgoing store. A namespaced cursor is metadata, committed in the SAME ingress
 * transaction via its existing beforeCommit hook. Source power-loss is NOT safe.
 */
export class LegacyGatewayCapture {
  constructor({store,enrollment,binding,now=()=>Date.now(),requireUnusedSession=false}){
    if(!binding||binding.version!==1||binding.mode!=='physical_legacy_host_receipt_time'
      ||!uuid.test(binding.sessionId??'')||!uuid.test(binding.schoolId??'')
      ||!/^.{1,256}$/.test(binding.sourceIdentity??'')
      ||!/^[a-f0-9]{64}$/.test(binding.uidKey??'')||!/^[a-f0-9]{64}$/.test(binding.uidDigest??'')
      ||!['check_in','check_out'].includes(binding.eventType)||binding.reviewedEnrollment!==true)refuse('reviewed_physical_binding_required');
    Object.assign(this,{store,enrollment,binding,now});this.closed=false;
    this.worker=store.acquireWorker();if(!this.worker)refuse('gateway_worker_busy');
    try{
      this.verify(false);
      const hash=digest(JSON.stringify({binding,enrollment}));
      store.db.exec(`CREATE TABLE IF NOT EXISTS physical_legacy_sessions (
        session_id TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,last_uptime INTEGER,
        needs_review INTEGER NOT NULL DEFAULT 0 CHECK(needs_review IN (0,1))
      ) STRICT;`);
      const row=this.cursor();
      if(requireUnusedSession&&(row||Number(store.db.prepare('SELECT COUNT(*) AS n FROM gateway_events WHERE device_id=?').get(enrollment.deviceId).n)!==0))refuse('session_or_device_already_used');
      if(row&&row.binding_hash!==hash)refuse('capture_binding_changed');
      if(!row){
        if(Number(store.db.prepare('SELECT COUNT(*) AS n FROM physical_legacy_sessions').get().n)>=1000)refuse('session_capacity');
        store.db.prepare('INSERT INTO physical_legacy_sessions(session_id,binding_hash) VALUES(?,?)').run(binding.sessionId,hash);
      }
    }catch(error){store.releaseWorker(this.worker);throw error;}
  }
  cursor(){return this.store.db.prepare('SELECT * FROM physical_legacy_sessions WHERE session_id=?').get(this.binding.sessionId);}
  verify(requireCurrent=true){
    const {enrollment:e,binding:b}=this;
    const reader=this.store.getReader(e.readerId);
    if(!reader?.active||reader.device_id!==e.deviceId||reader.token_sha256!==hashReaderKey(e.readerKey))refuse('reader_unauthorized');
    verifyCapability(e,b,this.now(),requireCurrent);
  }
  hold(){this.store.db.prepare('UPDATE physical_legacy_sessions SET needs_review=1 WHERE session_id=?').run(this.binding.sessionId);}
  capture(line,options={}){
    if(this.closed)refuse('capture_closed');
    const f=parseFrame(line);
    if(f.type==='legacy_ready'){
      if(this.cursor().last_uptime!==null){this.hold();refuse('reset_requires_new_reviewed_session');}
      return {code:'ready_indication',durable:false};
    }
    if(f.type==='legacy_version')return {code:'version_indication',durable:false};
    if(f.type!=='legacy_scan')refuse('legacy_scan_required');
    const {binding:b,enrollment:e}=this;
    const hash=cardDigest(f.uid,b.uidKey);
    if(!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(b.uidDigest,'hex')))refuse('card_not_enrolled');
    const id=eventIdentity(b.sessionId,hash,f.deviceUptimeMs),prior=this.store.getEvent(e.deviceId,id);
    this.verify(!prior);
    if(prior){
      // Immutable stored content is reused; no new timestamp/sequence is invented.
      const event=JSON.parse(prior.canonical_payload);
      if(event.credential_assignment_id!==e.assignmentId||event.assignment_capability!==e.capability)refuse('stored_binding_conflict');
      const receipt=captureAcquisition(this.store,{acquisitionId:id,sequence:event.device_sequence,observedAt:event.observed_at,eventType:event.event_type},e);
      return {code:'local_observation_committed',eventId:id,receipt,duplicate:true,durable:true,timestampBasis:'host_received_at',physicalTapCountVerified:false};
    }
    const cursor=this.cursor();
    if(cursor.needs_review)refuse('session_held_for_review');
    if(cursor.last_uptime!==null&&f.deviceUptimeMs<=cursor.last_uptime){this.hold();refuse('uptime_regressed_requires_review');}
    const observedAt=new Date(this.now()).toISOString();
    const sequence=this.store.sequenceMaximum(e.readerId)+1;
    const receipt=captureAcquisition(this.store,{acquisitionId:id,sequence,observedAt,eventType:b.eventType},e,{
      ...options,beforeCommit:()=>{
        this.store.db.prepare('UPDATE physical_legacy_sessions SET last_uptime=? WHERE session_id=?').run(f.deviceUptimeMs,b.sessionId);
        options.beforeCommit?.();
      },
    });
    return {code:'local_observation_committed',eventId:id,receipt,duplicate:false,durable:true,timestampBasis:'host_received_at',physicalTapCountVerified:false};
  }
  close(){if(!this.closed){this.closed=true;this.store.releaseWorker(this.worker);}}
}
