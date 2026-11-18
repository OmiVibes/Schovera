import {randomUUID} from 'node:crypto';
import {DryRunSession,validateMessage} from './protocol.mjs';
import {SerialLines} from './serial-lines.mjs';
import {postValidation,validateAccess} from './validation-client.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const safeFailure=new Set(['receiver_authorization_denied','receiver_session_or_schema_refused','receiver_request_refused',
  'receiver_unavailable_or_response_lost','validation_response_lost','validation_timeout','invalid_validation_response']);

// One bounded RAM observation, NOT a durable outbox. No signing/database/attendance.
export class SerialBridge {
  constructor({access,write,report=()=>{},send=postValidation,now=()=>Date.now()}) {
    this.access=validateAccess(access);this.write=write;this.report=report;this.send=send;this.now=now;
    this.history=new DryRunSession(access.sessionId,{now});this.pending=null;this.inFlight=null;
    this.awaitingArm=null;this.discardId=null;this.sequence=0;this.connected=true;
    this.lines=new SerialLines(line=>this.line(line));
  }
  feed(bytes) {if(this.connected)this.lines.push(bytes);}
  line(line) {
    if(line.type==='diag') {
      this.report({event:'diagnostic',code:line.code});
      if(line.code==='discarded_ram_only'&&this.discardId){
        if(this.pending?.id===this.discardId)this.pending=null;
        if(this.awaitingArm?.id===this.discardId)this.awaitingArm=null;
        this.discardId=null;
      }
      if(line.code==='boot')this.report({event:'device_boot_observed',ramStateMayBeLost:true,durable:false});
      return;
    }
    if(line.type==='rejected'){this.report({event:'serial_rejected',code:line.code});return;}
    try {
      // An old synthetic RAM observation may survive a PC receiver restart.
      // Identify it safely for explicit operator discard, never rebind/forward it.
      let old;try {old=JSON.parse(line.text);} catch {throw Error('invalid_json');}
      if(old?.session_id!==this.access.sessionId){
        const stale=validateMessage(line.text,{sessionId:old?.session_id});
        this.report({event:'stale_synthetic_session',acquisitionId:stale.acquisitionId,forwarded:false,requiresExplicitDiscard:true});return;
      }
      const acquisition=validateMessage(line.text,{sessionId:this.access.sessionId});
      if(this.discardId || (this.pending&&this.pending.text!==line.text))throw Error('single_ram_observation_busy');
      const local=this.history.accept(line.text);
      if(!this.pending)this.pending={id:acquisition.acquisitionId,text:line.text,validated:false,ordering:local.sequence_state};
      if(this.awaitingArm?.id===acquisition.acquisitionId)this.awaitingArm=null;
      this.sequence=Math.max(this.sequence,acquisition.sequence);
      this.report({event:'synthetic_serial_received',acquisitionId:acquisition.acquisitionId,sequence:acquisition.sequence});
      void this.forward();
    } catch {this.report({event:'serial_rejected',code:'schema_session_conflict_or_busy'});}
  }
  forward() {
    if(this.inFlight)return this.inFlight;
    if(!this.pending)return Promise.resolve();
    const observation=this.pending;
    this.inFlight=(async()=>{
      try {
        const value=await this.send(observation.text,this.access);
        observation.validated=true;
        this.report({event:'validated_only',acquisitionId:observation.id,duplicate:value.duplicate,
          sequence_state:value.sequence_state??observation.ordering,durable:false,destinationDelivered:false});
      } catch(error) {this.report({event:'validation_unconfirmed',code:safeFailure.has(error.message)?error.message:'validation_failed',
        retainedInHostRam:true,durable:false,destinationDelivered:false});}
    })().finally(()=>{this.inFlight=null;});
    return this.inFlight;
  }
  async command(text) {
    if(!this.connected)throw Error('serial_closed_select_and_confirm_again');
    if(text==='status'){await this.write('STATUS');return;}
    if(text==='retry'){await this.write('RETRY');return;}
    if(text==='retry-validation'){await this.forward();return;}
    if(text.startsWith('discard ')) {
      const id=text.slice(8);if(!UUID.test(id)||this.inFlight)throw Error('discard_refused');
      this.discardId=id;await this.write('CLEAR '+id);return;
    }
    if(text!=='arm')throw Error('unsupported_operator_command');
    if(this.pending||this.discardId||!this.history.active||this.now()>=this.history.expires)throw Error('pending_or_expired_use_retry_or_explicit_discard');
    if(!this.awaitingArm){
      const id=randomUUID(),sequence=this.sequence+1,at=new Date(this.now()).toISOString();
      const sample=JSON.stringify({schema:'schovera.arduino.acquisition',version:1,kind:'synthetic',device:'uno-r4-wifi-phase1',
        session_id:this.access.sessionId,acquisition_id:id,sequence,observed_at:at,event_type:'check_in'});
      validateMessage(sample,{sessionId:this.access.sessionId});
      this.awaitingArm={id,line:`ARM ${this.access.sessionId} ${id} ${sequence} ${at}`};this.sequence=sequence;
    }
    // Repeated ARM before observation resends the exact identity/time, not a new event.
    await this.write(this.awaitingArm.line);
    this.report({event:'synthetic_arm_command_sent',acquisitionId:this.awaitingArm.id,physicalReceiptNotYetProven:true});
  }
  disconnected() {this.connected=false;this.lines.reset();this.report({event:'serial_closed',pendingOnlyInRam:!!this.pending,durable:false,requiresNewPortConfirmation:true});}
}
