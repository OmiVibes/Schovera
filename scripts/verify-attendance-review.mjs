// M2 acceptance: owned fictional schools, signed mock events, real RPCs/browser.
import assert from 'node:assert/strict';
import {createPrivateKey,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
import {prepareManualFixture,manualPaths,readManualFixture,cleanManualFixture} from './manual-demo.mjs';
import {LocalSupabaseV2Transport,DefinitiveRemoteAttention} from './rfid-gateway/local-v2-transport.mjs';
import {uiText} from '../src/lib/ui-copy.ts';
import {mockReaderEvent} from './attendance-demo/mock-reader.mjs';
import {schoolToday,shiftSchoolDate} from '../src/lib/school-date.mjs';
import {openGatewayDatabase} from './rfid-gateway/storage.mjs';

assertLocalTestEnvironment();
const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104',day=schoolToday();
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error(`${r.error.code}: ${r.error.message}`);return r.data;};
const deny=async(q,code)=>{const r=await q;assert.ok(r.error,'Expected denial');if(code)assert.ok(r.error.message.includes(code),r.error.message);};
const out=path.resolve('.local',`attendance-review-${randomUUID()}`);mkdirSync(out,{recursive:true});
let fixture,browser,foreignSchool,foreignUser;
const runtimeErrors=[];
async function account(name){const c=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});await must(c.auth.signInWithPassword(fixture.accounts[name]));return c;}
async function login(role,route){
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol)?r.continue():r.abort();});
  const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>runtimeErrors.push(e.message));await p.goto(base);
  await p.getByLabel('Email',{exact:true}).fill(fixture.accounts[role].email);await p.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.locator(`.role-${role}`).waitFor();await p.goto(`${base}/${role}/${route}`);return p;
}
async function capture(p,name){await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,behavior:'instant'});});await p.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled',style:'.application-shell{position:relative!important;top:auto!important}'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');}
try {
  fixture=await prepareManualFixture({onCreated:f=>fixture=f});
  const teacher=await account('teacher'),principal=await account('principal'),parent=await account('parent'),unassigned=await account('unassignedTeacher'),unlinked=await account('unlinkedParent');
  const klass=fixture.classes[0].id,student=fixture.students[0].id;
  const manual=await must(admin.from('students').insert({school_id:fixture.schoolId,class_id:klass,full_name:'Synthetic Manual Fallback',roll_number:'02',active:true}).select('id').single());
  await must(admin.from('parent_student_links').insert({parent_id:fixture.accounts.parent.id,student_id:manual.id,status:'active'}));
  const review=()=>must(teacher.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:day}));
  const row=async id=>(await review()).rows.find(r=>r.student_id===id);
  const snap=()=>must(teacher.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:day}));
  const published=()=>must(admin.from('attendance_records').select('student_id,status,updated_at').eq('class_id',klass).eq('attendance_date',day).order('student_id'));
  const change=async(status,reason,revision)=>(await teacher.rpc('write_class_attendance',{p_class_id:klass,p_attendance_date:day,p_records:[{student_id:student,status},{student_id:manual.id,status:'present'}],p_expected_revision:revision,p_action:'finalize',p_reason:reason,p_request_id:randomUUID()}));
  for(const actor of [parent,unassigned])await deny(actor.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:day}),'not_authorized');
  await deny(teacher.rpc('write_class_attendance_m1_inner',{p_class_id:klass,p_attendance_date:day,p_records:[{student_id:student,status:'present'},{student_id:manual.id,status:'present'}],p_expected_revision:0,p_action:'finalize',p_reason:null,p_request_id:randomUUID()}));
  await deny(parent.rpc('principal_attendance_review',{}),'not_authorized');await deny(unlinked.rpc('parent_classroom_confirmation',{p_student_id:student}),'not_authorized');
  await must(admin.from('teacher_class_assignments').insert({teacher_id:fixture.accounts.unassignedTeacher.id,class_id:fixture.classes[1].id}));
  await deny(unassigned.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:day}),'not_authorized');
  const bearer=(await teacher.auth.getSession()).data.session.access_token;
  const operationApi=async body=>{const r=await fetch(base+'/api/school/operations',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:JSON.stringify(body)});assert.equal(r.status,body.action==='capture'?202:200);return r.json();};
  const leaseA=(await operationApi({action:'lease',class_id:klass,attendance_date:day})).lease,leaseB=(await operationApi({action:'lease',class_id:fixture.classes[1].id,attendance_date:day})).lease;
  for(const [lease,child]of [[leaseA,student],[leaseB,fixture.students[1].id]])await operationApi({action:'capture',lease,operation:{operation_id:randomUUID(),kind:'update',authored_at:new Date().toISOString(),payload:{student_id:child,category:'general',title:'Synthetic lease isolation',message:'Synthetic local privacy check only'}}});
  const scopedA=await operationApi({action:'status',lease:leaseA}),scopedB=await operationApi({action:'status',lease:leaseB});
  assert.equal(scopedA.rows.length,1);assert.equal(scopedB.rows.length,1);assert.equal(scopedA.rows[0].class_id,klass);assert.equal(scopedB.rows[0].class_id,fixture.classes[1].id);
  await operationApi({action:'sync',retry:true});
  // An older version-2 intention with an M1-short reason must be retained,
  // not rewritten, force-applied or lost under the new reason policy.
  const past=fixture.dates.at(-1),oldSnapshot=await must(teacher.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:past}));
  const oldLease=(await operationApi({action:'lease',class_id:klass,attendance_date:past})).lease,oldId=randomUUID();
  await operationApi({action:'capture',lease:oldLease,operation:{operation_id:oldId,kind:'attendance',authored_at:new Date().toISOString(),payload:{records:[{student_id:student,status:'late'},{student_id:manual.id,status:'present'}],attendance_version:2,expected_revision:oldSnapshot.revision,action:'finalize',reason:'yes'}}});
  const queuePath=path.resolve('.local/schovera-rfid-gateway/gateway.sqlite');let savedEnvelope;
  {const s=openGatewayDatabase(queuePath);try{savedEnvelope=s.db.prepare('SELECT canonical FROM school_operations WHERE operation_id=?').get(oldId).canonical;}finally{s.close();}}
  const held=await operationApi({action:'sync',retry:true});assert.equal(held.rows.find(r=>r.operation_id===oldId).error,'attendance_reason_required');
  {const s=openGatewayDatabase(queuePath);try{assert.equal(s.db.prepare('SELECT canonical FROM school_operations WHERE operation_id=?').get(oldId).canonical,savedEnvelope);}finally{s.close();}}
  assert.deepEqual((await must(teacher.rpc('class_attendance_snapshot',{p_class_id:klass,p_attendance_date:past}))).records,oldSnapshot.records);
  await deny(parent.from('attendance_exception_reviews').select('*'));
  await deny(teacher.from('attendance_exception_reviews').insert({school_id:fixture.schoolId,class_id:klass,student_id:student,attendance_date:day,fingerprint:'0'.repeat(32),actor_id:fixture.accounts.teacher.id,request_id:randomUUID(),reason:'Unauthorized direct write'}));
  assert.deepEqual((await row(student)).flags,[]);assert.deepEqual(await published(),[]);
  const enrollment=JSON.parse(readFileSync(manualPaths().enrollmentPath,'utf8'));
  const transport=new LocalSupabaseV2Transport({target:base,devicePrivateKey:createPrivateKey(enrollment.devicePrivateKey)});
  const first=mockReaderEvent(enrollment,'scan',new Date().toISOString());const receipt=await transport.send(first);assert.equal(receipt.outcome,'accepted');
  assert.equal((await transport.send(first)).duplicate,true);assert.equal((await row(student)).gate_events,1);
  assert.deepEqual((await row(student)).flags,['gate_without_confirmation']);assert.deepEqual(await published(),[]);
  const wire=JSON.stringify(await review());for(const secret of [enrollment.credentialRef,enrollment.capability,enrollment.devicePrivateKey,enrollment.assignmentId])assert.ok(!wire.includes(secret),'Reader material leaked');
  assert.deepEqual(Object.keys(await must(parent.rpc('parent_classroom_confirmation',{p_student_id:student}))).sort(),['attendance_date','available','status']);
  console.log('PASS: signed mock event, exact replay deduplication, no automatic attendance, source-limited flags, no card material and role denial.');

  browser=await chromium.launch({channel:'chrome',headless:true});const teacherPage=await login('teacher','attendance'),register=teacherPage.locator('.teacher-attendance-register');
  await teacherPage.context().route('**/rest/v1/rpc/class_attendance_snapshot',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"synthetic unavailable"}'}));
  await teacherPage.reload();await register.getByText('Register state unavailable — refresh before saving',{exact:true}).first().waitFor();assert.equal(await register.getByRole('button',{name:'Finalize attendance',exact:true}).isDisabled(),true);assert.deepEqual(await published(),[]);
  await capture(teacherPage,'teacher-register-unavailable.png');await teacherPage.context().unroute('**/rest/v1/rpc/class_attendance_snapshot');await teacherPage.reload();
  await teacherPage.getByText('Gate evidence recorded; classroom attendance is not confirmed',{exact:true}).waitFor();
  await register.locator('.roster-row').filter({hasText:'Synthetic Child A'}).getByRole('button',{name:'Late',exact:true}).click();
  await teacherPage.locator('.portal-more-menu > summary').click();
  teacherPage.once('dialog',d=>d.dismiss());await teacherPage.locator('.portal-more-menu a[href="/teacher/home"]').click();assert.ok(teacherPage.url().endsWith('/teacher/attendance'),'Unsaved navigation was not guarded');
  await teacherPage.keyboard.press('Escape');
  await register.locator('.roster-row').filter({hasText:'Synthetic Child A'}).getByRole('button',{name:'Late',exact:true}).and(register.locator('[aria-pressed=true]')).waitFor();
  await register.getByRole('button',{name:'Mark all Present (unsaved)',exact:true}).focus();await teacherPage.keyboard.press('Enter');assert.deepEqual(await published(),[]);
  await register.getByRole('button',{name:'Save draft',exact:true}).click();await register.getByText('Draft saved. Parents cannot see draft attendance.',{exact:true}).waitFor();assert.deepEqual(await published(),[]);
  assert.equal((await must(parent.rpc('parent_classroom_confirmation',{p_student_id:student}))).available,false);await capture(teacherPage,'teacher-gate-exception-draft.png');
  await register.getByRole('button',{name:'Finalize attendance',exact:true}).click();await register.getByText('Teacher-confirmed attendance',{exact:false}).waitFor();
  assert.equal((await must(parent.rpc('parent_classroom_confirmation',{p_student_id:student}))).status,'present');
  const fallback=await row(manual.id);assert.deepEqual(fallback.flags,['no_matching_scan']);assert.equal(fallback.classroom_status,'present');
  const article=register.locator('.m2-exception').filter({hasText:'Synthetic Manual Fallback'});
  await article.getByRole('button',{name:'Review without changing attendance',exact:true}).click();
  const explanation='Teacher checked forgotten card manually';await article.getByLabel('What did you check?',{exact:true}).fill(explanation);const before=await published();
  await article.getByRole('button',{name:'Record staff review',exact:true}).focus();await teacherPage.keyboard.press('Enter');await register.getByText('Review recorded. Classroom attendance was not changed.',{exact:true}).waitFor();assert.deepEqual(await published(),before);assert.equal((await row(manual.id)).reviewed,true);
  const acknowledged=await row(manual.id),reviewId=randomUUID();
  const intent={p_class_id:klass,p_attendance_date:day,p_student_id:manual.id,p_fingerprint:acknowledged.fingerprint,p_reason:'Second deliberate staff review',p_request_id:reviewId};
  const ids=await Promise.all([must(teacher.rpc('review_attendance_exception',intent)),must(teacher.rpc('review_attendance_exception',intent))]);assert.equal(ids[0],ids[1]);
  await deny(teacher.rpc('review_attendance_exception',{...intent,p_reason:'Changed review explanation'}),'operation_conflict');
  await deny(parent.rpc('review_attendance_exception',intent),'not_authorized');
  await capture(teacherPage,'teacher-manual-fallback-reviewed.png');
  const parentPage=await login('parent','attendance');await parentPage.locator('.child-switcher select').selectOption(student);await parentPage.getByText(`Current class: Teacher-saved attendance is available for ${day}.`,{exact:true}).waitFor();
  await parentPage.context().route('**/rest/v1/rpc/parent_classroom_confirmation',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"synthetic unavailable"}'}));
  await parentPage.reload();await parentPage.getByText('Today’s classroom confirmation is unavailable. Earlier saved history is shown separately.',{exact:true}).waitFor();assert.deepEqual(await published(),before);
  await capture(parentPage,'parent-confirmation-unavailable.png');await parentPage.context().unroute('**/rest/v1/rpc/parent_classroom_confirmation');await parentPage.reload();await parentPage.getByText(`Current class: Teacher-saved attendance is available for ${day}.`,{exact:true}).waitFor();
  assert.ok(!(await parentPage.locator('body').innerText()).includes(explanation));await capture(parentPage,'parent-confirmed-classroom.png');
  console.log('PASS: guarded mobile navigation, unsaved bulk edits, draft privacy, explicit finalize, forgotten-card fallback, immutable staff review, private Parent confirmation.');

  const current=await snap();await deny(change('absent','yes',current.revision),'attendance_reason_required');
  await must(change('absent','Teacher reviewed absence evidence',current.revision));assert.ok((await row(student)).flags.includes('gate_class_mismatch'));
  await must(change('present','Teacher checked classroom presence',(await snap()).revision));
  const separate=mockReaderEvent(enrollment,'separate',new Date().toISOString());await transport.send(separate);assert.ok((await row(student)).flags.includes('separate_scans'));
  const stale=await row(student),request={p_class_id:klass,p_attendance_date:day,p_student_id:student,p_fingerprint:stale.fingerprint,p_reason:'Teacher reviewed separate scans',p_request_id:randomUUID()};
  const delayed=mockReaderEvent(enrollment,'delayed',new Date(Date.now()-26*60*60_000).toISOString());
  const race=await Promise.all([teacher.rpc('review_attendance_exception',request),transport.send(delayed)]);
  if(race[0].error)assert.ok(race[0].error.message.includes('attendance_conflict'));
  const after=await row(student);assert.equal(after.reviewed,false);assert.ok(after.flags.includes('uncertain_time'));assert.ok(after.flags.includes('delayed_receipt'));
  await deny(teacher.rpc('review_attendance_exception',{...request,p_request_id:randomUUID()}),'attendance_conflict');
  await assert.rejects(transport.send({...first,event_id:randomUUID(),credential_ref:'fictional-unbound-card'}));
  assert.equal((await row(student)).gate_events,3);
  await must(principal.rpc('revoke_student_credential',{p_credential_id:fixture.assignmentId}));
  await assert.rejects(transport.send(mockReaderEvent(enrollment,'revoked',new Date().toISOString())),error=>error instanceof DefinitiveRemoteAttention&&error.receipt.outcome==='unresolved');
  assert.equal((await row(student)).gate_events,3);const overview=await must(principal.rpc('principal_attendance_review',{}));assert.equal(overview.unresolved_card_receipts,1);
  console.log('PASS: meaningful corrections, contradiction, separate scans, delayed/uncertain evidence, stale-review race, invalid binding, revoked/unresolved count without invented identity.');

  // Clearly synthetic bulk fixtures test exact reporting, not reader/attendance workflows.
  const big=await must(admin.from('classes').insert({school_id:fixture.schoolId,grade:'9',division:'BIG',academic_year:'M2-synthetic'}).select('id').single());
  const children=Array.from({length:1002},()=>({id:randomUUID()}));
  await must(admin.from('students').insert(children.map((c,i)=>({id:c.id,school_id:fixture.schoolId,class_id:big.id,roll_number:`B${i}`,full_name:`Synthetic bulk child ${i}`,active:true}))));
  await must(admin.from('attendance_records').insert(children.map(c=>({school_id:fixture.schoolId,class_id:big.id,student_id:c.id,attendance_date:day,status:'present',marked_by:fixture.accounts.teacher.id}))));
  await must(admin.from('classes').insert(Array.from({length:43},(_,i)=>({school_id:fixture.schoolId,grade:'9',division:`P${i}`,academic_year:'M2-pagination'}))));
  const exact=await must(principal.rpc('principal_attendance_review',{p_limit:40}));assert.equal(exact.summary.saved,1004);assert.equal(exact.summary.present,1004);assert.equal(exact.summary.students,1005);assert.equal(exact.summary.classes,46);assert.equal(exact.classes.length,40);assert.equal(exact.has_more,true);
  const last=await must(principal.rpc('principal_attendance_review',{p_after_id:exact.classes.at(-1).id,p_limit:40}));assert.equal(last.classes.length,6);assert.equal(last.has_more,false);assert.equal(new Set([...exact.classes,...last.classes].map(c=>c.id)).size,46);assert.deepEqual(last.summary,exact.summary);
  await deny(principal.rpc('principal_attendance_review',{p_limit:101}));
  await must(admin.from('teacher_class_assignments').insert({class_id:big.id,teacher_id:fixture.accounts.teacher.id}));await deny(teacher.rpc('class_attendance_review',{p_class_id:big.id,p_attendance_date:day}),'attendance_scope_too_large');
  foreignSchool=await must(admin.from('schools').insert({code:`M2-FOREIGN-${randomUUID()}`,name:'Synthetic foreign school'}).select('id').single());
  const email=`m2-foreign-${randomUUID()}@verification.invalid`,password=`Temporary-${randomUUID()}!aA1`;
  const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});if(auth.error)throw Error('Synthetic foreign account failed');foreignUser=auth.data.user.id;
  await must(admin.from('profiles').insert({id:foreignUser,school_id:foreignSchool.id,role:'principal',full_name:'Synthetic foreign Principal',email}));
  const foreign=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});await must(foreign.auth.signInWithPassword({email,password}));
  await deny(foreign.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:day}),'not_authorized');assert.equal((await must(foreign.rpc('principal_attendance_review',{}))).summary.saved,0);
  const principalPage=await login('principal','attendance');await principalPage.locator('#principal-attendance .present b').filter({hasText:'1004'}).waitFor();await capture(principalPage,'principal-exact-large-counts.png');
  if(!await principalPage.getByLabel('Class exception review',{exact:true}).locator(`option[value="${klass}"]`).count())await principalPage.getByRole('button',{name:'More classes',exact:true}).click();
  await principalPage.getByLabel('Class exception review',{exact:true}).selectOption(klass);await principalPage.getByText('Gate and classroom review',{exact:true}).waitFor();
  // Three interface languages; language changes must retain safe form/state.
  for(const language of ['hi','mr','en'])for(const p of [teacherPage,parentPage,principalPage]){await p.locator('.language-selector select').selectOption(language);await p.waitForFunction(value=>document.documentElement.lang===value,language);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(p===teacherPage)await p.getByText(uiText('Gate and classroom review',language),{exact:true}).waitFor();if(p===principalPage)await p.getByText(uiText('Classroom attendance overview',language),{exact:true}).waitFor();}
  await teacherPage.getByRole('button',{name:'Enable offline saving',exact:true}).click();await teacherPage.getByText('Held offline work',{exact:true}).waitFor();await teacherPage.getByText('Operation '+oldId,{exact:false}).waitFor();
  await capture(teacherPage,'teacher-held-work-guidance.png');
  await must(admin.from('students').update({class_id:fixture.classes[1].id}).eq('id',manual.id).eq('school_id',fixture.schoolId));
  assert.equal((await must(parent.rpc('parent_classroom_confirmation',{p_student_id:manual.id}))).available,false);
  assert.ok(!(await review()).rows.some(r=>r.student_id===manual.id),'Former-class roster leaked a transferred child');
  await must(admin.from('students').update({class_id:klass}).eq('id',manual.id).eq('school_id',fixture.schoolId));
  // A SQL-only legacy fixture tests exclusion; it is not called a hardware scan.
  await must(admin.from('school_entry_events').insert({school_id:fixture.schoolId,student_id:fixture.students[1].id,device_id:enrollment.deviceId,device_event_id:randomUUID(),event_type:'check_in',observed_at:new Date().toISOString(),device_sequence:777,sequence_state:'in_order',timestamp_quality:'within_tolerance',credential_version:1}));
  const legacyView=await must(teacher.rpc('class_attendance_review',{p_class_id:fixture.classes[1].id,p_attendance_date:day}));
  const legacyChild=legacyView.rows.find(r=>r.student_id===fixture.students[1].id);assert.equal(legacyChild.legacy_events,1);assert.equal(legacyChild.gate_events,0);assert.deepEqual(legacyChild.flags,[]);
  await deny(teacher.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:shiftSchoolDate(day,1)}),'invalid_attendance_date');
  const token=(await teacher.auth.getSession()).data.session.access_token;await teacher.auth.signOut({scope:'local'});const revoked=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});await deny(revoked.rpc('class_attendance_review',{p_class_id:klass,p_attendance_date:day}),'not_authorized');
  assert.deepEqual(runtimeErrors,[]);writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),exactSaved:1004,classPages:[40,6],runtimeErrors:[],physicalHardware:false},null,2));
  console.log('PASS: exact >1000 totals, complete keyset class traversal, oversized scope fail-closed, school isolation, fresh-session denial, three-role mobile UI/languages.');
} catch(error) {
  for(const [index,page] of (browser?.contexts().flatMap(c=>c.pages())??[]).entries()){await page.screenshot({path:path.join(out,'failure-'+index+'.png'),fullPage:true}).catch(()=>{});writeFileSync(path.join(out,'failure-'+index+'.txt'),await page.locator('body').innerText().catch(()=>'Unavailable'));}
  throw error;
} finally {
  await browser?.close();
  if(foreignSchool){await must(admin.from('profiles').delete().eq('school_id',foreignSchool.id));if(foreignUser){const r=await admin.auth.admin.deleteUser(foreignUser);if(r.error)throw Error('Synthetic foreign account cleanup failed');}await must(admin.from('schools').delete().eq('id',foreignSchool.id));}
  if(fixture){if(fixture.accounts.teacher?.id){const queue=openGatewayDatabase(path.resolve('.local/schovera-rfid-gateway/gateway.sqlite'));try{queue.db.prepare('DELETE FROM school_operations WHERE actor_id=? AND school_id=?').run(fixture.accounts.teacher.id,fixture.schoolId);}finally{queue.close();}}assert.equal(readManualFixture().runId,fixture.runId);await cleanManualFixture();assert.deepEqual(await must(admin.from('attendance_exception_reviews').select('id').eq('school_id',fixture.schoolId)),[]);}
  console.log(`Owned M2 fixture cleaned. Synthetic captures: ${out}`);
}
