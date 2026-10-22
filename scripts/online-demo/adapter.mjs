import { createClient } from '@supabase/supabase-js';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { datasetDigest } from './dataset.mjs';
import { validateTarget, targetFetch } from './target.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function stableId(run, logical) {
  const h = createHash('sha256').update(`${run}/${logical}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
const password = () => `${randomBytes(24).toString('base64url')}!aA1`;
const must = async query => { const r = await query; if (r.error) throw new Error('Bound demo operation failed; consult private journal stage (no remote error body logged)'); return r.data; };
const foreign = new Set(['class_id','student_id','teacher_id','parent_id','marked_by','created_by','authored_by','approved_by','update_id','student_update_id','corrects_update_id','announcement_id']);
const scoped = new Set(['classes','students','attendance_records','class_assignments','timetable_entries','student_updates','announcements','communication_translations','school_entry_events']);

export class DemoAdapter {
  constructor({ approval, credentials, directory, fetcher, fault = () => {}, localTestClock }) {
    if(localTestClock && approval.mode!=='local')throw new Error('Clock injection is local-test-only');
    this.now=localTestClock ?? Date.now;
    this.identity = validateTarget(approval, credentials);
    this.approval = approval; this.credentials = credentials; this.directory = path.resolve(directory); this.fault = fault;
    const options = { auth:{persistSession:false,autoRefreshToken:false}, global:{fetch:targetFetch(this.identity.url,fetcher)} };
    this.db = createClient(credentials.url, credentials.key, options);
    this.actor = () => createClient(credentials.url, credentials.publishableKey, options);
  }
  save() {
    const next = `${this.file}.next`, fd = openSync(next, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(this.journal,null,2)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(next, this.file);
  }
  async run(dataset, { runId, expiresAt, operation='prepare', account, confirm } = {}) {
    validateTarget(this.approval,this.credentials,this.now());
    if (!uuid.test(runId ?? '') || !['prepare','verify','list','report','rotate','disable','reset','remove-expired'].includes(operation)) throw new Error('Exact run / supported operation required');
    const digest = datasetDigest(dataset), identity = this.identity;
    if(digest!==this.approval.datasetSha256)throw new Error('Dataset differs from independently approved manifest');
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry) || expiry > this.now()+14*86400000) throw new Error('Explicit expiry within 14 days required');
    const writes = !['verify','list','report'].includes(operation);
    const expected = `${operation}:${identity.projectRef}:${runId}`;
    // Default dry-run does not contact Auth/PostgREST, nor create journals.
    if (writes && confirm !== expected) return { dryRun:true, operation, digest, students:20, confirmationRequired:expected };
    if (['prepare','rotate'].includes(operation) && expiry <= this.now()) throw new Error('Demo expired');
    if (operation === 'remove-expired' && expiry > this.now()) throw new Error('Demo not expired');
    mkdirSync(this.directory,{recursive:true,mode:0o700});
    this.file = path.join(this.directory,`${runId}.json`);
    let lock; try { lock = openSync(`${this.file}.lock`,'wx',0o600); } catch { throw new Error('Run locked; confirm no operator is active before recovering a stale lock'); }
    try {
      this.journal = existsSync(this.file) ? JSON.parse(readFileSync(this.file,'utf8')) : null;
      if (this.journal && ['runId','digest','expiresAt','approvalDigest'].some(k=>this.journal[k]!==({runId,digest,expiresAt,approvalDigest:identity.approvalDigest})[k])) throw new Error('Journal ownership mismatch');
      if (!this.journal && operation !== 'prepare') throw new Error('Owned journal required');
      if (!this.journal) {
        this.journal = {version:1,runId,digest,expiresAt,approvalDigest:identity.approvalDigest,projectRef:identity.projectRef,stage:'reserved',accounts:{},rows:{},done:[]};
        for (const p of dataset.tables.profiles) this.journal.accounts[p.id] = {id:stableId(runId,p.id),email:`demo-${runId}-${p.id.split(':')[1]}@example.invalid`,password:password(),role:p.role};
        this.materialize(dataset); this.save();
      }
      await this.authorize();
      if (this.journal.stage === 'removed') return this.report();
      await this.ownership();
      if (operation === 'prepare') await this.prepare();
      if (operation === 'rotate' || operation === 'disable') await this.credentialsOperation(operation, account);
      if (operation === 'reset' || operation === 'remove-expired') await this.remove();
      if (['prepare','verify'].includes(operation)) await this.verify();
      return this.report();
    } finally { closeSync(lock); unlinkSync(`${this.file}.lock`); }
  }
  materialize(dataset) {
    const j = this.journal, id = logical => logical == null ? null : stableId(j.runId,logical);
    const school = id(dataset.tables.schools[0].id), principal = id(dataset.tables.profiles.find(p=>p.role==='principal').id);
    j.schoolId = school;
    for (const [table, rows] of Object.entries(dataset.tables)) j.rows[table] = rows.map(row => {
      const r = Object.fromEntries(Object.entries(row).map(([k,v]) => [k,k==='id'||foreign.has(k)?id(v):v]));
      if (scoped.has(table) || table==='profiles') r.school_id=school;
      if (table==='schools') r.code=`ONLINE-DEMO-${j.runId}`;
      if (table==='profiles') { r.email=j.accounts[row.id].email; r.active=true; }
      if (table==='timetable_entries') r.created_by=principal;
      if (table==='school_entry_events') Object.assign(r,{device_id:stableId(j.runId,'device'),device_event_id:stableId(j.runId,`tap:${row.id}`),device_sequence:rows.indexOf(row)+1,credential_version:1,credential_assignment_id:stableId(j.runId,`credential:${row.student_id}`)});
      return r;
    });
    const { publicKey }=generateKeyPairSync('ed25519'); // Private key intentionally discarded; no operational enrollment.
    j.rows.school_devices=[{id:stableId(j.runId,'device'),school_id:school,label:'Synthetic history — no reader',hardware_type:'local_simulator',verification_public_key:publicKey.export({type:'spki',format:'pem'}).toString(),created_by:principal,active:false,revoked_at:new Date().toISOString()}];
    j.rows.student_credentials=dataset.tables.students.map(s=>({id:stableId(j.runId,`credential:${s.id}`),school_id:school,student_id:id(s.id),credential_ref:`synthetic:${j.runId}:${s.id.split(':')[1]}`,credential_version:1,created_by:principal,revoked_at:new Date().toISOString()}));
  }
  async authorize() {
    // Auth admin endpoint + schema read must both accept this pinned key.
    await must(this.db.auth.admin.listUsers({page:1,perPage:1}));
    await must(this.db.from('schools').select('id').limit(1));
    if(await must(this.db.rpc('verify_demo_access_boundary'))!==true)throw new Error('Demo session authorization migration required');
    const anon=this.actor(), denied=await anon.from('school_devices').select('id').limit(1);
    if (!denied.error && denied.data?.length) throw new Error('Authorization preflight failed');
  }
  async ownership() {
    const j=this.journal, school=await must(this.db.from('schools').select('id,code').eq('id',j.schoolId).maybeSingle());
    if(j.schoolId!==stableId(j.runId,'schools:1'))throw new Error('Journal school identity changed');
    if(school && school.code!==`ONLINE-DEMO-${j.runId}`)throw new Error('School ownership ambiguous');
    for(const [logical,a] of Object.entries(j.accounts)) {
      if(a.id!==stableId(j.runId,logical))throw new Error('Journal account identity changed');
      const r=await this.db.auth.admin.getUserById(a.id);
      if(r.error && r.error.status!==404)throw new Error('Auth ownership lookup failed');
      if(r.data?.user && (r.data.user.app_metadata?.schovera_demo_run!==j.runId || r.data.user.email!==a.email))throw new Error('Auth ownership ambiguous');
    }
    const actors=new Set(Object.values(j.accounts).map(a=>a.id));
    for(const [table,rows]of Object.entries(j.rows)) {
      if(table==='schools'||!rows.length)continue;
      const actual=await must(this.db.from(table).select('*').in('id',rows.map(r=>r.id)).limit(2001));
      for(const r of actual) {
        if(r.school_id && r.school_id!==j.schoolId)throw new Error('Cross-school row blocks operation');
        for(const key of ['teacher_id','parent_id','created_by','marked_by','authored_by','approved_by','actor_id'])if(r[key]&&!actors.has(r[key]))throw new Error('Unowned actor blocks operation');
        if(r.class_id&&!j.rows.classes.some(c=>c.id===r.class_id))throw new Error('Cross-class row blocks operation');
        if(r.student_id&&!j.rows.students.some(s=>s.id===r.student_id))throw new Error('Cross-child row blocks operation');
      }
    }
  }
  async prepare() {
    const j=this.journal;
    if(j.stage==='complete')return;
    for(const a of Object.values(j.accounts)) {
      const r=await this.db.auth.admin.getUserById(a.id);
      if(!r.data?.user)await must(this.db.auth.admin.createUser({id:a.id,email:a.email,password:a.password,email_confirm:true,app_metadata:{schovera_demo_run:j.runId,schovera_demo_expires_at:j.expiresAt}}));
      this.fault('auth-response',a.id); // Lost response recovery uses PRE-journaled UUID + server-only ownership tag.
    }
    const order=['schools','profiles','classes','students','teacher_class_assignments','parent_student_links','attendance_records','class_assignments','timetable_entries','student_updates','announcements','acknowledgements','communication_translations','school_devices','student_credentials','school_entry_events'];
    for(const table of order) for(const row of j.rows[table]) {
      const key=`${table}:${row.id}`;
      const old=await must(this.db.from(table).select(Object.keys(row).join(',')).eq('id',row.id).maybeSingle());
      if(old) {
        if(!equivalent(old,row)) throw new Error(`Inconsistent partial fixture: ${table}`);
      } else {
        if(j.done.includes(key))throw new Error(`Completed fixture row disappeared: ${table}`);
        await must(this.db.from(table).insert(row)); this.fault('row-response',key);
      }
      if(!j.done.includes(key)){j.done.push(key);j.stage=table;this.save();}
    }
    j.stage='complete'; this.save();
  }
  async verify() {
    const j=this.journal;
    if(j.stage!=='complete')throw new Error('Provisioning incomplete');
    for(const table of ['students','classes','profiles','attendance_records','class_assignments','timetable_entries','student_updates','announcements','communication_translations','school_entry_events']) {
      const rows=await must(this.db.from(table).select('id').eq('school_id',j.schoolId).limit(2001));
      const ids=new Set(rows.map(r=>r.id));
      if(j.rows[table].some(r=>!ids.has(r.id)))throw new Error(`Owned fixture incomplete: ${table}`);
    }
    for(const table of ['teacher_class_assignments','parent_student_links','acknowledgements']) {
      const rows=await must(this.db.from(table).select('id').in('id',j.rows[table].map(r=>r.id)));
      if(rows.length!==j.rows[table].length)throw new Error(`Owned relationships missing: ${table}`);
    }
    await this.authorize();
  }
  async credentialsOperation(operation, logical) {
    const j=this.journal,a=j.accounts[logical]; if(!a)throw new Error('Exact owned account logical ID required');
    // Persist the replacement BEFORE Auth call so uncertain responses are safely retried.
    if(operation==='rotate' && !a.nextPassword){a.nextPassword=password();this.save();}
    await must(this.db.from('profiles').update({active:false}).eq('id',a.id).eq('school_id',j.schoolId));
    // Obtain a session under the journaled current password to revoke ALL sessions.
    const client=this.actor();let login=await client.auth.signInWithPassword({email:a.email,password:a.password});
    if(!login.data?.session && a.nextPassword)login=await client.auth.signInWithPassword({email:a.email,password:a.nextPassword});
    if(operation==='rotate' && !login.data?.session)throw new Error('Rotation cannot verify session revocation; account remains inactive');
    if(login.data?.session)await must(this.db.auth.admin.signOut(login.data.session.access_token,'global'));
    await must(this.db.auth.admin.updateUserById(a.id,{password:operation==='rotate'?a.nextPassword:password(),ban_duration:operation==='disable'?'876000h':'none'}));
    if(operation==='rotate') {
      a.password=a.nextPassword;delete a.nextPassword;a.disabled=false;this.save();
      await must(this.db.from('profiles').update({active:true}).eq('id',a.id).eq('school_id',j.schoolId));
    } else {a.disabled=true;this.save();}
  }
  async remove() {
    const j=this.journal;
    // Stop if unknown Auth/profile ownership is found; never adopt/remove by prefix.
    const profiles=await must(this.db.from('profiles').select('id').eq('school_id',j.schoolId));
    if(profiles.some(p=>!Object.values(j.accounts).some(a=>a.id===p.id)))throw new Error('Unowned profile blocks cleanup');
    await this.captureOwnedActivity();
    await must(this.db.from('profiles').update({active:false}).eq('school_id',j.schoolId));
    for(const a of Object.values(j.accounts)) {
      const r=await this.db.auth.admin.getUserById(a.id);
      if(r.data?.user)await must(this.db.auth.admin.updateUserById(a.id,{ban_duration:'876000h'}));
    }
    const order=['school_entry_events','student_credentials','school_devices','communication_translations','acknowledgements','student_updates','announcements','attendance_records','class_assignments','timetable_entries','audit_events','parent_student_links','teacher_class_assignments','students','classes','profiles','schools'];
    for(const table of order) {
      const rows=table==='student_updates'?[...j.rows[table]].reverse():j.rows[table];
      for(const row of rows)await must(this.db.from(table).delete().eq('id',row.id));
    }
    for(const a of Object.values(j.accounts)) {const r=await this.db.auth.admin.getUserById(a.id);if(r.data?.user)await must(this.db.auth.admin.deleteUser(a.id));}
    if(await must(this.db.from('schools').select('id').eq('id',j.schoolId).maybeSingle()))throw new Error('Cleanup verification failed');
    j.stage='removed';this.save();
  }
  async captureOwnedActivity() {
    const j=this.journal,actors=new Set(Object.values(j.accounts).map(a=>a.id));
    // Reconcile only descendants of the UUID+code owned school, with all actor
    // and child/class relationships checked. Capture exact deletion IDs durably.
    const tables=['classes','students','attendance_records','class_assignments','timetable_entries','student_updates','announcements','communication_translations','audit_events'];
    for(const table of tables) {
      const rows=await must(this.db.from(table).select('*').eq('school_id',j.schoolId).limit(2001));
      if(rows.length>2000)throw new Error('Bounded cleanup needs operator review');
      for(const r of rows) {
        for(const k of ['teacher_id','created_by','marked_by','authored_by','approved_by','actor_id'])if(r[k]&&!actors.has(r[k]))throw new Error('Unowned actor blocks cleanup');
        if(r.class_id&&!j.rows.classes.some(c=>c.id===r.class_id))throw new Error('Unowned class blocks cleanup');
        if(r.student_id&&!j.rows.students.some(s=>s.id===r.student_id))throw new Error('Unowned student blocks cleanup');
      }
      j.rows[table]=rows;
    }
    const updates=new Set(j.rows.student_updates.map(r=>r.id));
    const acks=updates.size?await must(this.db.from('acknowledgements').select('*').in('update_id',[...updates]).limit(2001)):[];
    if(acks.length>2000||acks.some(a=>!actors.has(a.parent_id)))throw new Error('Unowned acknowledgement blocks cleanup');
    j.rows.acknowledgements=acks;
    // Leaf-first correction cleanup regardless of initial export ordering.
    const sorted=[], pending=[...j.rows.student_updates];
    while(pending.length){const index=pending.findIndex(r=>!r.corrects_update_id||sorted.some(s=>s.id===r.corrects_update_id));if(index<0)throw new Error('Unknown/cyclic correction blocks cleanup');sorted.push(pending.splice(index,1)[0]);}
    j.rows.student_updates=sorted; j.stage='removing'; this.save();
  }
  report() {
    const j=this.journal;
    return {runId:j.runId,projectRef:j.projectRef,stage:j.stage,students:j.rows.students.length,classes:j.rows.classes.length,accounts:Object.values(j.accounts).map(a=>({role:a.role,disabled:!!a.disabled})),expiresAt:j.expiresAt,syntheticTranslationReview:true,phoneDelivery:false};
  }
}
function equivalent(a,b) {
  return Object.entries(b).every(([k,v])=>a[k]===v || (typeof v==='string' && /(_at)$/.test(k) && Date.parse(a[k])===Date.parse(v)));
}
