// Own synthetic fixtures; real HTTP capture/restart/replay and authorized RPCs.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
import {prepareManualFixture,cleanManualFixture,readManualFixture} from './manual-demo.mjs';
import {openOperations,verifyLease,issueLease,localSigningKey,LEASE_MS} from './school-operations/store.mjs';
import {openGatewayDatabase} from './rfid-gateway/storage.mjs';
assertLocalTestEnvironment();
const base='http://127.0.0.1:3105',origin=base;
process.env.SCHOVERA_TEST_URL=base;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error(`Synthetic operation query failed: ${r.error.code}`);return r.data;};
const output=path.resolve('.local',`school-operation-qa-${randomUUID()}`);mkdirSync(output,{recursive:true});
const database=path.resolve('.local/schovera-rfid-gateway/gateway.sqlite');
const control=mode=>{const s=openOperations(database);try{if(mode)s.setMode(mode);return s.mode();}finally{s.close();}};
const previousMode=control();
let server,fixture,browser,foreignSchool;
const log=openSync(path.join(output,'server.log'),'a');
const minimal=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(n=>process.env[n]).map(n=>[n,process.env[n]]));
async function until(check,label,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await delay(250);}throw Error(`Timed out: ${label}`);}
async function start(){
  server=spawn(process.execPath,['scripts/dev-rfid-local.mjs','--port','3105'],{cwd:process.cwd(),env:minimal,stdio:['ignore',log,log],windowsHide:true});
  await until(async()=>{try{return (await fetch(base,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}},'owned Next readiness',60000);
}
function stop(){if(server&&server.exitCode===null){assert.ok(server.pid>0);execFileSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}server=null;}
async function captureView(page,filename){
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,left:0,behavior:'instant'});});
  await page.screenshot({path:path.join(output,filename),fullPage:true,animations:'disabled',style:'.application-shell{position:relative!important;top:auto!important}'});
}
async function account(name){const c=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword(fixture.accounts[name]);if(r.error)throw Error('Synthetic sign-in failed');return {client:c,token:r.data.session.access_token,id:r.data.user.id};}
async function api(actor,body,status=200,extra={}){
  const r=await fetch(`${base}/api/school/operations`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(actor?{Authorization:`Bearer ${actor.token}`}:{}) ,...extra},body:JSON.stringify(body)});
  assert.equal(r.status,status,`Operation API ${body.action}: expected ${status}, got ${r.status}`);return r.json();
}
const op=(kind,payload)=>({operation_id:randomUUID(),kind,payload,authored_at:new Date().toISOString()});
const capture=(teacher,lease,operation)=>api(teacher,{action:'capture',lease,operation},202);
const status=(teacher,lease)=>api(teacher,{action:'status',lease});
const attendanceRows=(student,date)=>must(admin.from('attendance_records').select('id,status,updated_at').eq('student_id',student).eq('attendance_date',date));
try {
  let occupied=false;try{await fetch(base,{signal:AbortSignal.timeout(1000)});occupied=true;}catch{}assert.equal(occupied,false,'Port 3105 is already owned; refusing to interfere.');
  control('online');await start();fixture=await prepareManualFixture({onCreated:f=>fixture=f});
  const teacher=await account('teacher'),parent=await account('parent'),principal=await account('principal'),unassigned=await account('unassignedTeacher');
  const klass=fixture.classes[0].id,student=fixture.students[0].id,day=fixture.dates.at(-1);
  const leaseFor=async(date=day,classId=klass)=>(await api(teacher,{action:'lease',class_id:classId,attendance_date:date})).lease;
  await api(null,{action:'lease',class_id:klass,attendance_date:day},401);
  await api(parent,{action:'lease',class_id:klass,attendance_date:day},403);
  await api(unassigned,{action:'lease',class_id:klass,attendance_date:day},403);
  await api(teacher,{action:'status'},403,{Origin:'https://example.invalid'});
  foreignSchool=await must(admin.from('schools').insert({code:`OP-FOREIGN-${randomUUID()}`,name:'Synthetic foreign operation school',timezone:'Asia/Kolkata'}).select('id').single());
  const foreignClass=await must(admin.from('classes').insert({school_id:foreignSchool.id,grade:'7',division:'A',academic_year:'synthetic'}).select('id').single());
  await api(teacher,{action:'lease',class_id:foreignClass.id,attendance_date:day},403);
  const lease=await leaseFor();
  const malformed=await teacher.client.rpc('replay_school_operation',{p_envelope:{kind:null,payload:{}},p_payload_hash:'0'.repeat(64)});assert.ok(malformed.error?.message.includes('invalid_operation'));
  const bypass=await teacher.client.rpc('save_class_attendance_authorized_inner',{p_class_id:klass,p_attendance_date:day,p_records:[{student_id:student,status:'present'}]});assert.ok(bypass.error,'Inner attendance implementation must not be browser-callable.');
  const invalid=op('attendance',{records:[{student_id:student,status:'safe'}]});await api(teacher,{action:'capture',lease,operation:invalid},409);
  await api(teacher,{action:'capture',lease,operation:op('attendance',{records:[{student_id:fixture.students[1].id,status:'present'}]})},409);
  await api(teacher,{action:'capture',lease:`broken.${lease.split('.')[1]}`,operation:invalid},409);
  const key=localSigningKey(path.dirname(database)),claims=verifyLease(key,lease);
  const expired=issueLease(key,claims,Date.now()-LEASE_MS-1000);await api(teacher,{action:'capture',lease:expired,operation:invalid},409);
  const online=op('attendance',{records:[{student_id:student,status:'present'}]});await capture(teacher,lease,online);await api(teacher,{action:'sync',retry:true});
  const saved=await attendanceRows(student,day);assert.equal(saved.length,1);assert.equal(saved[0].status,'present');
  await api(teacher,{action:'sync',retry:true});assert.deepEqual(await attendanceRows(student,day),saved);
  console.log('Online capture, atomic receipt, same-operation retry, invalid/forged/expired proof, role/school/Origin denial passed.');

  const queuedDay=fixture.dates.at(-2),offlineLease=await leaseFor(queuedDay);
  const offline=op('attendance',{records:[{student_id:student,status:'late'}]});
  const notice=op('update',{student_id:student,category:'general',title:`Synthetic pending ${randomUUID()}`,message:'Original synthetic notice at 09:00. No automatic approval.'});
  const secondNotice=op('update',{...notice.payload,title:`Synthetic second ${randomUUID()}`});
  control('authority-offline');
  await api(teacher,{action:'lease',class_id:klass,attendance_date:queuedDay},503);
  await capture(teacher,offlineLease,offline);await capture(teacher,offlineLease,notice);await capture(teacher,offlineLease,secondNotice);
  assert.equal((await attendanceRows(student,queuedDay))[0].status,'absent');
  assert.equal((await must(admin.from('student_updates').select('id').eq('teacher_id',teacher.id).eq('title',notice.payload.title))).length,0);
  assert.equal((await status(teacher,offlineLease)).rows.filter(r=>r.state==='pending').length,3);
  stop();await start();assert.equal((await status(teacher,offlineLease)).rows.filter(r=>r.state==='pending').length,3);
  control('online');const synced=await api(teacher,{action:'sync',retry:true});assert.ok(synced.rows.filter(r=>[offline.operation_id,notice.operation_id,secondNotice.operation_id].includes(r.operation_id)).every(r=>r.state==='synced'));
  assert.equal((await attendanceRows(student,queuedDay))[0].status,'late');
  await api(teacher,{action:'sync',retry:true});
  const received=await must(parent.client.from('student_updates').select('id,title,message,sent_at').eq('title',notice.payload.title));assert.equal(received.length,1);assert.equal(received[0].message,notice.payload.message);
  const receipt=await must(admin.from('school_operation_receipts').select('envelope,receipt').eq('actor_id',teacher.id).eq('operation_id',notice.operation_id).single());assert.equal(receipt.envelope.authored_at,notice.authored_at);
  assert.equal((await must(admin.from('communication_translations').select('id').eq('student_update_id',received[0].id))).length,0);
  console.log('Authority outage simulation: actual durable capture, 3 pending operations, real Next process restart, authorized RPC replay, original timestamps/text and Parent visibility passed.');

  const conflictDay=fixture.dates.at(-3),conflictLease=await leaseFor(conflictDay),conflict=op('attendance',{records:[{student_id:student,status:'absent'}]});
  control('offline');await capture(teacher,conflictLease,conflict);
  await must(teacher.client.rpc('save_class_attendance',{p_class_id:klass,p_attendance_date:conflictDay,p_records:[{student_id:student,status:'present'}]}));
  const corrected=await attendanceRows(student,conflictDay);control('online');
  assert.equal((await api(teacher,{action:'sync',retry:true})).rows.find(r=>r.operation_id===conflict.operation_id).state,'review');
  assert.deepEqual(await attendanceRows(student,conflictDay),corrected);
  const lost=op('update',{...notice.payload,title:`Synthetic lost response ${randomUUID()}`});await capture(teacher,await leaseFor(),lost);control('lose-response');
  const lostResult=await api(teacher,{action:'sync',retry:true});assert.equal(lostResult.rows.find(r=>r.operation_id===lost.operation_id).state,'pending');
  assert.equal((await must(parent.client.from('student_updates').select('id').eq('title',lost.payload.title))).length,1);
  await Promise.all([api(teacher,{action:'sync',retry:true}),api(teacher,{action:'sync',retry:true})]);
  assert.equal((await must(parent.client.from('student_updates').select('id').eq('title',lost.payload.title))).length,1);
  const secondClass=fixture.classes[1].id,secondStudent=fixture.students[1].id,revoked=op('update',{...notice.payload,student_id:secondStudent,title:`Synthetic revoked ${randomUUID()}`});
  control('offline');await capture(teacher,await leaseFor(day,secondClass),revoked);
  await must(admin.from('teacher_class_assignments').delete().eq('teacher_id',teacher.id).eq('class_id',secondClass));control('online');
  assert.equal((await api(teacher,{action:'sync',retry:true})).rows.find(r=>r.operation_id===revoked.operation_id).state,'review');
  assert.equal((await must(admin.from('student_updates').select('id').eq('title',revoked.payload.title))).length,0);
  const foreignReplay=await parent.client.rpc('replay_school_operation',{p_envelope:receipt.envelope,p_payload_hash:'0'.repeat(64)});assert.ok(foreignReplay.error);
  const deniedReceipts=await parent.client.from('school_operation_receipts').select('*');assert.ok(deniedReceipts.error,'Browser roles must not read private operation receipts.');
  console.log('Stale attendance held without overwrite; acceptance with lost response and concurrent retry produced one row; revoked class and direct unauthorized replay denied.');

  browser=await chromium.launch({headless:true});
  const view=await browser.newContext({viewport:{width:390,height:844}});const page=await view.newPage();page.setDefaultTimeout(30000);
  const external=[];await view.route('**/*',r=>{const u=new URL(r.request().url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol))return r.continue();external.push(u.hostname);return r.abort();});
  await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(fixture.accounts.teacher.email);await page.getByLabel('Password',{exact:true}).fill(fixture.accounts.teacher.password);await page.getByRole('button',{name:'Sign in securely',exact:true}).click();await page.locator('.role-teacher').waitFor();
  await page.goto(`${base}/teacher/attendance`);await page.getByRole('button',{name:'Grade 8-A',exact:true}).click();const uiDay=fixture.dates[1];await page.getByLabel('Date',{exact:true}).fill(uiDay);
  await page.getByRole('button',{name:'Enable offline saving',exact:true}).click();await page.getByText('Offline saving ready (30-minute permission).',{exact:true}).waitFor();
  control('authority-offline');const register=page.locator('.teacher-attendance-register');await register.locator('.roster-row').getByRole('button',{name:'Late',exact:true}).click();await register.getByRole('button',{name:/Save attendance|Save changes/}).click();
  await page.getByText('Saved locally — waiting to sync.',{exact:true}).waitFor();assert.equal((await attendanceRows(student,uiDay))[0].status,'absent');
  stop();await start();await until(async()=>{const s=openOperations(database);try{return s.rows(teacher.id,fixture.schoolId).some(r=>JSON.parse(r.canonical).attendance_date===uiDay&&r.state==='pending');}finally{s.close();}},'pending UI record after server restart');
  control('online');await until(async()=>(await attendanceRows(student,uiDay))[0].status==='late','automatic browser attendance replay');
  await page.goto(`${base}/teacher/students`);await page.getByRole('button',{name:/Synthetic Child A/}).first().click();
  await page.getByText('Offline saving ready (30-minute permission).',{exact:true}).waitFor();
  const uiTitle=`Synthetic UI important ${randomUUID()}`,uiMessage='Original notice: bring a library book at 09:00.';
  const before=await must(principal.client.rpc('principal_communication_page',{p_filter:'all',p_limit:6}));
  control('offline');await page.locator('input[name=title]').fill(uiTitle);await page.locator('textarea[name=message]').fill(uiMessage);await page.locator('input[name=important]').check();await page.getByRole('button',{name:'Send update to parent',exact:true}).click();
  await page.getByText('Saved locally — waiting to sync.',{exact:true}).waitFor();assert.equal((await must(parent.client.from('student_updates').select('id').eq('title',uiTitle))).length,0);
  await captureView(page,'teacher-pending-mobile.png');control('online');
  await until(async()=>(await must(parent.client.from('student_updates').select('id').eq('title',uiTitle))).length===1,'automatic Important update replay');
  const after=await must(principal.client.rpc('principal_communication_page',{p_filter:'all',p_limit:6}));assert.equal(after.summary.important_count,before.summary.important_count+1);
  assert.deepEqual(external,[]);await captureView(page,'teacher-synced-mobile.png');
  async function portal(role,section){
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol))return r.continue();external.push(u.hostname);return r.abort();});
    const p=await ctx.newPage();p.setDefaultTimeout(30000);await p.goto(base);await p.getByLabel('Email',{exact:true}).fill(fixture.accounts[role].email);await p.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.locator(`.role-${role}`).waitFor();await p.goto(`${base}/${role}/${section}`);return p;
  }
  const parentPage=await portal('parent','updates');await parentPage.locator('.child-switcher select').selectOption({label:'Synthetic Child A'});
  await parentPage.getByText(uiTitle,{exact:true}).first().waitFor();await parentPage.getByText(uiMessage,{exact:true}).first().waitFor();
  await parentPage.getByRole('button',{name:`Acknowledge update: ${uiTitle}`,exact:true}).first().click();
  const uiUpdate=await must(parent.client.from('student_updates').select('id').eq('title',uiTitle).single());
  await until(async()=>(await must(admin.from('acknowledgements').select('id').eq('update_id',uiUpdate.id))).length===1,'queued update acknowledgement');
  await parentPage.goto(`${base}/parent/attendance`);await parentPage.locator('.child-switcher select').selectOption({label:'Synthetic Child A'});
  const parentRecords=await must(parent.client.from('attendance_records').select('status').eq('student_id',student));
  await until(async()=>await parentPage.locator('#parent-attendance .attendance-card .attendance-counts span').filter({hasText:'Late'}).locator('b').innerText().catch(()=>null)===String(parentRecords.filter(r=>r.status==='late').length),'Parent late attendance total');
  await captureView(parentPage,'parent-attendance-after-sync.png');
  const principalPage=await portal('principal','communication');
  await until(async()=>await principalPage.locator('.metric-important b').innerText().catch(()=>null)===String(after.summary.important_count),'Principal actual UI important total');
  await captureView(principalPage,'principal-after-sync.png');assert.deepEqual(external,[]);
  const loggedOutToken=teacher.token;await teacher.client.auth.signOut({scope:'local'});
  await api({token:loggedOutToken},{action:'sync'},401);
  const revokedSession=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${loggedOutToken}`}}});
  const directLogout=await revokedSession.rpc('school_operation_identity');assert.ok(directLogout.error);
  console.log('390px three-portal UI: Teacher durable saving/restart/automatic replay, Parent original/attendance/acknowledgement, Principal exact totals and logged-out session denial passed.');
  writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,runId:fixture.runId,at:new Date().toISOString(),scope:'Synthetic loopback destination and authority interruption simulation; real SQLite/HTTP/RPC persistence'},null,2));
}catch(error){
  const s=openOperations(database);try{writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,rows:fixture?.accounts?.teacher?.id?s.rows(fixture.accounts.teacher.id,fixture.schoolId).map(r=>({kind:r.kind,state:r.state,error:r.error,attendance_date:r.attendance_date})):[]},null,2));}finally{s.close();}
  const p=browser?.contexts()[0]?.pages()[0];if(p)await p.screenshot({path:path.join(output,'failure-mobile.png'),fullPage:true}).catch(()=>{});
  throw error;
}finally {
  await browser?.close();stop();closeSync(log);
  const s=openGatewayDatabase(database);try{if(fixture?.accounts?.teacher?.id)s.db.prepare('DELETE FROM school_operations WHERE actor_id=? AND school_id=?').run(fixture.accounts.teacher.id,fixture.schoolId);}finally{s.close();}
  control(previousMode);
  if(foreignSchool){await must(admin.from('classes').delete().eq('school_id',foreignSchool.id));await must(admin.from('schools').delete().eq('id',foreignSchool.id));}
  if(fixture){assert.equal(readManualFixture().runId,fixture.runId);await cleanManualFixture();}
  console.log(`Owned school-operation fixture/queue cleaned. Evidence: ${output}`);
}
