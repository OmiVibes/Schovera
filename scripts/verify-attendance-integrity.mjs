// M1 acceptance. Creates exact owned synthetic schools; never uses school records.
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';
import { issueLease, verifyLease, prepareOperation, openOperations, replayOperations } from './school-operations/store.mjs';

assertLocalTestEnvironment();
const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error(`${r.error.code}: ${r.error.message}`);return r.data;};
const denied=async(q,code)=>{const r=await q;assert.ok(r.error,'Expected server denial');if(code)assert.ok(r.error.message.includes(code),`Expected ${code}; received ${r.error.message}`);};
const tag=randomUUID(),schools=[],users=[],accounts={};
const day=n=>shiftSchoolDate(schoolToday(),-n);
const directory=mkdtempSync(path.join(tmpdir(),'schovera-m1-'));
const output=path.resolve('.local',`attendance-integrity-${tag}`);mkdirSync(output,{recursive:true});
let klass,students,browser,store;
async function user(name,role,school) {
  const email=`m1-${name}-${tag}@verification.invalid`,password=`M1-${randomUUID()}!aA1`;
  const r=await admin.auth.admin.createUser({email,password,email_confirm:true});if(r.error)throw Error('Synthetic account creation failed');
  const id=r.data.user.id;users.push(id);
  await must(admin.from('profiles').insert({id,school_id:school,email,full_name:`Synthetic ${name}`,role,active:true}));
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  await must(client.auth.signInWithPassword({email,password}));
  return accounts[name]={id,client,email,password};
}
const snapshot=(a,d=day(1))=>must(a.client.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:d}));
const write=(a,records,revision,action='finalize',reason=null,id=randomUUID(),d=day(1))=>a.client.rpc('write_class_attendance',{
  p_class_id:klass,p_attendance_date:d,p_records:records,p_expected_revision:revision,p_action:action,p_reason:reason,p_request_id:id,
});
const records=status=>students.map((s,i)=>({student_id:s.id,status:i===0?status:'present'}));
const persisted=d=>must(admin.from('attendance_records').select('id,student_id,status,updated_at').eq('class_id',klass).eq('attendance_date',d).order('student_id'));
async function capture(page,name) {
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,left:0,behavior:'instant'});});
  await page.screenshot({path:path.join(output,name),fullPage:true,animations:'disabled',style:'.application-shell{position:relative!important;top:auto!important}'});
}
async function login(role,route) {
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol)?r.continue():r.abort();});
  const page=await ctx.newPage();page.setDefaultTimeout(20000);await page.goto(base);
  await page.getByLabel('Email',{exact:true}).fill(accounts[role].email);await page.getByLabel('Password',{exact:true}).fill(accounts[role].password);
  await page.getByRole('button',{name:'Sign in securely',exact:true}).click();await page.locator(`.role-${role==='teacher2'?'teacher':role}`).waitFor();
  await page.goto(`${base}/${role==='teacher2'?'teacher':role}/${route}`);return page;
}
try {
  for(let i=0;i<2;i++)schools.push((await must(admin.from('schools').insert({name:`Synthetic M1 ${i}`,code:`M1-${tag}-${i}`}).select('id').single())).id);
  klass=(await must(admin.from('classes').insert({school_id:schools[0],grade:'8',division:'A',academic_year:`M1-${tag}`}).select('id').single())).id;
  students=await must(admin.from('students').insert(['A','B'].map((letter,i)=>({school_id:schools[0],class_id:klass,roll_number:String(i+1),full_name:`Synthetic M1 Child ${letter}`,active:true}))).select('id,full_name'));
  const t1=await user('teacher','teacher',schools[0]),t2=await user('teacher2','teacher',schools[0]);
  const parent=await user('parent','parent',schools[0]),principal=await user('principal','principal',schools[0]);
  const unassigned=await user('unassigned','teacher',schools[0]),foreign=await user('foreign','teacher',schools[1]);
  await must(admin.from('teacher_class_assignments').insert([t1,t2].map(a=>({teacher_id:a.id,class_id:klass}))));
  await must(admin.from('parent_student_links').insert({parent_id:parent.id,student_id:students[0].id,relationship_label:'Parent',status:'active'}));
  const empty=await snapshot(t1);assert.equal(empty.state,'draft');assert.equal(empty.revision,0);assert.deepEqual(empty.records,[]);assert.equal(empty.confirmed_by,null);
  for(const actor of [parent,principal,unassigned,foreign]) {
    await denied(actor.client.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:day(1)}),'not_authorized');
    await denied(write(actor,records('present'),0),'not_authorized');
  }
  await denied(t1.client.rpc('save_class_attendance_authorized_inner',{p_class_id:klass,p_attendance_date:day(1),p_records:records('present')}));
  const draftId=randomUUID();
  const duplicateDraft=await Promise.all([write(t1,records('present'),0,'draft',null,draftId),write(t1,records('present'),0,'draft',null,draftId)]);
  const draft=await must(Promise.resolve(duplicateDraft[0]));assert.deepEqual(await must(Promise.resolve(duplicateDraft[1])),draft);
  assert.equal(draft.state,'draft');assert.equal(draft.revision,1);assert.equal(draft.confirmed_at,null);
  assert.deepEqual(await must(write(t1,records('present'),0,'draft',null,draftId)),draft);
  assert.deepEqual(await persisted(day(1)),[]);
  assert.deepEqual(await must(parent.client.from('attendance_registers').select('*').eq('class_id',klass)),[]);
  assert.deepEqual(await must(parent.client.from('attendance_records').select('*').eq('student_id',students[0].id)),[]);
  await denied(parent.client.from('attendance_changes').insert({register_id:draft.register_id,school_id:schools[0],student_id:students[0].id,revision:1,new_status:'present',actor_id:parent.id,reason:'Unauthorized'}));
  await denied(t1.client.from('attendance_registers').update({revision:99}).eq('id',draft.register_id));
  assert.equal((await snapshot(t2)).revision,1);
  await denied(write(t1,records('absent'),1,'draft',null,draftId),'operation_conflict');
  const finalizeId=randomUUID(),final=await must(write(t1,records('absent'),1,'finalize',null,finalizeId));
  assert.equal(final.state,'finalized');assert.equal(final.revision,2);assert.equal(final.confirmed_by,t1.id);assert.ok(Date.parse(final.confirmed_at));
  const finalRows=await persisted(day(1));assert.equal(finalRows.length,2);
  assert.deepEqual(await must(write(t1,records('absent'),1,'finalize',null,finalizeId)),final);
  assert.deepEqual(await persisted(day(1)),finalRows);
  await denied(write(t1,records('late'),2),'attendance_reason_required');
  await denied(write(t1,records('late'),2,'finalize','  '),'attendance_reason_required');
  await denied(write(t1,records('late'),2,'draft','Checked by Teacher'),'attendance_already_finalized');
  const concurrent=await Promise.all([write(t1,records('late'),2,'finalize','Teacher checked late arrival'),write(t2,records('present'),2,'finalize','Teacher checked classroom presence')]);
  assert.equal(concurrent.filter(r=>!r.error).length,1);assert.equal(concurrent.filter(r=>r.error?.message.includes('attendance_conflict')).length,1);
  const current=await snapshot(t1);assert.equal(current.revision,3);
  const history=await must(admin.from('attendance_changes').select('*').eq('register_id',final.register_id).order('revision'));
  assert.equal(history.length,3);assert.equal(history.filter(r=>r.previous_status===null).length,2);
  const change=history.find(r=>r.revision===3);assert.equal(change.student_id,students[0].id);assert.equal(change.previous_status,'absent');
  assert.equal(change.new_status,current.records.find(r=>r.student_id===students[0].id).status);assert.ok(change.reason.startsWith('Teacher checked'));assert.ok(Date.parse(change.changed_at));
  assert.equal(change.actor_id,concurrent[0].error?t2.id:t1.id);
  const parentHistory=await must(parent.client.from('attendance_changes').select('*').eq('register_id',final.register_id));
  assert.deepEqual(parentHistory,[],'Staff correction reasons are not a new Parent data permission.');
  assert.equal((await must(t2.client.from('attendance_changes').select('id').eq('register_id',final.register_id))).length,3);
  assert.equal((await must(principal.client.from('attendance_changes').select('id').eq('register_id',final.register_id))).length,3);
  assert.deepEqual(await must(foreign.client.from('attendance_changes').select('*').eq('register_id',final.register_id)),[]);
  await denied(t1.client.rpc('save_class_attendance',{p_class_id:klass,p_attendance_date:day(1),p_records:records('absent')}),'attendance_revision_required');
  for(const invalid of [records('excused'),[],[records('present')[0],records('present')[0]]])await denied(write(t1,invalid,3));
  await denied(write(t1,records('present'),0,'finalize',null,randomUUID(),shiftSchoolDate(schoolToday(),1)),'invalid_attendance_date');
  assert.equal((await snapshot(t1)).revision,3);
  console.log('PASS: draft/final transitions, hidden Parent drafts, exact retry, reason/history, concurrent revisions, role/tenant/direct-write denial.');

  // Historical saved rows remain untouched until an explicit authorized correction.
  await must(admin.from('attendance_records').insert(records('absent').map(r=>({...r,class_id:klass,school_id:schools[0],attendance_date:day(2),marked_by:t1.id}))));
  const legacyBefore=await persisted(day(2)),legacy=await snapshot(t1,day(2));assert.equal(legacy.legacy,true);assert.equal(legacy.revision,0);assert.equal(legacy.state,'finalized');
  await denied(write(t1,records('late'),0,'finalize',null,randomUUID(),day(2)),'attendance_reason_required');assert.deepEqual(await persisted(day(2)),legacyBefore);
  const adopted=await must(write(t1,records('late'),0,'finalize','Historical register reviewed',randomUUID(),day(2)));assert.equal(adopted.revision,1);
  console.log('PASS: historical rows preserved, legacy saved state explicit, correction requires reason.');

  const signing=generateKeyPairSync('ed25519').privateKey,db=path.join(directory,'queue.sqlite');
  const leaseFor=async d=>verifyLease(signing,issueLease(signing,await must(t1.client.rpc('school_operation_baseline',{p_class_id:klass,p_attendance_date:d}))));
  const intention=(payload)=>({operation_id:randomUUID(),kind:'attendance',authored_at:new Date().toISOString(),payload});
  const old=prepareOperation(await leaseFor(day(3)),intention({records:records('present')}));
  store=openOperations(db);store.setMode('offline');store.insert(old);const canonical=store.rows(t1.id,schools[0])[0].canonical;store.close();store=null;
  const moduleUrl=pathToFileURL(path.resolve('scripts/school-operations/store.mjs')).href;
  const childCode=`import {openOperations} from ${JSON.stringify(moduleUrl)};const s=openOperations(process.argv[1]);try{if(s.mode()!=='offline')throw Error('Restart mode lost');process.stdout.write('restart-ok');}finally{s.close();}`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',childCode,db],{encoding:'utf8',windowsHide:true,env:Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','TEMP','TMP'].filter(n=>process.env[n]).map(n=>[n,process.env[n]]))}).trim(),'restart-ok');
  store=openOperations(db);assert.equal(store.rows(t1.id,schools[0])[0].canonical,canonical);store.setMode('online');
  const send=(envelope,hash)=>must(t1.client.rpc('replay_school_operation',{p_envelope:envelope,p_payload_hash:hash}));
  await replayOperations(store,t1.id,schools[0],send,{force:true});assert.equal(store.rows(t1.id,schools[0])[0].state,'synced');
  const receiptCount=await must(admin.from('attendance_changes').select('id').eq('register_id',(await snapshot(t1,day(3))).register_id));
  const oldRow=store.rows(t1.id,schools[0])[0];await send(old,oldRow.payload_hash);assert.deepEqual(await must(admin.from('attendance_changes').select('id').eq('register_id',(await snapshot(t1,day(3))).register_id)),receiptCount);
  const modern=prepareOperation(await leaseFor(day(3)),intention({records:records('late'),attendance_version:2,expected_revision:1,action:'finalize',reason:'Offline classroom correction reviewed'}));
  store.insert(modern);store.setMode('lose-response');await replayOperations(store,t1.id,schools[0],send,{force:true});
  assert.equal(store.rows(t1.id,schools[0]).find(r=>r.operation_id===modern.operation_id).state,'pending');
  const afterLost=await persisted(day(3));await replayOperations(store,t1.id,schools[0],send,{force:true});assert.deepEqual(await persisted(day(3)),afterLost);
  assert.equal(store.rows(t1.id,schools[0]).find(r=>r.operation_id===modern.operation_id).state,'synced');
  // Preserve an old envelope needing a reason: no invented reason or silent drop.
  await must(admin.from('attendance_records').insert(records('absent').map(r=>({...r,class_id:klass,school_id:schools[0],attendance_date:day(4),marked_by:t1.id}))));
  const held=prepareOperation(await leaseFor(day(4)),intention({records:records('late')}));store.insert(held);
  const heldBefore=await persisted(day(4));await replayOperations(store,t1.id,schools[0],send,{force:true});
  const heldRow=store.rows(t1.id,schools[0]).find(r=>r.operation_id===held.operation_id);assert.equal(heldRow.state,'review');assert.equal(heldRow.error,'attendance_reason_required');assert.deepEqual(JSON.parse(heldRow.canonical),held);assert.deepEqual(await persisted(day(4)),heldBefore);
  const stale=prepareOperation(await leaseFor(day(3)),intention({records:records('absent'),attendance_version:2,expected_revision:2,action:'finalize',reason:'Offline stale correction'}));store.insert(stale);
  await must(write(t2,records('present'),2,'finalize','Newer Teacher confirmation',randomUUID(),day(3)));
  await replayOperations(store,t1.id,schools[0],send,{force:true});assert.equal(store.rows(t1.id,schools[0]).find(r=>r.operation_id===stale.operation_id).error,'attendance_conflict');
  console.log('PASS: unchanged legacy envelope, separate process restart, authorized replay, lost-response idempotency, modern correction, retained legacy/stale review holds.');

  browser=await chromium.launch({headless:true,channel:'chrome'});
  const teacherPage=await login('teacher','attendance'),register=teacherPage.locator('.teacher-attendance-register');
  await teacherPage.getByLabel('Date',{exact:true}).fill(day(6));await register.getByRole('button',{name:'Save draft',exact:true}).waitFor();
  await register.getByText('Draft — not confirmed for Parents',{exact:false}).waitFor();
  await register.getByRole('button',{name:'Save draft',exact:true}).click();await register.getByText('Draft saved. Parents cannot see draft attendance.',{exact:true}).waitFor();
  assert.deepEqual(await persisted(day(6)),[]);
  await capture(teacherPage,'teacher-draft.png');
  const parentPage=await login('parent','attendance');assert.equal((await must(parent.client.from('attendance_records').select('id').eq('student_id',students[0].id).eq('attendance_date',day(6)))).length,0);
  await register.getByRole('button',{name:'Finalize attendance',exact:true}).click();await register.getByText('Teacher-confirmed attendance',{exact:false}).waitFor();
  await register.locator('.roster-row').filter({hasText:'Synthetic M1 Child A'}).getByRole('button',{name:'Late',exact:true}).click();
  await register.getByRole('button',{name:'Save correction',exact:true}).click();await register.getByText('Enter a reason for changing finalized attendance.',{exact:true}).waitFor();
  await register.getByLabel('Reason for correction (required when statuses change)',{exact:true}).fill('Teacher verified late arrival');
  await register.getByRole('button',{name:'Save correction',exact:true}).click();await register.getByText('Attendance saved for',{exact:false}).waitFor();
  assert.equal((await persisted(day(6))).find(r=>r.student_id===students[0].id).status,'late');
  await parentPage.reload();await parentPage.getByText('Teacher-saved classroom records. Draft registers are not shown.',{exact:true}).waitFor();
  await capture(parentPage,'parent-final.png');
  const principalPage=await login('principal','attendance');await principalPage.locator('.role-principal').waitFor();
  await capture(principalPage,'principal-attendance.png');
  await browser.close();browser=null;
  // Revoked assignments and sessions are rechecked even for request retries.
  await must(admin.from('teacher_class_assignments').delete().eq('teacher_id',t2.id).eq('class_id',klass));
  await denied(write(t2,records('present'),3,'finalize','Revoked assignment'),'not_authorized');
  await must(admin.from('teacher_class_assignments').insert({teacher_id:unassigned.id,class_id:klass}));
  assert.equal((await snapshot(unassigned)).state,'finalized');
  await must(admin.from('profiles').update({active:false}).eq('id',unassigned.id));
  await denied(write(unassigned,records('present'),3),'not_authorized');
  const session=(await t1.client.auth.getSession()).data.session;
  await t1.client.auth.signOut({scope:'local'});
  const revoked=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${session.access_token}`}}});
  await denied(revoked.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:day(1)}),'not_authorized');
  console.log('PASS: actual mobile draft/finalize/reason/correction UI, Parent final-only records, Principal view, revoked session and assignment denial.');
} finally {
  await browser?.close();store?.close();
  for(const school of schools) {
    // Exact owned schools only, no blanket table or protected-record deletion.
    await must(admin.from('attendance_registers').delete().eq('school_id',school));
    for(const table of ['attendance_records','audit_events'])await must(admin.from(table).delete().eq('school_id',school));
    const ids=await must(admin.from('profiles').select('id').eq('school_id',school));
    if(ids.length)for(const [table,column] of [['parent_student_links','parent_id'],['teacher_class_assignments','teacher_id']])await must(admin.from(table).delete().in(column,ids.map(r=>r.id)));
    for(const table of ['students','classes','profiles'])await must(admin.from(table).delete().eq('school_id',school));
    for(const table of ['attendance_changes','attendance_registers','attendance_records'])assert.deepEqual(await must(admin.from(table).select('id').eq('school_id',school)),[]);
    await must(admin.from('schools').delete().eq('id',school));
  }
  for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error('Owned synthetic account cleanup failed');}
  assert.equal(path.dirname(directory),tmpdir());assert.ok(path.basename(directory).startsWith('schovera-m1-'));rmSync(directory,{recursive:true,force:false});
  console.log('Owned synthetic schools, attendance history/registers, accounts and temporary queue cleaned.');
}
