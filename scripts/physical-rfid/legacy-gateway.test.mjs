import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';
import {syncPendingV2Events} from '../rfid-gateway/local-v2-transport.mjs';
import {RetryableTransportError} from '../rfid-gateway/transport.mjs';
import {signAssignmentCapability} from '../rfid-simulator/event-v2.ts';
import {LegacyGatewayCapture,cardDigest} from './legacy-gateway.mjs';
const clean=[];afterEach(()=>{for(const fn of clean.splice(0).reverse())fn();});
const uid='FA:CE:B0:0C';const scan=n=>`SCHOVERA_SCAN,${uid},${n}`;
function fixture(){
  const dir=mkdtempSync(path.join(os.tmpdir(),'schovera-physical-unit-'));const file=path.join(dir,'gateway.sqlite');
  clean.push(()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('schovera-physical-unit-'))throw Error('unsafe cleanup');rmSync(dir,{recursive:true});});
  let store=openGatewayDatabase(file),capture;let now=Date.now();
  clean.push(()=>{capture?.close();store.close();});
  const pair=generateKeyPairSync('ed25519');
  const enrollment={readerId:randomUUID(),readerKey:'a'.repeat(64),deviceId:randomUUID(),assignmentId:randomUUID(),assignmentVersion:1,credentialRef:'fictional-physical-reference'};
  const schoolId=randomUUID();const claims={token_version:1,key_id:'unit-key',assignment_id:enrollment.assignmentId,assignment_version:1,credential_ref:enrollment.credentialRef,device_id:enrollment.deviceId,school_id:schoolId,not_before:Math.floor(now/1000)-60,expires_at:Math.floor(now/1000)+1800};
  enrollment.capability=signAssignmentCapability(claims,pair.privateKey);
  const binding={version:1,mode:'physical_legacy_host_receipt_time',sessionId:randomUUID(),schoolId,sourceIdentity:'USB-MOCK-ONLY',uidKey:'b'.repeat(64),eventType:'check_in',reviewedEnrollment:true,capabilityPublicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()};
  binding.uidDigest=cardDigest(uid,binding.uidKey);
  store.registerReader({readerId:enrollment.readerId,deviceId:enrollment.deviceId,tokenHash:hashReaderKey(enrollment.readerKey),now:new Date(now).toISOString()});
  const open=()=>{capture=new LegacyGatewayCapture({store,enrollment,binding,now:()=>now});return capture;};open();
  return {enrollment,binding,now:()=>now,get store(){return store;},get capture(){return capture;},advance(ms){now+=ms;},reopen(){capture.close();store.close();store=openGatewayDatabase(file);open();}};
}
it('captures reviewed legacy observations in the existing queue with host receipt time, never raw UID',()=>{
  const f=fixture(),r=f.capture.capture(scan(100));expect(r).toMatchObject({durable:true,duplicate:false,timestampBasis:'host_received_at',physicalTapCountVerified:false});
  const row=f.store.getEvent(f.enrollment.deviceId,r.eventId);expect(row.queue_state).toBe('pending');expect(row.canonical_payload).not.toContain(uid);expect(row.device_sequence).toBe(1);
  expect(row.observed_at).toBe(new Date(f.now()).toISOString()); // Observation and later durable ingress are separate instants.
  expect(Number.isFinite(Date.parse(row.local_received_at))).toBe(true);
  expect(JSON.stringify(r)).not.toContain(uid);
});
it('treats LCD acknowledgements as informational and never creates a gate event',()=>{
  const f=fixture();
  expect(f.capture.capture('SCHOVERA_LCD_SHOWN,1')).toMatchObject({code:'lcd_shown',durable:false});
  expect(f.capture.capture('SCHOVERA_LCD_UNAVAILABLE')).toMatchObject({code:'lcd_unavailable',durable:false});
  expect(f.store.eventCount()).toBe(0);
});
it('replays an exact tuple after process reopen without changing ID, timestamp or sequence',()=>{
  const f=fixture(),a=f.capture.capture(scan(100));const body=f.store.getEvent(f.enrollment.deviceId,a.eventId).canonical_payload;f.advance(5000);f.reopen();const b=f.capture.capture(scan(100));expect(b).toMatchObject({duplicate:true,eventId:a.eventId});expect(f.store.eventCount()).toBe(1);expect(f.store.getEvent(f.enrollment.deviceId,b.eventId).canonical_payload).toBe(body);
});
it('keeps separate host observations distinct and holds regressed uptime without inventing a reset',()=>{
  const f=fixture(),a=f.capture.capture(scan(100));f.advance(2);const b=f.capture.capture(scan(2200));expect(a.eventId).not.toBe(b.eventId);expect(()=>f.capture.capture(scan(50))).toThrow('uptime_regressed');expect(()=>f.capture.capture(scan(4400))).toThrow('session_held');expect(f.store.eventCount()).toBe(2);
});
it('holds a session after a READY marker following persisted work',()=>{
  const f=fixture();expect(f.capture.capture('SCHOVERA_RFID_READY').durable).toBe(false);f.capture.capture(scan(1));expect(()=>f.capture.capture('SCHOVERA_RFID_READY')).toThrow('reset_requires');f.reopen();expect(()=>f.capture.capture(scan(3))).toThrow('session_held');
});
it('refuses unenrolled cards, malformed and synthetic/versioned messages without queue writes',()=>{
  const f=fixture();for(const line of ['SCHOVERA_SCAN,AA:BB:CC:DD,100','bad','SRFID,1,READY','SCHOVERA_SCAN,FA:CE:B0:0C,-1'])expect(()=>f.capture.capture(line)).toThrow();expect(f.store.eventCount()).toBe(0);
});
it('validates the signed school/assignment and never captures new work under expired or revoked permission',()=>{
  const f=fixture();f.advance(1900000);expect(()=>f.capture.capture(scan(1))).toThrow('capability');expect(f.store.eventCount()).toBe(0);
  f.store.revokeReader(f.enrollment.readerId);expect(()=>f.capture.capture(scan(2))).toThrow('reader_unauthorized');
});
it('rolls back both the queue row and cursor if the existing ingress transaction fails',()=>{
  const f=fixture();expect(()=>f.capture.capture(scan(1),{beforeCommit(){throw Error('mock_disk_failure');}})).toThrow('mock_disk_failure');expect(f.store.eventCount()).toBe(0);expect(f.capture.cursor().last_uptime).toBe(null);expect(f.capture.capture(scan(1)).durable).toBe(true);
});
it('reconciles a lost local acknowledgement using the committed event, not a second queue row',()=>{
  const f=fixture();expect(()=>f.capture.capture(scan(1),{afterCommitBeforeAck(){throw Error('mock_lost_ack');}})).toThrow('local acknowledgement was lost');expect(f.capture.capture(scan(1)).duplicate).toBe(true);expect(f.store.eventCount()).toBe(1);
});
it('retains work during destination outage, survives reopen and reuses the existing delivery worker',async()=>{
  const f=fixture();f.capture.capture(scan(1));f.capture.close();
  await syncPendingV2Events(f.store,{async send(){throw new RetryableTransportError('mock_offline');}},{force:true});expect(f.store.summary().pending).toBe(1);
  f.reopen();f.capture.close();await syncPendingV2Events(f.store,{async send(event){return {receipt_id:randomUUID(),event_id:event.event_id,outcome:'accepted',sequence_state:'in_order',received_at:new Date().toISOString()};}},{force:true});expect(f.store.summary().delivered_to_local_server).toBe(1);
});
it('refuses a concurrent capture owner and changed binding on the same persisted session',()=>{
  const f=fixture();expect(()=>new LegacyGatewayCapture({store:f.store,enrollment:f.enrollment,binding:f.binding})).toThrow('worker_busy');f.capture.close();expect(()=>new LegacyGatewayCapture({store:f.store,enrollment:f.enrollment,binding:{...f.binding,sourceIdentity:'OTHER-DEVICE'}})).toThrow('binding_changed');
});
it('rejects a foreign school or altered immutable assignment before creating any event',()=>{
  const f=fixture();f.capture.close();
  expect(()=>new LegacyGatewayCapture({store:f.store,enrollment:f.enrollment,binding:{...f.binding,schoolId:randomUUID()}})).toThrow('capability');
  expect(()=>new LegacyGatewayCapture({store:f.store,enrollment:{...f.enrollment,assignmentId:randomUUID()},binding:f.binding})).toThrow('capability');
  expect(f.store.eventCount()).toBe(0);
});
it('retains existing work when queue capacity is exhausted and refuses another capture',()=>{
  const f=fixture();f.store.maxEvents=1;f.capture.capture(scan(1));expect(()=>f.capture.capture(scan(2))).toThrow('queue is full');expect(f.store.eventCount()).toBe(1);expect(f.capture.cursor().last_uptime).toBe(1);
});
