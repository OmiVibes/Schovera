import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {issueLease,verifyLease,prepareOperation,openOperations,replayOperations,LEASE_MS} from './store.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
const key=generateKeyPairSync('ed25519').privateKey;
const snapshot={actor_id:randomUUID(),school_id:randomUUID(),class_id:randomUUID(),attendance_date:'2026-11-09',roster:[randomUUID()],baseline:'0'.repeat(32)};
const paths:string[]=[];
const file=()=>{const dir=mkdtempSync(path.join(tmpdir(),'schovera-operations-'));paths.push(dir);return path.join(dir,'queue.sqlite');};
const operation=(kind='attendance')=>prepareOperation(snapshot,{operation_id:randomUUID(),kind,authored_at:'2026-11-09T08:00:00Z',payload:kind==='attendance'?{records:[{student_id:snapshot.roster[0],status:'present'}]}:{student_id:snapshot.roster[0],category:'general',title:'Synthetic notice',message:'Synthetic original only'}});
afterEach(()=>{for(const dir of paths.splice(0)){expect(path.dirname(dir)).toBe(tmpdir());expect(path.basename(dir)).toMatch(/^schovera-operations-/);rmSync(dir,{recursive:true,force:true});}});
it('verifies a purpose-bound lease; rejects signature tampering, expiry and another issuer',()=>{
  const token=issueLease(key,snapshot,1000);expect(verifyLease(key,token,1001).actor_id).toBe(snapshot.actor_id);
  expect(()=>verifyLease(key,token,1000+LEASE_MS)).toThrow('lease_expired');
  const parts=token.split('.');parts[0]=Buffer.from(JSON.stringify({...snapshot,actor_id:randomUUID()})).toString('base64url');
  expect(()=>verifyLease(key,parts.join('.'),1001)).toThrow('invalid_lease');
  expect(()=>verifyLease(generateKeyPairSync('ed25519').privateKey,token,1001)).toThrow('invalid_lease');
});
it('rejects incomplete/foreign/duplicate rosters and invalid message data',()=>{
  for(const records of [[],[{student_id:randomUUID(),status:'present'}],[{student_id:snapshot.roster[0],status:'safe'}],[{student_id:snapshot.roster[0],status:'present'},{student_id:snapshot.roster[0],status:'present'}]])expect(()=>prepareOperation(snapshot,{operation_id:randomUUID(),kind:'attendance',authored_at:new Date().toISOString(),payload:{records}})).toThrow('invalid_attendance');
  expect(()=>prepareOperation(snapshot,{operation_id:randomUUID(),kind:'update',authored_at:new Date().toISOString(),payload:{student_id:randomUUID(),title:'hello',message:'hello',category:'general'}})).toThrow('invalid_update');
});
it('binds capture to the signed actor/school and preserves update identity across lease renewal',()=>{
  const input={operation_id:randomUUID(),kind:'update',actor_id:randomUUID(),school_id:randomUUID(),authored_at:'2026-11-09T08:00:00Z',payload:{student_id:snapshot.roster[0],category:'general',title:'Synthetic original',message:'Synthetic unmodified original'}};
  const a=prepareOperation(snapshot,input),b=prepareOperation({...snapshot,baseline:'1'.repeat(32),attendance_date:'2026-11-08'},input);
  expect(a.actor_id).toBe(snapshot.actor_id);expect(a.school_id).toBe(snapshot.school_id);expect(b).toEqual(a);
});
it('commits before acknowledgement, deduplicates exactly and rejects changed replay',()=>{
  const s=openOperations(file());try{const o=operation();expect(()=>s.insert(o,()=>{throw Error('fault');})).toThrow();expect(s.rows(snapshot.actor_id,snapshot.school_id)).toHaveLength(0);
    s.insert(o);s.insert(o);expect(s.rows(snapshot.actor_id,snapshot.school_id)).toHaveLength(1);expect(()=>s.insert({...o,authored_at:'2026-11-08T08:00:00Z'})).toThrow('operation_conflict');
  }finally{s.close();}
});
it('persists pending rows and pause state across close/reopen without modifying RFID schema',()=>{
  const f=file();const g=openGatewayDatabase(f);g.registerReader({readerId:'synthetic-reader',deviceId:'synthetic-device',tokenHash:'a'.repeat(64),now:new Date().toISOString()});g.close();
  let s=openOperations(f);s.insert(operation());s.setMode('offline');s.close();s=openOperations(f);try{expect(s.mode()).toBe('offline');expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('pending');}finally{s.close();}
  const reopened=openGatewayDatabase(f);try{expect(reopened.getReader('synthetic-reader')).toBeTruthy();}finally{reopened.close();}
});
it('fails capacity closed and retains multiple pending updates',()=>{
  const s=openOperations(file(),{maxOperations:2});try{s.insert(operation('update'));s.insert(operation('update'));expect(()=>s.insert(operation('update'))).toThrow('queue_full');expect(s.rows(snapshot.actor_id,snapshot.school_id)).toHaveLength(2);}finally{s.close();}
});
it('retains a conflict for review and never retries it automatically',async()=>{
  const s=openOperations(file());try{s.insert(operation());let calls=0;const send=async()=>{calls++;throw Error('attendance_conflict');};await replayOperations(s,snapshot.actor_id,snapshot.school_id,send);await replayOperations(s,snapshot.actor_id,snapshot.school_id,send,{force:true});expect(calls).toBe(1);expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('review');}finally{s.close();}
});
it('retries a lost destination response with the identical operation; local receipt failure is recoverable',async()=>{
  const s=openOperations(file());try{const op=operation();s.insert(op);const receipts=new Map();let effects=0;
    const send=async(o:typeof op)=>{if(!receipts.has(o.operation_id)){effects++;receipts.set(o.operation_id,{operation_id:o.operation_id,confirmed:true,received_at:new Date().toISOString()});}return receipts.get(o.operation_id);};
    s.setMode('lose-response');await replayOperations(s,snapshot.actor_id,snapshot.school_id,send);expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('pending');
    await replayOperations(s,snapshot.actor_id,snapshot.school_id,send,{force:true,beforeReceiptCommit:()=>{throw Error('disk fault');}});expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('pending');
    await replayOperations(s,snapshot.actor_id,snapshot.school_id,send,{force:true});expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('synced');expect(effects).toBe(1);
  }finally{s.close();}
});
it('does not send while offline and does not read another actor or school queue',async()=>{
  const s=openOperations(file());try{s.insert(operation());s.setMode('authority-offline');await replayOperations(s,snapshot.actor_id,snapshot.school_id,async()=>{throw Error('must not call');});expect(s.rows(randomUUID(),snapshot.school_id)).toEqual([]);expect(s.rows(snapshot.actor_id,randomUUID())).toEqual([]);expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('pending');}finally{s.close();}
});
it('caps automatic failures without deleting work; explicit retry can resume transient failures',async()=>{
  const s=openOperations(file());try{const o=operation('update');s.insert(o);for(let n=0;n<8;n++)await replayOperations(s,snapshot.actor_id,snapshot.school_id,async()=>{throw Error('connection_lost');},{force:true});
    expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('review');
    await replayOperations(s,snapshot.actor_id,snapshot.school_id,async()=>{throw Error('must not retry');});
    await replayOperations(s,snapshot.actor_id,snapshot.school_id,async()=>({operation_id:o.operation_id,confirmed:true,received_at:new Date().toISOString()}),{force:true});
    expect(s.rows(snapshot.actor_id,snapshot.school_id)[0].state).toBe('synced');
  }finally{s.close();}
});
