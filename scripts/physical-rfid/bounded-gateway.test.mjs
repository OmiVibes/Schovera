import {it,expect,afterEach,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {signAssignmentCapability} from '../rfid-simulator/event-v2.ts';
import {LegacyGatewayCapture,prepareReviewedLocalReader,cardDigest} from './legacy-gateway.mjs';
import {captureOne,deliverOne,checkApproval} from './bounded-gateway.mjs';
import {LocalSupabaseV2Transport} from '../rfid-gateway/local-v2-transport.mjs';
import {parseArgs} from './bounded-test-cli.mjs';
const cleanup=[];afterEach(()=>{vi.useRealTimers();for(const fn of cleanup.splice(0).reverse())fn();});
const uid='FA:CE:B0:0C',scan=n=>`SCHOVERA_SCAN,${uid},${n}\n`;
class Mock extends EventEmitter{start=vi.fn();forceKill=vi.fn();close=vi.fn(async()=>({exited:true,workerConfirmed:true}));}
function fixture(){
  const dir=mkdtempSync(path.join(os.tmpdir(),'schovera-bounded-unit-'));
  cleanup.push(()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('schovera-bounded-unit-'))throw Error('unsafe cleanup');rmSync(dir,{recursive:true});});
  const file=path.join(dir,'gateway.sqlite');let store=openGatewayDatabase(file,{recoverOnOpen:false});cleanup.push(()=>store.close());
  const pair=generateKeyPairSync('ed25519');const now=Date.now();
  const enrollment={readerId:randomUUID(),readerKey:'a'.repeat(64),deviceId:randomUUID(),assignmentId:randomUUID(),assignmentVersion:1,credentialRef:'fictional-test-only'};
  const schoolId=randomUUID(),claims={token_version:1,key_id:'unit',assignment_id:enrollment.assignmentId,assignment_version:1,credential_ref:enrollment.credentialRef,device_id:enrollment.deviceId,school_id:schoolId,not_before:Math.floor(now/1000)-60,expires_at:Math.floor(now/1000)+1800};
  enrollment.capability=signAssignmentCapability(claims,pair.privateKey);
  const binding={version:1,mode:'physical_legacy_host_receipt_time',sessionId:randomUUID(),schoolId,sourceIdentity:'0403:6001:BG02XZ38',uidKey:'b'.repeat(64),eventType:'check_in',reviewedEnrollment:true,capabilityPublicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
  binding.uidDigest=cardDigest(uid,binding.uidKey);
  const serial={port:'/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0',usbId:binding.sourceIdentity,seconds:30,dtr:'off',resetRiskAccepted:true,monitorClosedConfirmed:true};
  const c={version:1,enrollment,binding,serial},a={version:1,hardwareType:'nano_rc522',fictionalOnly:true,maxNewEvents:1,maxRequests:2,deviceId:enrollment.deviceId,readerId:enrollment.readerId,schoolId,sessionId:binding.sessionId,devicePublicKeySha256:'c'.repeat(64),expiresAt:new Date(now+600000).toISOString()};
  const opts={platform:'linux',...serial};delete opts.usbId;opts.usbId=serial.usbId;delete opts.port;opts.port=serial.port;
  return {c,a,opts,file,pair,claims,get store(){return store;},reopen(){store.close();store=openGatewayDatabase(file,{recoverOnOpen:false});},seed(){prepareReviewedLocalReader(store,enrollment,binding);const cap=new LegacyGatewayCapture({store,enrollment,binding});try{return cap.capture(scan(100).trim());}finally{cap.close();}},approve(r){const row=store.getEvent(a.deviceId,r.eventId);a.eventId=r.eventId;a.payloadSha256=row.payload_hash;return row;}};
}
async function capture(f,bytes){
  const t=new Mock(),reports=[];
  const p=captureOne(f.store,f.c,f.a,f.opts,{createTransport:()=>t,report:r=>reports.push(r),processSignals:new EventEmitter()});
  t.emit('opened');t.emit('bytes',Buffer.from(bytes));return {result:await p,t,reports};
}
function remote(f,mode='accept'){
  const receipt=randomUUID(),time=new Date().toISOString();let accepted=false;
  const request=vi.fn(async(_url,body)=>{
    const event=JSON.parse(body);
    if(mode==='offline')throw Error('offline');
    if(mode==='denied')return {status:403,body:'{}'};
    const duplicate=accepted;accepted=true;
    return {status:duplicate?200:202,body:JSON.stringify({receipt_id:receipt,event_id:event.event_id,outcome:'accepted',sequence_state:'in_order',received_at:time,duplicate})};
  });
  return {request,transport:new LocalSupabaseV2Transport({target:'http://127.0.0.1:33106',devicePrivateKey:f.pair.privateKey,request})};
}
it('commits only one event even when several frames arrive in one chunk and closes immediately',async()=>{
  const f=fixture(),r=await capture(f,'SCHOVERA_RFID_READY\n'+scan(1)+scan(2)+scan(3));
  expect(r.result).toMatchObject({exitCode:0,newDurableEvents:1,captureBudgetReached:true});expect(f.store.eventCount()).toBe(1);expect(r.t.close).toHaveBeenCalledTimes(1);expect(JSON.stringify(r.reports)).not.toContain(uid);
});
it('refuses another process invocation of the same session without opening serial',async()=>{
  const f=fixture();await capture(f,scan(1));f.reopen();const make=vi.fn();await expect(captureOne(f.store,f.c,f.a,f.opts,{createTransport:make})).rejects.toThrow('session_already');expect(make).not.toHaveBeenCalled();expect(f.store.eventCount()).toBe(1);
});
it('refuses an alternate serial source before opening or modifying the queue',async()=>{
  const f=fixture(),make=vi.fn();await expect(captureOne(f.store,f.c,f.a,{...f.opts,port:'/dev/serial/by-id/OTHER'},{createTransport:make})).rejects.toThrow('source_mismatch');expect(make).not.toHaveBeenCalled();expect(f.store.eventCount()).toBe(0);
});
it('does not report successful capture when closure cannot be confirmed',async()=>{
  vi.useFakeTimers();const f=fixture(),t=new Mock();t.close=vi.fn(()=>new Promise(()=>{}));const p=captureOne(f.store,f.c,f.a,f.opts,{createTransport:()=>t,processSignals:new EventEmitter()});t.emit('opened');t.emit('bytes',Buffer.from(scan(1)));await vi.advanceTimersByTimeAsync(500);const r=await p;expect(r.exitCode).not.toBe(0);expect(r.closureEvidence).toBe('unconfirmed');expect(f.store.eventCount()).toBe(1);
});
it('enforces unused-session guard under the actual gateway worker lock',()=>{
  const f=fixture();f.seed();expect(()=>new LegacyGatewayCapture({store:f.store,enrollment:f.c.enrollment,binding:f.c.binding,requireUnusedSession:true})).toThrow('already_used');expect(f.store.eventCount()).toBe(1);
});
it.each(['hardwareType','deviceId','schoolId','sessionId','readerId','maxNewEvents','maxRequests','expiresAt'])('rejects altered approval field %s before serial',async key=>{
  const f=fixture();f.a[key]=key==='maxNewEvents'||key==='maxRequests'?3:'invalid';const make=vi.fn();await expect(captureOne(f.store,f.c,f.a,f.opts,{createTransport:make})).rejects.toThrow('approval');expect(make).not.toHaveBeenCalled();expect(f.store.eventCount()).toBe(0);
});
it('rejects forged capability without serial or captured events',async()=>{
  const f=fixture();f.c.enrollment.capability+='x';const make=vi.fn();await expect(captureOne(f.store,f.c,f.a,f.opts,{createTransport:make})).rejects.toThrow('capability');expect(make).not.toHaveBeenCalled();expect(f.store.eventCount()).toBe(0);
});
it('unknown card or malformed input ends capture without accepting another frame',async()=>{
  for(const bad of ['bad\n','SCHOVERA_SCAN,AA:BB:CC:DD,1\n']){const f=fixture(),r=await capture(f,bad+scan(1));expect(r.result.exitCode).toBe(1);expect(f.store.eventCount()).toBe(0);expect(r.t.close).toHaveBeenCalledTimes(1);}
});
it('timeout with no observation is failure, not successful capture',async()=>{
  vi.useFakeTimers();const f=fixture(),t=new Mock();const p=captureOne(f.store,f.c,f.a,f.opts,{createTransport:()=>t,processSignals:new EventEmitter()});t.emit('opened');await vi.advanceTimersByTimeAsync(30000);expect(await p).toMatchObject({exitCode:1,newDurableEvents:0});expect(f.store.eventCount()).toBe(0);
});
it('unexpected disconnect closes and retains zero-event state',async()=>{
  const f=fixture(),t=new Mock();const p=captureOne(f.store,f.c,f.a,f.opts,{createTransport:()=>t,processSignals:new EventEmitter()});t.emit('opened');t.emit('closed','disconnect');expect((await p).exitCode).toBe(1);expect(t.close).toHaveBeenCalledTimes(1);
});
it('selects only the approved row and preserves another interrupted event byte-for-byte',async()=>{
  const f=fixture(),r=f.seed();f.approve(r);
  const other={...f.c,enrollment:{...f.c.enrollment,deviceId:randomUUID(),readerId:randomUUID(),assignmentId:randomUUID()},binding:{...f.c.binding,sessionId:randomUUID()}};
  const claims={...f.claims,device_id:other.enrollment.deviceId,assignment_id:other.enrollment.assignmentId};other.enrollment.capability=signAssignmentCapability(claims,f.pair.privateKey);
  prepareReviewedLocalReader(f.store,other.enrollment,other.binding);const cap=new LegacyGatewayCapture({store:f.store,enrollment:other.enrollment,binding:other.binding});const extra=cap.capture(scan(10).trim());cap.close();f.store.startAttempt(other.enrollment.deviceId,extra.eventId,new Date().toISOString());
  const before={...f.store.getEvent(other.enrollment.deviceId,extra.eventId)};f.reopen();expect({...f.store.getEvent(other.enrollment.deviceId,extra.eventId)}).toEqual(before);
  const rem=remote(f);expect((await deliverOne(f.store,rem.transport,f.c,f.a))[0].state).toBe('delivered_to_local_server');expect(rem.request).toHaveBeenCalledTimes(1);expect({...f.store.getEvent(other.enrollment.deviceId,extra.eventId)}).toEqual(before);
});
it('lost local receipt and identical retry use two requests, one queue row and the same remote receipt',async()=>{
  const f=fixture(),r=f.seed(),row=f.approve(r),rem=remote(f);await deliverOne(f.store,rem.transport,f.c,f.a,{loseFirstReceipt:true});expect(f.store.getEvent(f.a.deviceId,r.eventId).queue_state).toBe('pending');f.reopen();await deliverOne(f.store,rem.transport,f.c,f.a);
  const after=f.store.getEvent(f.a.deviceId,r.eventId);expect(after).toMatchObject({queue_state:'delivered',attempt_count:2,canonical_payload:row.canonical_payload});expect(f.store.eventCount()).toBe(1);expect(rem.request).toHaveBeenCalledTimes(2);expect(rem.request.mock.calls[0][1]).toBe(rem.request.mock.calls[1][1]);expect(rem.request.mock.calls[0][2]['x-schovera-nonce']).not.toBe(rem.request.mock.calls[1][2]['x-schovera-nonce']);
  expect(await deliverOne(f.store,rem.transport,f.c,f.a)).toEqual([]);expect(rem.request).toHaveBeenCalledTimes(2);
});
it.each(['eventId','payloadSha256'])('wrong approved %s sends nothing',async key=>{
  const f=fixture();f.approve(f.seed());f.a[key]=key==='eventId'?randomUUID():'d'.repeat(64);const rem=remote(f);await expect(deliverOne(f.store,rem.transport,f.c,f.a)).rejects.toThrow();expect(rem.request).not.toHaveBeenCalled();
});
it('revoked local reader refuses HTTP without changing attempts',async()=>{
  const f=fixture();f.approve(f.seed());f.store.revokeReader(f.a.readerId);const rem=remote(f);await expect(deliverOne(f.store,rem.transport,f.c,f.a)).rejects.toThrow('reader_unauthorized');expect(rem.request).not.toHaveBeenCalled();expect(f.store.getEvent(f.a.deviceId,f.a.eventId).attempt_count).toBe(0);
});
it('destination authorization refusal retains attention state and stops',async()=>{
  const f=fixture();f.approve(f.seed());const rem=remote(f,'denied');await deliverOne(f.store,rem.transport,f.c,f.a);expect(f.store.getEvent(f.a.deviceId,f.a.eventId).queue_state).toBe('attention');await expect(deliverOne(f.store,rem.transport,f.c,f.a)).rejects.toThrow();expect(rem.request).toHaveBeenCalledTimes(1);
});
it('outage retains immutable work and exhausts budget after two explicit attempts',async()=>{
  const f=fixture();const before=f.approve(f.seed()),rem=remote(f,'offline');await deliverOne(f.store,rem.transport,f.c,f.a);expect(rem.request).toHaveBeenCalledTimes(1);expect(f.store.getEvent(f.a.deviceId,f.a.eventId).queue_state).toBe('pending');await deliverOne(f.store,rem.transport,f.c,f.a);await expect(deliverOne(f.store,rem.transport,f.c,f.a)).rejects.toThrow();expect(rem.request).toHaveBeenCalledTimes(2);expect(f.store.getEvent(f.a.deviceId,f.a.eventId).canonical_payload).toBe(before.canonical_payload);
});
it('busy worker blocks delivery without sending or changing the event',async()=>{
  const f=fixture(),before=f.approve(f.seed()),token=f.store.acquireWorker(),rem=remote(f);try{await expect(deliverOne(f.store,rem.transport,f.c,f.a)).rejects.toThrow('worker_busy');expect({...f.store.getEvent(f.a.deviceId,f.a.eventId)}).toEqual({...before});expect(rem.request).not.toHaveBeenCalled();}finally{f.store.releaseWorker(token);}
});
it('refuses missing explicit CLI scope and never assumes a capture or delivery mode',()=>{
  for(const args of [[],['capture'],['deliver'],['simulate']])expect(()=>parseArgs(args)).toThrow();const f=fixture();expect(()=>checkApproval({...f.a,hardwareType:'local_simulator'},f.c)).toThrow();
});
