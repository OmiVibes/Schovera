import {createHash} from 'node:crypto';
export const MAX_BYTES=512;
export const DEVICE='uno-r4-wifi-phase1';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function validateMessage(text,{sessionId,device=DEVICE}={}){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES)throw Error('message_size');
  let value;try{value=JSON.parse(text);}catch{throw Error('message_json');}
  const keys=['schema','version','kind','device','session_id','acquisition_id','sequence','observed_at','event_type'];
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error('message_schema');
  if(value.schema!=='schovera.arduino.acquisition'||value.version!==1||value.kind!=='synthetic'||value.event_type!=='check_in')throw Error('synthetic_schema_required');
  if(!uuid.test(sessionId??'')||value.session_id!==sessionId||value.device!==device||!uuid.test(value.acquisition_id))throw Error('device_or_session');
  if(!Number.isSafeInteger(value.sequence)||value.sequence<1||value.sequence>2147483647)throw Error('sequence');
  if(typeof value.observed_at!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/.test(value.observed_at)||!Number.isFinite(Date.parse(value.observed_at))||new Date(value.observed_at).toISOString()!==value.observed_at)throw Error('observed_time');
  return {acquisitionId:value.acquisition_id,sequence:value.sequence,observedAt:value.observed_at,eventType:'check_in'};
}
// Bounded validation history, NOT an outbox. Restart deliberately forgets it.
export class DryRunSession {
  constructor(sessionId,{maxObservations=128,now=()=>Date.now(),ttlMs=15*60_000}={}){if(!uuid.test(sessionId))throw Error('session_id');this.sessionId=sessionId;this.maxObservations=maxObservations;this.now=now;this.expires=now()+ttlMs;this.active=true;this.ids=new Map();this.sequences=new Map();this.maximum=0;}
  revoke(){this.active=false;}
  accept(text){
    if(!this.active||this.now()>=this.expires)throw Error('session_revoked_or_expired');
    const a=validateMessage(text,{sessionId:this.sessionId}),hash=createHash('sha256').update(JSON.stringify(a)).digest('hex');
    if(this.ids.has(a.acquisitionId)){if(this.ids.get(a.acquisitionId)!==hash)throw Error('acquisition_conflict');return {...this.result(a),duplicate:true};}
    if(this.sequences.has(a.sequence))throw Error('sequence_conflict');
    if(this.ids.size>=this.maxObservations)throw Error('validation_capacity');
    const ordering=a.sequence===this.maximum+1?'in_order':a.sequence>this.maximum+1?'gap':'out_of_order';
    this.ids.set(a.acquisitionId,hash);this.sequences.set(a.sequence,a.acquisitionId);this.maximum=Math.max(this.maximum,a.sequence);
    return {...this.result(a),duplicate:false,sequence_state:ordering};
  }
  result(a){return {outcome:'validated_only',acquisition:a,synthetic:true,durable:false,destinationDelivered:false,physicalHardwareVerified:false};}
}
