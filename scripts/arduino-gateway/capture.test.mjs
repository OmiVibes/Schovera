import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';
import {captureAcquisition} from '../rfid-gateway/reader-adapter.mjs';
import {signAssignmentCapability} from '../rfid-simulator/event-v2.ts';
import {TrustedUsbCapture,enrollmentDigest,syntheticLine,verifyUsbBinding} from './capture.mjs';
import {verifyDestinationEvidence} from './delivery.mjs';

const clean=[];afterEach(()=>{for(const fn of clean.splice(0).reverse())fn();});
export function unitFixture({maxEvents=10000,authorize=async()=>true,now=()=>Date.now()}={}){
  const dir=mkdtempSync(path.join(os.tmpdir(),'schovera-m7c-capture-'));
  const keys=generateKeyPairSync('ed25519'),device=generateKeyPairSync('ed25519'),schoolId=randomUUID();
  const enrollment={mode:'synthetic_local_only',runId:randomUUID(),target:'http://127.0.0.1:3106',deviceId:randomUUID(),assignmentId:randomUUID(),
    credentialRef:'synthetic-unit-only',readerId:randomUUID(),readerKey:'a'.repeat(64),devicePrivateKey:device.privateKey.export({type:'pkcs8',format:'pem'}).toString()};
  const claims={token_version:1,key_id:'synthetic-unit-key',assignment_id:enrollment.assignmentId,assignment_version:1,credential_ref:enrollment.credentialRef,
    device_id:enrollment.deviceId,school_id:schoolId,not_before:Math.floor(now()/1000)-10,expires_at:Math.floor(now()/1000)+3600};
  enrollment.capability=signAssignmentCapability(claims,keys.privateKey);
  const scope={version:1,mode:'m7c_synthetic_usb',runId:enrollment.runId,ownerId:randomUUID(),schoolId,studentId:randomUUID(),principalId:randomUUID(),sessionId:randomUUID(),
    createdAt:now(),expiresAt:now()+15*60_000,enrollmentSha256:enrollmentDigest(enrollment),keyId:claims.key_id,capabilityPublicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()};
  const f={dir,file:path.join(dir,'gateway.sqlite'),keys,claims,enrollment,scope};
  f.store=openGatewayDatabase(f.file,{maxEvents});f.store.registerReader({readerId:enrollment.readerId,deviceId:enrollment.deviceId,tokenHash:hashReaderKey(enrollment.readerKey),now:new Date(now()).toISOString()});
  f.capture=new TrustedUsbCapture({store:f.store,scope,enrollment,authorize,now});
  clean.push(()=>{try{f.capture.close();}finally{try{f.store.close();}finally{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('schovera-m7c-capture-'))throw Error('Unsafe fixture cleanup');rmSync(dir,{recursive:true});}}});return f;
}

it('requires reviewed fictional binding, exact school/capability evidence and host authorization',()=>{
  const f=unitFixture();for(const patch of [{mode:'physical'},{schoolId:randomUUID()},{runId:randomUUID()},{enrollmentSha256:'0'.repeat(64)},{capabilityPublicKey:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString()}])expect(()=>verifyUsbBinding({...f.scope,...patch},f.enrollment)).toThrow();
  expect(()=>new TrustedUsbCapture({store:f.store,scope:f.scope,enrollment:f.enrollment})).toThrow('authorization_required');
});
it('creates an operator intent without a queue event; unissued device strings never enroll a child',async()=>{
  const f=unitFixture(),intent=await f.capture.issueIntent();expect(f.store.eventCount()).toBe(0);
  const unissued={...intent.acquisition,acquisitionId:randomUUID()};await expect(f.capture.receive(syntheticLine(f.scope.sessionId,unissued))).rejects.toThrow('operator_intent_required');expect(f.store.eventCount()).toBe(0);
});
it('commits via existing HMAC ingress before returning an exact local durable receipt',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent(),r=await f.capture.receive(i.text),row=f.store.getEvent(f.enrollment.deviceId,i.acquisition.acquisitionId);
  expect(r.receipt.outcome).toBe('recorded_locally');expect(r.durable).toBe(true);expect(r.destinationDelivered).toBe(false);
  expect(r.receipt.local_receipt_id).toBe(row.local_receipt_id);expect(r.receipt.received_at).toBe(row.local_received_at);expect(row.queue_state).toBe('pending');expect(f.store.eventCount()).toBe(1);
  expect(JSON.parse(row.canonical_payload).observed_at).toBe(i.acquisition.observedAt);
});
it('rejects changed identity/time/sequence, raw UID, student fields and physical-kind payloads',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent();
  for(const patch of [{observed_at:new Date(Date.now()-5000).toISOString()},{sequence:2},{raw_uid:'PRIVATE_TEST_UID'},{student_id:'PRIVATE_TEST_STUDENT'},{kind:'physical'},{version:2}]){
    try{await f.capture.receive(JSON.stringify({...JSON.parse(i.text),...patch}));throw Error('Unexpected acceptance');}catch(error){expect(error.message).not.toBe('Unexpected acceptance');}
  }expect(f.store.eventCount()).toBe(0);
});
it('coalesces simultaneous identical capture and never overwrites conflicting requests',async()=>{
  let allow;const f=unitFixture();const i=await f.capture.issueIntent();f.capture.authorize=()=>new Promise(resolve=>{allow=resolve;});
  const first=f.capture.receive(i.text),second=f.capture.receive(i.text);
  expect(()=>f.capture.receive(JSON.stringify({...JSON.parse(i.text),sequence:2}))).toThrow('conflicting');allow(true);
  const [a,b]=await Promise.all([first,second]);expect(a.receipt.local_receipt_id).toBe(b.receipt.local_receipt_id);expect(f.store.eventCount()).toBe(1);
});
it('returns the same committed receipt after duplicate replay and process-style reopen',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent(),first=await f.capture.receive(i.text),bytes=f.store.getEvent(f.enrollment.deviceId,i.acquisition.acquisitionId).canonical_payload;
  f.capture.close();f.store.close();f.store=openGatewayDatabase(f.file);f.capture=new TrustedUsbCapture({store:f.store,scope:f.scope,enrollment:f.enrollment,authorize:async()=>false});
  const duplicate=await f.capture.receive(i.text);expect(duplicate.receipt.duplicate).toBe(true);expect(duplicate.receipt.local_receipt_id).toBe(first.receipt.local_receipt_id);
  expect(f.store.getEvent(f.enrollment.deviceId,i.acquisition.acquisitionId).canonical_payload===bytes).toBe(true);
  await expect(f.capture.issueIntent()).rejects.toThrow('authorization_refused');
});
it('refuses new work when authorization is denied/unavailable, session expired, or capability invalid',async()=>{
  for(const authorize of [async()=>false,async()=>{throw Error('PRIVATE_AUTH_ERROR');}]){const f=unitFixture({authorize});await expect(f.capture.issueIntent()).rejects.toThrow('fresh_host_authorization');expect(f.store.eventCount()).toBe(0);}
  let now=Date.now();const f=unitFixture({now:()=>now});now+=15*60_000;await expect(f.capture.issueIntent()).rejects.toThrow('expired');
  const other=unitFixture();const expired=signAssignmentCapability({...other.claims,not_before:Math.floor(Date.now()/1000)-100,expires_at:Math.floor(Date.now()/1000)-1},other.keys.privateKey);
  const enrollment={...other.enrollment,capability:expired};expect(()=>verifyUsbBinding({...other.scope,enrollmentSha256:enrollmentDigest(enrollment)},enrollment)).toThrow('capability_refused');
});
it('rejects sequence reuse from a competing low-level capture without changing the saved event',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent();const competing={...i.acquisition,acquisitionId:randomUUID()};
  captureAcquisition(f.store,competing,f.enrollment);await expect(f.capture.receive(i.text)).rejects.toThrow('sequence');expect(f.store.eventCount()).toBe(1);expect(f.store.getEvent(f.enrollment.deviceId,i.acquisition.acquisitionId)).toBe(null);
});
it('rechecks live permission between ARM and capture, with no premature firmware-clear permission',async()=>{
  let active=true;const f=unitFixture({authorize:async()=>active}),i=await f.capture.issueIntent();active=false;
  await expect(f.capture.receive(i.text)).rejects.toThrow('authorization_refused');expect(()=>f.capture.releaseIntent(i.acquisition.acquisitionId)).toThrow('no_committed');expect(f.store.eventCount()).toBe(0);
});
it('rejects reader revocation and changed enrollment identity without deleting committed evidence',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent();await f.capture.receive(i.text);f.store.revokeReader(f.enrollment.readerId);
  await expect(f.capture.receive(i.text)).rejects.toThrow('reader_unauthorized');expect(f.store.eventCount()).toBe(1);expect(f.capture.receipt(i.acquisition.acquisitionId).durable).toBe(true);
  expect(()=>verifyUsbBinding(f.scope,{...f.enrollment,deviceId:randomUUID()})).toThrow('binding_refused');
});
it('applies queue backpressure before a new ARM and preserves the retained event',async()=>{
  const f=unitFixture({maxEvents:1}),i=await f.capture.issueIntent();await f.capture.receive(i.text);f.capture.releaseIntent(i.acquisition.acquisitionId);
  await expect(f.capture.issueIntent()).rejects.toThrow('queue_capacity');expect(f.store.eventCount()).toBe(1);
});
it('excludes competing gateway owners and permits explicit recovery after the original owner releases',()=>{
  const f=unitFixture();expect(()=>new TrustedUsbCapture({store:f.store,scope:f.scope,enrollment:f.enrollment,authorize:async()=>true})).toThrow('gateway_worker_busy');
  f.capture.close();f.capture=new TrustedUsbCapture({store:f.store,scope:f.scope,enrollment:f.enrollment,authorize:async()=>true});expect(f.store.workerStatus().state).toBe('worker_registered');
});
it('rolls back failed transactions and reconciles an acknowledgement lost after commit without another row',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent();await expect(f.capture.receive(i.text,{beforeCommit:()=>{throw Error('injected_local_IO_failure');}})).rejects.toThrow();expect(f.store.eventCount()).toBe(0);
  await expect(f.capture.receive(i.text,{afterCommitBeforeAck:()=>{throw Error('lost');}})).rejects.toThrow('committed');expect(f.store.eventCount()).toBe(1);
  const r=await f.capture.receive(i.text);expect(r.receipt.duplicate).toBe(true);expect(r.durable).toBe(true);expect(f.store.eventCount()).toBe(1);
});
it('preserves delayed observed time and marks uncertainty instead of rewriting the acquisition',async()=>{
  let now=Date.now()-11*60_000;const f=unitFixture({now:()=>now}),i=await f.capture.issueIntent();now+=11*60_000;await f.capture.receive(i.text);
  const row=f.store.getEvent(f.enrollment.deviceId,i.acquisition.acquisitionId);expect(row.observed_at).toBe(i.acquisition.observedAt);expect(row.clock_quality).toBe('uncertain');
});
it('detects stored canonical/hash/receipt corruption before claiming durability or releasing firmware',async()=>{
  const f=unitFixture(),i=await f.capture.issueIntent();await f.capture.receive(i.text);f.store.db.prepare('UPDATE gateway_events SET payload_hash=?').run('0'.repeat(64));
  expect(()=>f.capture.receipt(i.acquisition.acquisitionId)).toThrow('receipt_mismatch');await expect(f.capture.receive(i.text)).rejects.toThrow('event_conflict');
});

for(const phase of ['before','after'])it(`survives actual child-process termination ${phase} SQLite commit`,async()=>{
  const f=unitFixture();f.capture.close();f.store.close();
  const data=path.join(f.dir,'private-unit.json'),result=path.join(f.dir,'acquisition.json'),script=path.join(f.dir,'crash.mjs');
  writeFileSync(data,JSON.stringify({scope:f.scope,enrollment:f.enrollment,database:f.file,result}),{mode:0o600});
  const captureUrl=new URL('./capture.mjs',import.meta.url).href,storeUrl=new URL('../rfid-gateway/storage.mjs',import.meta.url).href;
  writeFileSync(script,`import fs from 'node:fs';import {TrustedUsbCapture} from ${JSON.stringify(captureUrl)};import {openGatewayDatabase} from ${JSON.stringify(storeUrl)};const f=JSON.parse(fs.readFileSync(process.argv[2]));const store=openGatewayDatabase(f.database);const c=new TrustedUsbCapture({store,scope:f.scope,enrollment:f.enrollment,authorize:async()=>true});const i=await c.issueIntent();fs.writeFileSync(f.result,JSON.stringify(i),{mode:0o600});await c.receive(i.text,{${phase==='before'?'beforeCommit':'afterCommitBeforeAck'}:()=>process.exit(${phase==='before'?71:72})});`);
  const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawnSync(process.execPath,[script,data],{env,windowsHide:true,encoding:'utf8',timeout:15000});expect(child.status).toBe(phase==='before'?71:72);
  f.store=openGatewayDatabase(f.file);f.capture=new TrustedUsbCapture({store:f.store,scope:f.scope,enrollment:f.enrollment,authorize:async()=>true});expect(f.store.eventCount()).toBe(phase==='before'?0:1);
  if(phase==='after'){const i=JSON.parse(readFileSync(result));const r=await f.capture.receive(i.text);expect(r.receipt.duplicate).toBe(true);expect(r.durable).toBe(true);expect(f.store.eventCount()).toBe(1);}
});

function destinationFixture(){const f=unitFixture(),eventId=randomUUID(),received=new Date().toISOString(),receiptId=randomUUID(),businessId=randomUUID();
  const row={event_id:eventId,remote_receipt_id:receiptId,payload_hash:'a'.repeat(64),remote_outcome:'accepted',remote_sequence_state:'in_order',remote_received_at:received,queue_state:'delivered',event_type:'check_in',device_sequence:1,observed_at:received};
  const receipt={id:receiptId,device_id:f.enrollment.deviceId,device_event_id:eventId,payload_hash:row.payload_hash,credential_assignment_id:f.enrollment.assignmentId,capability_key_id:f.scope.keyId,outcome:'accepted',sequence_state:'in_order',received_at:received,event_id:businessId};
  const gate={id:businessId,school_id:f.scope.schoolId,student_id:f.scope.studentId,device_id:f.enrollment.deviceId,device_event_id:eventId,event_type:'check_in',device_sequence:1,observed_at:received};return {...f,row,receipt,gate};}
it('requires a matched destination receipt AND the correct persisted school/student gate row',()=>{
  const f=destinationFixture();expect(verifyDestinationEvidence(f,f.row,f.receipt,f.gate).destinationDelivered).toBe(true);
  for(const receipt of [null,{...f.receipt,id:randomUUID()},{...f.receipt,payload_hash:'0'.repeat(64)},{...f.receipt,device_event_id:randomUUID()}])expect(()=>verifyDestinationEvidence(f,f.row,receipt,f.gate)).toThrow();
  for(const gate of [null,{...f.gate,school_id:randomUUID()},{...f.gate,student_id:randomUUID()},{...f.gate,observed_at:new Date(Date.now()-50000).toISOString()}])expect(()=>verifyDestinationEvidence(f,f.row,f.receipt,gate)).toThrow();
});
it('retains matched unresolved receipts as attention, never as delivered or student attendance',()=>{
  const f=destinationFixture(),row={...f.row,remote_outcome:'unresolved',queue_state:'attention'},receipt={...f.receipt,outcome:'unresolved',event_id:null};
  const r=verifyDestinationEvidence(f,row,receipt,null);expect(r.destinationDelivered).toBe(false);expect(r.queue_state).toBe('attention');expect(()=>verifyDestinationEvidence(f,row,receipt,f.gate)).toThrow();
});
