import assert from 'node:assert/strict';
import { existsSync,readFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DemoAdapter } from './adapter.mjs';
import { fingerprint } from './target.mjs';
import { assertLocalTestEnvironment } from '../lib/local-test-env.mjs';
import { classroomInsights } from '../../src/lib/attendance-insights.ts';

assertLocalTestEnvironment();
if(existsSync('.env.local'))throw new Error('Isolated integration checkout required');
const credentials={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const expiresAt=new Date(Date.now()+86400000).toISOString();
const approval={version:1,purpose:'schovera-fictional-demo',datasetSha256:'ac5db776b7d53974693a10cd888d69ae619ac90b5b35fb7597e9e365676ccb2a',mode:'local',projectRef:'local-Schovera',url:credentials.url,verifiedBy:'local CLI rehearsal',verificationEvidence:'loopback Docker Supabase; isolated test env',expiresAt:new Date(Date.now()+3*86400000).toISOString(),secretKeySha256:fingerprint(credentials.key),publishableKeySha256:fingerprint(credentials.publishableKey)};
const dataset=JSON.parse(readFileSync(new URL('./fixtures/fictional-campus.json',import.meta.url),'utf8'));
const directory=mkdtempSync(path.join(tmpdir(),'schovera-provisioner-'));
const runId=randomUUID(),otherRun=randomUUID(),options={runId,expiresAt},confirm=operation=>`${operation}:local-Schovera:${runId}`;
let fail=true,authFail=true,networkFail=true,otherClock=Date.now();
const adapter=new DemoAdapter({approval,credentials,directory,
  fetcher:async(input,init)=>{const result=await fetch(input,init);if(networkFail&&init?.method==='POST'&&String(input).includes('/rest/v1/schools')){networkFail=false;throw new Error('synthetic connection loss after acceptance');}return result;},
  fault:stage=>{if(authFail&&stage==='auth-response'){authFail=false;throw new Error('synthetic Auth lost response');}if(fail&&stage==='row-response'){fail=false;throw new Error('synthetic lost response');}}});
const other=new DemoAdapter({approval,credentials,directory,localTestClock:()=>otherClock});
const must=async q=>{const r=await q;if(r.error)throw new Error('Local integration query failed');return r.data;};
const results=[]; const passed=name=>{results.push(name);console.log(`PASS: ${name}`);};
try {
  const dry=await adapter.run(dataset,options);assert.equal(dry.dryRun,true);assert.equal(existsSync(path.join(directory,`${runId}.json`)),false);passed('default dry-run performs no provisioning');
  await assert.rejects(adapter.run(dataset,{...options,confirm:confirm('prepare')}),/synthetic Auth lost response/);passed('Auth accepted but response lost: PRE-journaled identity retained');
  await assert.rejects(adapter.run(dataset,{...options,confirm:confirm('prepare')}),/Bound demo operation failed/);passed('connection loss after server acceptance is recoverable, not acknowledged complete');
  await assert.rejects(adapter.run(dataset,{...options,confirm:confirm('prepare')}),/synthetic lost response/);passed('lost response after committed insert leaves recoverable durable journal');
  await adapter.run(dataset,{...options,confirm:confirm('prepare')});passed('first complete provision / partial recovery');
  const original=JSON.stringify(adapter.journal.rows);await adapter.run(dataset,{...options,confirm:confirm('prepare')});assert.equal(JSON.stringify(adapter.journal.rows),original);passed('idempotent rerun: stable IDs, no duplicate writes');
  await other.run(dataset,{runId:otherRun,expiresAt,confirm:`prepare:local-Schovera:${otherRun}`});
  const j=adapter.journal,t=j.rows;
  assert.equal((await must(adapter.db.from('students').select('id').eq('school_id',j.schoolId))).length,20);
  const actualStudents=await must(adapter.db.from('students').select('id,class_id').eq('school_id',j.schoolId));
  for(const c of t.classes)assert.equal(actualStudents.filter(s=>s.class_id===c.id).length,10);
  for(const table of ['parent_student_links','teacher_class_assignments']) {
    const actual=await must(adapter.db.from(table).select('id,student_id,parent_id,teacher_id,class_id'.split(',').filter(k=>k==='id'||Object.hasOwn(t[table][0],k)).join(',')).in('id',t[table].map(r=>r.id)));
    for(const expected of t[table])assert.deepEqual(actual.find(r=>r.id===expected.id),Object.fromEntries(Object.keys(actual[0]).map(k=>[k,expected[k]])));
  }
  assert.equal(t.parent_student_links.length,20);assert.ok(t.teacher_class_assignments.length>=2);passed('20 persisted students / two classes / exact Teacher assignments / guardian links');
  assert.equal(t.attendance_records.length,200);assert.ok(t.class_assignments.length>=6&&t.timetable_entries.length>=36&&t.announcements.length>=2);passed('connected attendance, homework, timetable and school notices');
  const insights=classroomInsights(t.students,t.attendance_records,t.classes[0].id,{from:'2026-01-01',to:'2026-12-31'});assert.ok(JSON.stringify(insights).includes('repeated'));passed('recorded absence pattern has explainable insight');
  const accounts=Object.entries(j.accounts), clients={};
  for(const [logical,a]of accounts){const c=adapter.actor();await must(c.auth.signInWithPassword({email:a.email,password:a.password}));clients[logical]=c;}
  passed('all 13 owned role accounts log in');
  // Export order is UUID order, not family order. Choose the guardian of the
  // prepared translated notice, rather than assuming the first Parent owns it.
  const translatedUpdate=t.student_updates.find(u=>u.title==='Library notebook reminder');
  const guardian=t.parent_student_links.find(l=>l.student_id===translatedUpdate.student_id).parent_id;
  const parentKey=accounts.find(([,a])=>a.id===guardian)[0],principalKey=accounts.find(([,a])=>a.role==='principal')[0];
  const p=clients[parentKey],linked=t.parent_student_links.filter(l=>l.parent_id===j.accounts[parentKey].id).map(l=>l.student_id);
  const visible=await must(p.from('students').select('id'));assert.deepEqual(new Set(visible.map(s=>s.id)),new Set(linked));
  const entries=await must(p.from('school_entry_events').select('student_id'));assert.ok(entries.length&&entries.every(r=>linked.includes(r.student_id)));passed('Parent sees only linked children and entry history');
  for(const [logical,a]of accounts.filter(([,a])=>a.role==='teacher')){const assigned=t.teacher_class_assignments.filter(l=>l.teacher_id===a.id).map(l=>l.class_id);const rows=await must(clients[logical].from('students').select('class_id'));assert.ok(rows.every(r=>assigned.includes(r.class_id)));}passed('Teacher assigned / unassigned class isolation');
  const rows=await must(clients[principalKey].from('students').select('school_id'));assert.equal(rows.length,20);assert.ok(rows.every(s=>s.school_id===j.schoolId));passed('Principal cross-school isolation');
  const anon=adapter.actor();for(const table of ['students','school_entry_events','student_credentials','school_devices']){const r=await anon.from(table).select('id');assert.ok(r.error||r.data.length===0);}passed('anonymous reads denied');
  const tr=await must(p.from('communication_translations').select('status,language'));assert.ok(tr.some(r=>r.language==='hi')&&tr.some(r=>r.language==='mr'));assert.ok(tr.every(r=>r.status==='approved'));passed('Parent authorized approved synthetic Hindi / Marathi fixtures');
  const oldPassword=j.accounts[parentKey].password,oldSession=(await p.auth.getSession()).data.session;
  await adapter.run(dataset,{...options,operation:'rotate',account:parentKey,confirm:confirm('rotate')});
  assert.ok((await adapter.actor().auth.signInWithPassword({email:j.accounts[parentKey].email,password:oldPassword})).error);
  const old=adapter.actor();await old.auth.setSession({access_token:oldSession.access_token,refresh_token:oldSession.refresh_token});
  const denied=await old.from('students').select('id');assert.ok(denied.error||denied.data.length===0);
  const rotated=adapter.journal.accounts[parentKey];
  const fresh=adapter.actor();await must(fresh.auth.signInWithPassword({email:rotated.email,password:rotated.password}));assert.equal((await must(fresh.from('students').select('id'))).length,2);passed('rotation: old password, refresh session and old access token invalid; new login works');
  await adapter.run(dataset,{...options,operation:'disable',account:parentKey,confirm:confirm('disable')});
  const disabled=await fresh.from('students').select('id');assert.ok(disabled.error||disabled.data.length===0);passed('compromised demo account disabled including issued access');
  const expiring=Object.values(other.journal.accounts).find(a=>a.role==='principal'),expiredClient=other.actor();
  await must(expiredClient.auth.signInWithPassword({email:expiring.email,password:expiring.password}));
  await must(other.db.auth.admin.updateUserById(expiring.id,{app_metadata:{schovera_demo_expires_at:'2000-01-01T00:00:00Z'}}));
  const expiredRead=await expiredClient.from('students').select('id');assert.ok(expiredRead.error||expiredRead.data.length===0);
  assert.ok((await expiredClient.rpc('publish_announcement',{p_title:'Must be denied',p_body:'Expired session cannot write',p_priority:'normal',p_client_request_id:randomUUID()})).error);passed('server-side demo expiry denies both issued-token reads and privileged RPC writes');
  const report=JSON.stringify(adapter.report());assert.ok(!report.includes(credentials.key)&&!Object.values(j.accounts).some(a=>report.includes(a.password)||report.includes(a.email)));passed('operational report excludes passwords, emails and privileged keys');
  const dryReset=await adapter.run(dataset,{...options,operation:'reset'});assert.equal(dryReset.dryRun,true);passed('destructive reset defaults to dry-run');
  await adapter.run(dataset,{...options,operation:'reset',confirm:confirm('reset')});
  assert.equal(await must(adapter.db.from('schools').select('id').eq('id',j.schoolId).maybeSingle()),null);
  assert.ok(await must(adapter.db.from('schools').select('id').eq('id',other.journal.schoolId).single()));passed('exact owned cleanup; unrelated school survives');
  for(const a of Object.values(j.accounts)){assert.ok((await adapter.db.auth.admin.getUserById(a.id)).error);}passed('owned Auth accounts removed');
  otherClock=Date.parse(expiresAt)+1000;
  await other.run(dataset,{runId:otherRun,expiresAt,operation:'remove-expired',confirm:`remove-expired:local-Schovera:${otherRun}`});
  assert.equal(await must(adapter.db.from('schools').select('id').eq('id',other.journal.schoolId).maybeSingle()),null);passed('scheduled expired fixture cleanup with local test clock');
} finally {
  for(const [a,id]of [[adapter,runId],[other,otherRun]]) {
    if(existsSync(path.join(directory,`${id}.json`)))await a.run(dataset,{runId:id,expiresAt,operation:'reset',confirm:`reset:local-Schovera:${id}`});
  }
  rmSync(directory,{recursive:true,force:true});
  const output='.local/schovera-rfid-gateway/task32t';mkdirSync(output,{recursive:true});writeFileSync(`${output}/integration.json`,JSON.stringify({results,localOnly:true},null,2));
}
console.log(`Provisioner integration passed: ${results.length} scenario groups; synthetic local data cleaned.`);
