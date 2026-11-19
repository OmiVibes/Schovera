// Owned synthetic role audit; never run from the developer/private-env checkout.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
import {prepareManualFixture,cleanManualFixture,readManualFixture,actorClient} from './manual-demo.mjs';
import {uiText} from '../src/lib/ui-copy.ts';
assertLocalTestEnvironment();
const roomsOnly=process.argv.length===3&&process.argv[2]==='--rooms-only';
assert.ok(process.argv.length===2||roomsOnly,'Unknown argument');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const out=path.resolve('.local','role-audit-'+randomUUID());mkdirSync(out,{recursive:true});
let fixture,extraUser,browser;const record={passed:false,checks:[]};
const check=label=>{record.checks.push(label);console.log('PASS: '+label);};
try{
 fixture=await prepareManualFixture({onCreated:f=>fixture=f});
 const principal=await actorClient(fixture.accounts.principal),teacher=await actorClient(fixture.accounts.teacher),parent=await actorClient(fixture.accounts.parent);
 const password='Temporary-'+randomUUID()+'!aA1',email='room-teacher-'+randomUUID()+'@manual.local.test';
 const created=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));extraUser=created.user.id;
 await must(admin.from('profiles').insert({id:extraUser,school_id:fixture.schoolId,email,full_name:'Synthetic timetable teacher',role:'teacher',active:true}));
 await must(admin.from('teacher_class_assignments').insert({teacher_id:extraUser,class_id:fixture.classes[1].id}));
 const base={p_entry_id:null,p_class_id:fixture.classes[0].id,p_teacher_id:fixture.accounts.teacher.id,p_weekday:3,p_period_number:19,p_subject:'Synthetic room check',p_start_time:'16:00',p_end_time:'17:00',p_room:'Shared audit room',p_client_request_id:randomUUID()};
 const first=await must(principal.rpc('save_timetable_entry',base));
 const unassigned=await actorClient(fixture.accounts.unassignedTeacher);
 for(const actor of [unassigned,parent])for(const room of [base.p_room,'Unused audit room']){
  const raw=await actor.from('timetable_entries').insert({school_id:fixture.schoolId,class_id:base.p_class_id,teacher_id:base.p_teacher_id,weekday:3,period_number:18,subject:'Denied raw write',start_time:'16:00',end_time:'17:00',room,created_by:fixture.accounts.unassignedTeacher.id,client_request_id:randomUUID()});
  assert.equal(raw.error?.message,'not authorized','Raw writes must not reveal whether a room is occupied');
 }
 const other={...base,p_class_id:fixture.classes[1].id,p_teacher_id:extraUser,p_client_request_id:randomUUID(),p_room:'  SHARED AUDIT ROOM  '};
 assert.ok((await teacher.rpc('save_timetable_entry',other)).error,'Ordinary Teacher cannot publish');
 assert.ok((await parent.rpc('save_timetable_entry',other)).error,'Parent cannot publish');
 const collision=await principal.rpc('save_timetable_entry',other);assert.ok(collision.error&&/room has a timetable conflict/.test(collision.error.message),'Same-room overlap between different Teachers/classes must be rejected');
 const separate=await must(principal.rpc('save_timetable_entry',{...other,p_room:'Other audit room'}));
 const before=await must(principal.from('timetable_entries').select('*').eq('id',separate).single());
 const moved=await principal.rpc('save_timetable_entry',{...other,p_entry_id:separate,p_client_request_id:null,p_expected_updated_at:before.updated_at});assert.ok(moved.error&&/room has a timetable conflict/.test(moved.error.message));
 assert.equal((await must(principal.from('timetable_entries').select('room').eq('id',separate).single())).room,'Other audit room');
 await must(principal.rpc('delete_timetable_entry',{p_entry_id:separate}));
 await must(principal.rpc('save_timetable_entry',{...other,p_start_time:'17:00',p_end_time:'18:00',p_client_request_id:randomUUID()}));
 const concurrent=await Promise.all([base,other].map(p=>principal.rpc('save_timetable_entry',{...p,p_start_time:'18:00',p_end_time:'19:00',p_period_number:20,p_room:'Concurrent audit room',p_client_request_id:randomUUID()})));
 assert.equal(concurrent.filter(r=>!r.error).length,1);assert.equal(concurrent.filter(r=>r.error&&/room has a timetable conflict/.test(r.error.message)).length,1);
 assert.equal((await must(teacher.from('timetable_entries').select('id').eq('id',first))).length,1);
 assert.equal((await must(parent.from('timetable_entries').select('id').eq('id',first))).length,1);
 check('Different Teacher/class room collisions and moves refused; adjacent periods allowed; concurrent room collision serialized; ordinary Teacher/Parent writes denied; published read preserved');
 if(!roomsOnly){
  const oracle=await principal.from('profiles').select('id',{count:'exact',head:true}).eq('school_id',fixture.schoolId).eq('role','teacher').eq('active',true);
  const teacherCount=Object.values(fixture.accounts).filter(a=>a.role==='teacher').length+1;
  assert.equal(oracle.error,null);assert.equal(oracle.count,teacherCount);record.teacherOracle=oracle.count;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const baseUrl=process.env.SCHOVERA_TEST_URL;const contexts=[];
  for(const role of ['principal','teacher','parent']){
   const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
   await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('response',response=>{if(response.request().method()==='HEAD')record.headReads=[...(record.headReads??[]),{table:new URL(response.url()).pathname.split('/').at(-1),status:response.status(),range:response.headers()['content-range']}].slice(-20);});
   await page.goto(baseUrl);
   await page.getByLabel('Email',{exact:true}).fill(fixture.accounts[role].email);await page.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await page.getByRole('button',{name:'Sign in securely',exact:true}).click();await page.locator('.role-'+role).waitFor();
   if(role==='principal'){
    await page.getByTestId('school-active-students').getByText('2',{exact:true}).waitFor();await page.getByTestId('school-active-teachers').getByText(String(teacherCount),{exact:true}).waitFor();
    await page.getByTestId('school-finalized-registers').getByText('0',{exact:true}).waitFor();
    assert.equal(await page.locator('#principal-notices form').count(),0,'Home notice preview must not duplicate composer');
    assert.ok(await page.locator('.school-notice-preview li').count()<=3,'Notice preview stays bounded');
    await page.route('**/rest/v1/profiles*',r=>r.abort());await page.getByRole('button',{name:'Refresh overview',exact:true}).click();await page.getByText('School counts could not be loaded. Refresh when connected.',{exact:true}).waitFor();assert.equal(await page.getByTestId('school-active-teachers').innerText(),'—');await page.unroute('**/rest/v1/profiles*');await page.getByRole('button',{name:'Refresh overview',exact:true}).click();await page.getByTestId('school-active-teachers').getByText(String(teacherCount),{exact:true}).waitFor();
    for(const language of ['en','hi','mr']){await page.locator('.language-selector select').selectOption(language);await page.getByRole('heading',{name:uiText('School overview',language),exact:true}).waitFor();assert.equal(await page.getByTestId('school-active-teachers').innerText(),String(teacherCount));}
    await page.locator('.language-selector select').selectOption('en');
    await page.getByRole('link',{name:'Review attendance and exceptions',exact:false}).click();await page.locator('#principal-attendance').getByRole('heading',{name:'Classroom attendance overview',exact:true}).waitFor();await page.goBack();
    await page.getByRole('link',{name:'View school notices',exact:false}).click();await page.locator('#notice-publish-heading').waitFor();await page.goBack();
    await page.goto(baseUrl+'/principal/timetable');await page.getByText('You are acting as timetable administrator. Saved changes are published immediately.',{exact:true}).waitFor();
   }else if(role==='teacher'){
    await page.goto(baseUrl+'/teacher/timetable');for(const language of ['en','hi','mr']){await page.locator('.language-selector select').selectOption(language);await page.getByText(uiText('Propose your own periods for this class. Only Principal approval publishes a change.',language),{exact:true}).waitFor();}await page.getByText('Synthetic room check',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Add period',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:uiText('Submit proposal','mr'),exact:true}).count(),1);
   }else{await page.goto(baseUrl+'/parent/timetable');await page.locator('#parent-timetable').waitFor();await page.getByText('Synthetic room check',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Add period',exact:true}).count(),0);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,role+'.png'),fullPage:true});
  }
  check('Three mobile portals: exact Principal head counts/current attendance, unavailable-count recovery, notice preview without composer, truthful timetable ownership, Teacher proposal controls and published-only Parent view');
 }
 record.passed=true;
}finally{
 await browser?.close();
 if(extraUser){await must(admin.from('teacher_class_assignments').delete().eq('teacher_id',extraUser));await must(admin.from('timetable_entries').delete().eq('teacher_id',extraUser));await must(admin.from('profiles').delete().eq('id',extraUser));await must(admin.auth.admin.deleteUser(extraUser));}
 if(fixture){assert.equal(readManualFixture().runId,fixture.runId);await cleanManualFixture();assert.equal((await must(admin.from('schools').select('id').eq('id',fixture.schoolId))).length,0);}
 writeFileSync(path.join(out,'results.json'),JSON.stringify({...record,finished:new Date().toISOString(),ownedCleanupVerified:true},null,2));console.log('Role audit evidence: '+out);
}
