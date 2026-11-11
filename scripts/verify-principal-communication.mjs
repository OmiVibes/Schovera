// Local-only AUD-01 acceptance. Own synthetic schools/users, independent SQL
// oracle, bounded inserts and explicit cleanup. Never reads production env files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { parsePrincipalCommunication } from '../src/lib/principal-communication.ts';

assertLocalTestEnvironment();
assert.equal(existsSync('.env.local'), false, 'Use isolated QA without private env files');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const base=process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3104';
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const actorClient=()=>createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
const run=randomUUID(), password=`Synthetic-${randomUUID()}!aA1`;
const schools=[], users=[], rows=[], acknowledgements=new Set(), evidence=[];
let browser;
const output=`.local/schovera-manual-demo/aud01-${run}`;mkdirSync(output,{recursive:true});
const must=async q=>{const r=await q;if(r.error)throw Error(`Synthetic AUD-01 operation failed (${r.error.code || 'unknown'})`);return r.data;};
const journal=()=>writeFileSync(`${output}/fixture.json`,JSON.stringify({mode:'synthetic-aud01',run,schools,users},null,2));
async function school(label){const s=await must(admin.from('schools').insert({name:`Synthetic AUD-01 ${label}`,code:`AUD01-${label}-${run}`}).select('id').single());schools.push(s.id);journal();return s.id;}
async function actor(role,schoolId,active=true){const email=`${role}-${randomUUID()}@principal-metrics.local.test`;
 const auth=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));const id=auth.user.id;users.push(id);journal();
 await must(admin.from('profiles').insert({id,email,full_name:`Synthetic ${role}`,role,school_id:schoolId,active}));
 const client=actorClient();await must(client.auth.signInWithPassword({email,password}));return{id,email,client};}
function oracle(){const corrected=new Set(rows.map(r=>r.corrects_update_id).filter(Boolean));const effective=rows.filter(r=>!corrected.has(r.id));const important=effective.filter(r=>r.importance==='important');const ack=important.filter(r=>acknowledgements.has(r.id)).length;
 return{total_count:rows.length,effective_count:effective.length,important_count:important.length,acknowledged_count:ack,awaiting_count:important.length-ack,coverage:important.length?Math.round(100*ack/important.length):null};}
function sqlOracle(schoolId){assert.match(schoolId,/^[0-9a-f-]{36}$/);
 // Different formulation: group one row per update after joining acknowledgements,
 // then anti-join superseded IDs. Executes directly in PostgreSQL, not PostgREST.
 const sql=`with counts as (select u.id,u.importance,count(a.id)>0 as ack from public.student_updates u left join public.acknowledgements a on a.update_id=u.id where u.school_id='${schoolId}' group by u.id), active as (select c.* from counts c left join public.student_updates newer on newer.corrects_update_id=c.id where newer.id is null), totals as (select (select count(*) from counts) as total_count,count(*) as effective_count,count(*) filter(where importance='important') as important_count,count(*) filter(where importance='important' and ack) as acknowledged_count,count(*) filter(where importance='important' and not ack) as awaiting_count from active) select row_to_json(t) from (select *,case when important_count=0 then null else round(acknowledged_count*100.0/important_count)::integer end as coverage from totals) t;`;
 return JSON.parse(execFileSync('docker',['exec','supabase_db_Schovera','psql','-U','postgres','-d','postgres','-tAc',sql],{encoding:'utf8',windowsHide:true,timeout:15000}).trim());}
async function page(actor,filter='all',cursor=null,limit=40){return must(actor.client.rpc('principal_communication_page',{p_filter:filter,p_limit:limit,p_before_sent_at:cursor?.sent_at??null,p_before_id:cursor?.id??null}));}
async function compare(principal,schoolId,label){const start=performance.now();const data=await page(principal);const rpcMs=Math.round(performance.now()-start);parsePrincipalCommunication(data,schoolId);const expected=oracle();assert.deepEqual(data.summary,expected);assert.deepEqual(data.summary,sqlOracle(schoolId));assert.ok(data.updates.length<=40);evidence.push({label,expected,actual:data.summary,rpcMs});console.log(`${label}: ${JSON.stringify(data.summary)}; bounded feed ${data.updates.length}`);return data;}
async function login(account){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());const p=await context.newPage();p.setDefaultTimeout(25000);await p.goto(base);await p.getByLabel('Email',{exact:true}).fill(account.email);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.locator('.role-principal').waitFor();return{context,p};}
async function uiCounts(p,expected){await p.waitForFunction(s=>{
 const val=cls=>document.querySelector(`.principal-metric-card.${cls} b`)?.textContent;
 const cover=document.querySelector('.communication-coverage b')?.textContent??null;
 return document.querySelector('#principal-communication')?.getAttribute('aria-busy')==='false'&&val('metric-important')===String(s.important_count)&&val('metric-acknowledged')===String(s.acknowledged_count)&&val('metric-awaiting')===String(s.awaiting_count)&&cover===(s.coverage===null?null:`${s.coverage}%`);
},expected);}
try{
 const a=await school('A'),b=await school('B');const principal=await actor('principal',a),foreign=await actor('principal',b),teacher=await actor('teacher',a),parent=await actor('parent',a),parent2=await actor('parent',a),inactive=await actor('principal',a,false);
 const klass=await must(admin.from('classes').insert({school_id:a,grade:'7',division:'AUD01',academic_year:'SYNTHETIC'}).select('id').single());
 const student=await must(admin.from('students').insert({school_id:a,class_id:klass.id,full_name:'Synthetic audit child',roll_number:'01'}).select('id').single());
 await must(admin.from('teacher_class_assignments').insert({teacher_id:teacher.id,class_id:klass.id}));await must(admin.from('parent_student_links').insert([parent,parent2].map(p=>({parent_id:p.id,student_id:student.id,status:'active'}))));
 for(const forbidden of [parent,teacher,inactive])assert.ok((await forbidden.client.rpc('principal_communication_page')).error,'Non-active-Principal must be denied');
 assert.ok((await actorClient().rpc('principal_communication_page')).error,'Anonymous must be denied');
 assert.ok((await principal.client.rpc('principal_communication_page',{p_school_id:b})).error,'School injection must be rejected');
 for(const args of [{p_filter:'invalid'},{p_limit:0},{p_limit:101},{p_before_id:randomUUID()}])assert.ok((await principal.client.rpc('principal_communication_page',args)).error);
 browser=await chromium.launch({headless:true});const view=await login(principal);
 for(const size of [0,1,999,1000,1001,1002,2005]){
  const added=[];while(rows.length<size){const index=rows.length;const row={id:randomUUID(),school_id:a,class_id:klass.id,student_id:student.id,teacher_id:teacher.id,category:'general',importance:index<1002||index%3?'important':'normal',title:`Synthetic update ${index}`,message:'Synthetic AUD-01 body. No personal data.',sent_at:index?'2026-01-01T09:00:00.123456Z':'2025-12-31T09:00:00.123456Z'};rows.push(row);added.push(row);}
  for(let i=0;i<added.length;i+=100)await must(admin.from('student_updates').insert(added.slice(i,i+100)));
  await compare(principal,a,`size-${size}`);await view.p.goto(`${base}/principal/home`);await uiCounts(view.p,oracle());
  await view.p.goto(`${base}/principal/communication`);await uiCounts(view.p,oracle());
  if(size===1002){const old=await must(principal.client.from('student_updates').select('id').eq('school_id',a));assert.equal(old.length,1000);evidence.push({label:'AUD-01 before/after',expected:1002,oldCappedRows:old.length,newDisplayedImportant:1002});await view.p.screenshot({path:`${output}/1002-communication.png`,fullPage:true});}
 }
 const ackRows=rows.filter((_,i)=>i%2===0).map(r=>({update_id:r.id,parent_id:parent.id}));for(let i=0;i<ackRows.length;i+=100)await must(admin.from('acknowledgements').insert(ackRows.slice(i,i+100)));for(const r of ackRows)acknowledgements.add(r.update_id);
 await must(admin.from('acknowledgements').insert({update_id:rows[0].id,parent_id:parent2.id}));
 const original=rows[0];const correctedId=await must(teacher.client.rpc('send_student_update_correction',{p_original_update_id:original.id,p_title:'Synthetic correction one',p_message:'Synthetic corrected body one.'}));
 rows.push(await must(admin.from('student_updates').select('*').eq('id',correctedId).single()));
 const latestId=await must(teacher.client.rpc('send_student_update_correction',{p_original_update_id:correctedId,p_title:'Synthetic correction two',p_message:'Synthetic corrected body two.'}));rows.push(await must(admin.from('student_updates').select('*').eq('id',latestId).single()));
 const mixed=await compare(principal,a,'mixed-acks-correction-chain');assert.equal(mixed.updates.some(r=>r.id===original.id),false,'Original is deliberately outside the visible page');assert.equal(mixed.updates.find(r=>r.id===correctedId).is_corrected,true);assert.equal(mixed.updates.find(r=>r.id===correctedId).correction_title,original.title);
 const previous=oracle();
 for(const action of ['save','submit','approve']){
  const translation=await must(principal.client.from('communication_translations').select('updated_at').eq('student_update_id',latestId).eq('language','hi').maybeSingle());
  await must(principal.client.rpc('manage_communication_translation',{p_source_kind:'update',p_source_id:latestId,p_language:'hi',p_action:action,p_expected_title:'Synthetic correction two',p_expected_body:'Synthetic corrected body two.',p_title:'Synthetic reviewed title',p_body:'Synthetic reviewed body.',p_expected_updated_at:translation?.updated_at??null}));
  const translated=await page(principal);assert.deepEqual(translated.summary,previous);console.log(`Translation ${action}: metrics unchanged.`);
 }
 assert.equal((await must(parent.client.from('communication_translations').select('status').eq('student_update_id',latestId))).at(0).status,'approved');
 assert.ok((await parent.client.rpc('manage_communication_translation',{p_source_kind:'update',p_source_id:latestId,p_language:'hi',p_action:'approve',p_expected_title:'Synthetic correction two',p_expected_body:'Synthetic corrected body two.'})).error);
 // Full keyset traversal verifies timestamp ties, boundaries, historical rows and correction metadata.
 const ids=new Set();let cursor=null;let more=true;while(more){const result=await page(principal,'all',cursor,100);for(const u of result.updates){assert.equal(ids.has(u.id),false);ids.add(u.id);}more=result.has_more;cursor=result.updates.at(-1);assert.ok(ids.size<=rows.length);}
 assert.equal(ids.size,rows.length);
 const waiting=await page(principal,'awaiting');assert.ok(waiting.updates.every(r=>r.importance==='important'&&!r.is_corrected&&!r.acknowledgements.length));assert.deepEqual(waiting.summary,oracle());
 const foreignRow={id:randomUUID(),school_id:b,class_id:(await must(admin.from('classes').insert({school_id:b,grade:'8',division:'B',academic_year:'SYNTHETIC'}).select('id').single())).id};
 const foreignTeacher=await actor('teacher',b);const foreignStudent=await must(admin.from('students').insert({school_id:b,class_id:foreignRow.class_id,full_name:'Synthetic foreign child',roll_number:'01'}).select('id').single());
 await must(admin.from('student_updates').insert({...foreignRow,teacher_id:foreignTeacher.id,student_id:foreignStudent.id,category:'general',importance:'important',title:'Synthetic foreign update',message:'Must not enter other school statistics.'}));
 assert.equal((await page(foreign)).summary.important_count,1);await compare(principal,a,'cross-school-isolation');assert.equal((await page(foreign)).updates[0].id,foreignRow.id);
 assert.equal((await must(parent.client.from('student_updates').select('id').eq('id',foreignRow.id))).length,0);
 assert.equal((await must(teacher.client.from('student_updates').select('id').eq('id',foreignRow.id))).length,0);
 await view.p.goto(`${base}/principal/communication`);await uiCounts(view.p,oracle());await view.p.waitForFunction(()=>document.querySelectorAll('.principal-communication-card').length===40);assert.equal(await view.p.locator('.principal-communication-card').count(),40);await view.p.getByRole('button',{name:'Load more',exact:true}).click();await view.p.waitForFunction(()=>document.querySelectorAll('.principal-communication-card').length===80);await uiCounts(view.p,oracle());
 await view.p.getByRole('button',{name:/^Awaiting \d/}).click();await uiCounts(view.p,oracle());assert.equal(await view.p.locator('.principal-communication-card .principal-acknowledgement.acknowledged').count(),0);
 await view.context.setOffline(true);const newId=await must(teacher.client.rpc('send_student_update',{p_class_id:klass.id,p_student_id:student.id,p_category:'general',p_title:'Synthetic missed update',p_message:'Synthetic refresh after reconnect.',p_importance:'important',p_client_request_id:randomUUID()}));rows.push(await must(admin.from('student_updates').select('*').eq('id',newId).single()));
 await view.p.locator('#principal-recent-communication').getByRole('button',{name:'Refresh',exact:true}).click();await view.p.waitForFunction(()=>document.querySelector('.metric-important b')?.textContent==='—');
 await view.context.setOffline(false);await view.p.evaluate(()=>window.dispatchEvent(new Event('online')));await uiCounts(view.p,oracle());
 await view.p.goto(`${base}/principal/home`);await uiCounts(view.p,oracle());
 await view.p.route('**/rest/v1/rpc/principal_communication_page',r=>r.abort());await view.p.reload();await view.p.getByRole('alert').filter({hasText:'Recent communication could not be loaded.'}).waitFor();assert.equal(await view.p.locator('.metric-important b').innerText(),'—');await view.p.unroute('**/rest/v1/rpc/principal_communication_page');await view.p.locator('#principal-recent-communication').getByRole('button',{name:'Refresh',exact:true}).click();await uiCounts(view.p,oracle());
 await view.p.setViewportSize({width:390,height:844});assert.ok(await view.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await view.p.screenshot({path:`${output}/mixed-home-mobile.png`,fullPage:true});
 console.log('AUD-01 PASS: all size boundaries, SQL/JS/UI agreement, mixed acknowledgements, correction chains, translation states, keyset traversal, tenant/role denial, refresh/reconnect/error recovery and 390px.');
}catch(error){console.error(`AUD-01 assertion failed: ${error.message}`);throw error;}finally{
 await browser?.close();
 for(const schoolId of schools){
  // School IDs are generated by this run; no whole-database cleanup or seed reset.
  await must(admin.from('communication_translations').delete().eq('school_id',schoolId));
  for(;;){const updates=await must(admin.from('student_updates').select('id,corrects_update_id').eq('school_id',schoolId).order('sent_at',{ascending:false}).limit(100));if(!updates.length)break;const ids=updates.map(u=>u.id);await must(admin.from('acknowledgements').delete().in('update_id',ids));
   // Delete descendants first, including correction chains that cross a page.
   const originals=new Set(updates.map(u=>u.corrects_update_id).filter(Boolean));const leaves=updates.filter(u=>!originals.has(u.id));assert.ok(leaves.length);await must(admin.from('student_updates').delete().in('id',leaves.map(u=>u.id)));
  }
  await must(admin.from('audit_events').delete().eq('school_id',schoolId));
  await must(admin.from('parent_student_links').delete().in('parent_id',users));await must(admin.from('teacher_class_assignments').delete().in('teacher_id',users));
  for(const table of ['students','classes','profiles'])await must(admin.from(table).delete().eq('school_id',schoolId));await must(admin.from('schools').delete().eq('id',schoolId));
 }
 for(const id of users)await must(admin.auth.admin.deleteUser(id));
 for(const id of schools)assert.equal((await must(admin.from('schools').select('id').eq('id',id))).length,0);
 writeFileSync(`${output}/results.json`,JSON.stringify({run,at:new Date().toISOString(),evidence,cleanupVerified:true},null,2));console.log(`Owned AUD-01 schools/users cleaned and verified. Evidence: ${output}`);
}
