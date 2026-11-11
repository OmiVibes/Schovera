import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { openGatewayDatabase } from '../rfid-gateway/storage.mjs';

export const LEASE_MS = 30 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function operationError(code) { return new Error(code); }
export function openOperations(file, {maxOperations=10000}={}) {
  if(!Number.isInteger(maxOperations)||maxOperations<1||maxOperations>10000)throw operationError('invalid_capacity');
  const gateway = openGatewayDatabase(file);
  const db = gateway.db;
  try { gateway.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS school_operation_schema(version INTEGER PRIMARY KEY CHECK(version=1)) STRICT;
      INSERT OR IGNORE INTO school_operation_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS school_operations(
        operation_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, school_id TEXT NOT NULL, class_id TEXT NOT NULL,
        attendance_date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('attendance','update')),
        canonical TEXT NOT NULL, payload_hash TEXT NOT NULL, local_received_at TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','synced','review')), attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER NOT NULL DEFAULT 0, error TEXT, receipt TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS school_operation_control(id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL);
      INSERT OR IGNORE INTO school_operation_control VALUES(1,'online');`);
  });
  const versions=db.prepare('SELECT version FROM school_operation_schema').all();
  if(versions.length!==1||versions[0].version!==1)throw operationError('unsupported_operation_schema');
  } catch(error) {gateway.close();throw error;}
  return {
    close: () => gateway.close(),
    mode: () => db.prepare('SELECT mode FROM school_operation_control WHERE id=1').get().mode,
    setMode: mode => {
      if (!['online','offline','authority-offline','lose-response'].includes(mode)) throw operationError('invalid_mode');
      db.prepare('UPDATE school_operation_control SET mode=? WHERE id=1').run(mode);
    },
    insert: (operation, beforeCommit = () => {}) => gateway.transaction(() => {
      const canonical = JSON.stringify(operation), hash = createHash('sha256').update(canonical).digest('hex');
      const prior = db.prepare('SELECT * FROM school_operations WHERE operation_id=?').get(operation.operation_id);
      if (prior) {
        if (prior.payload_hash !== hash) throw operationError('operation_conflict');
        return prior;
      }
      if (Number(db.prepare('SELECT count(*) AS n FROM school_operations').get().n) >= maxOperations) throw operationError('queue_full');
      if (operation.kind === 'attendance' && db.prepare("SELECT 1 FROM school_operations WHERE actor_id=? AND class_id=? AND attendance_date=? AND kind='attendance' AND state='pending'").get(operation.actor_id,operation.class_id,operation.attendance_date)) throw operationError('attendance_already_pending');
      db.prepare("INSERT INTO school_operations(operation_id,actor_id,school_id,class_id,attendance_date,kind,canonical,payload_hash,local_received_at,state) VALUES(?,?,?,?,?,?,?,?,?,'pending')")
        .run(operation.operation_id,operation.actor_id,operation.school_id,operation.class_id,operation.attendance_date,operation.kind,canonical,hash,new Date().toISOString());
      beforeCommit();
      return db.prepare('SELECT * FROM school_operations WHERE operation_id=?').get(operation.operation_id);
    }),
    rows: (actor, school) => db.prepare('SELECT * FROM school_operations WHERE actor_id=? AND school_id=? ORDER BY local_received_at,operation_id').all(actor,school),
    receipt: (id, receipt, beforeCommit = () => {}) => gateway.transaction(() => {
      beforeCommit();
      db.prepare("UPDATE school_operations SET state='synced',receipt=?,error=NULL WHERE operation_id=?").run(JSON.stringify(receipt),id);
    }),
    retryTransient: (actor,school) => db.prepare("UPDATE school_operations SET state='pending',attempts=0,next_retry_at=0 WHERE actor_id=? AND school_id=? AND state='review' AND error='retry_needed'").run(actor,school),
    failure: (id, review, error) => {
      const attempts=Number(db.prepare('SELECT attempts FROM school_operations WHERE operation_id=?').get(id)?.attempts||0)+1;
      db.prepare("UPDATE school_operations SET state=?,attempts=?,next_retry_at=?,error=? WHERE operation_id=? AND state<>'synced'")
        .run(review||attempts>=8?'review':'pending',attempts,Date.now()+Math.min(60000,1000*2**attempts),error,id);
    },
  };
}

export function localSigningKey(directory) {
  mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'school-operation-issuer.pem');
  try { return createPrivateKey(readFileSync(file)); } catch(error) { if(error.code!=='ENOENT') throw operationError('invalid_local_issuer'); }
  const key=generateKeyPairSync('ed25519').privateKey;
  try { writeFileSync(file,key.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600}); }
  catch(error) { if(error.code!=='EEXIST') throw error; }
  return createPrivateKey(readFileSync(file));
}
export function issueLease(key, snapshot, now=Date.now()) {
  const claims={version:1,id:randomUUID(),...snapshot,issued_at:now,expires_at:now+LEASE_MS};
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(null,Buffer.from(body),key).toString('base64url')}`;
}
export function verifyLease(key, token, now=Date.now()) {
  if(typeof token!=='string'||token.length>60000) throw operationError('invalid_lease');
  const parts=token.split('.');
  if(parts.length!==2||!verify(null,Buffer.from(parts[0]),createPublicKey(key),Buffer.from(parts[1],'base64url'))) throw operationError('invalid_lease');
  let claims;try{claims=JSON.parse(Buffer.from(parts[0],'base64url').toString());}catch{throw operationError('invalid_lease');}
  if(claims.version!==1||!Number.isFinite(claims.issued_at)||!Number.isFinite(claims.expires_at)||claims.issued_at>now||claims.expires_at<=now||claims.expires_at-claims.issued_at>LEASE_MS) throw operationError('lease_expired');
  if(![claims.actor_id,claims.school_id,claims.class_id].every(v=>uuid.test(v))||!Array.isArray(claims.roster)||claims.roster.length>500||!claims.roster.every(v=>uuid.test(v))||!/^\d{4}-\d{2}-\d{2}$/.test(claims.attendance_date)||!/^[a-f0-9]{32}$/.test(claims.baseline)) throw operationError('invalid_lease');
  return claims;
}
export function prepareOperation(claims, input) {
  if(!input||!uuid.test(input.operation_id)||!['attendance','update'].includes(input.kind)||typeof input.authored_at!=='string'||!Number.isFinite(Date.parse(input.authored_at))) throw operationError('invalid_operation');
  let payload;
  if(input.kind==='attendance') {
    const rows=input.payload?.records;
    if(!Array.isArray(rows)||rows.length!==claims.roster.length||!rows.length||rows.some(r=>!claims.roster.includes(r.student_id)||!['present','absent','late'].includes(r.status))||new Set(rows.map(r=>r.student_id)).size!==rows.length) throw operationError('invalid_attendance');
    payload={records:rows.map(r=>({student_id:r.student_id,status:r.status})).sort((a,b)=>a.student_id.localeCompare(b.student_id))};
  } else {
    const p=input.payload;
    if(!p||!claims.roster.includes(p.student_id)||!['general','academic','attendance','achievement','behaviour','homework_task'].includes(p.category)||typeof p.title!=='string'||typeof p.message!=='string') throw operationError('invalid_update');
    const title=p.title.trim(),message=p.message.trim();
    if(title.length<3||title.length>120||message.length<3||message.length>1000) throw operationError('invalid_update');
    payload={student_id:p.student_id,category:p.category,title,message,importance:'important'};
  }
  // The shared storage columns describe attendance only. Updates use a fixed
  // unused marker so renewing a lease cannot change their immutable envelope.
  return {operation_id:input.operation_id.toLowerCase(),kind:input.kind,actor_id:claims.actor_id,school_id:claims.school_id,class_id:claims.class_id,attendance_date:input.kind==='attendance'?claims.attendance_date:'1970-01-01',baseline:input.kind==='attendance'?claims.baseline:'0'.repeat(32),authored_at:input.authored_at,payload};
}

export async function replayOperations(store, actor, school, send, options=/** @type {{force?: boolean, beforeReceiptCommit?: () => void}} */({})) {
  const {force=false,beforeReceiptCommit}=options;
  if(['offline','authority-offline'].includes(store.mode())) return;
  if(force)store.retryTransient(actor,school);
  for(const row of store.rows(actor,school).filter(r=>r.state==='pending'&&(force||Number(r.next_retry_at)<=Date.now())).slice(0,10)) {
    try {
      if(createHash('sha256').update(row.canonical).digest('hex')!==row.payload_hash) {store.failure(row.operation_id,true,'stored_payload_corrupt');continue;}
      const receipt=await send(JSON.parse(row.canonical),row.payload_hash);
      if(!receipt||receipt.operation_id!==row.operation_id||receipt.confirmed!==true||typeof receipt.received_at!=='string'||!Number.isFinite(Date.parse(receipt.received_at))) throw operationError('invalid_receipt');
      if(store.mode()==='lose-response') {store.setMode('online');throw operationError('connection_lost');}
      store.receipt(row.operation_id,receipt,beforeReceiptCommit);
    } catch(error) {
      const reason=['attendance_conflict','not_authorized','operation_conflict','invalid_operation'].find(code=>error.message?.includes(code));
      store.failure(row.operation_id,Boolean(reason),reason||'retry_needed');
    }
  }
}
