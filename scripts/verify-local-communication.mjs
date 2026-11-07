// Synthetic, local-only acceptance for automatic translation and WAV playback.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
assertLocalTestEnvironment();
const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104';
const origin=new URL(base).origin;
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const schools=[],users=[];const password=`Synthetic-${randomUUID()}!aA1`;
let browser;
const captures=mkdtempSync(join(tmpdir(),'schovera-automatic-communication-'));
const must=async query=>{const r=await query;if(r.error)throw Error(r.error.message);return r.data;};
async function account(role,school){
  const email=`${role}-${randomUUID()}@communication.local.test`;
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});if(result.error)throw result.error;
  const id=result.data.user.id;users.push(id);
  await must(admin.from('profiles').insert({id,email,full_name:`Synthetic ${role}`,role,school_id:school,active:true}));
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const session=await must(client.auth.signInWithPassword({email,password}));
  return {id,email,token:session.session.access_token,client};
}
async function request(endpoint,body,token,headers={}){
  return fetch(`${base}/api/communication/${endpoint}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...headers},body:JSON.stringify(body)});
}
function waveEvidence(bytes){
  const b=Buffer.from(bytes);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
  let format,data;
  for(let p=12;p+8<=b.length;){const size=b.readUInt32LE(p+4);const kind=b.toString('ascii',p,p+4);if(kind==='fmt ')format=b.subarray(p+8,p+8+size);if(kind==='data')data=b.subarray(p+8,p+8+size);p+=8+size+(size%2);}
  assert.ok(format&&data?.length>1000);assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(14),16);
  let energy=0;for(let p=0;p+1<data.length;p+=2)energy+=data.readInt16LE(p)**2;
  const rms=Math.sqrt(energy/(data.length/2));assert.ok(rms>10,'Synthesized PCM is silent.');
  return {bytes:b.length,seconds:Math.round(data.length/format.readUInt32LE(8)*10)/10,rms:Math.round(rms)};
}
try{
  for(const label of ['A','B']){const school=await must(admin.from('schools').insert({name:`Synthetic communication ${label}`,code:`COMM-${randomUUID()}`}).select('id').single());schools.push(school.id);}
  const principal=await account('principal',schools[0]);const parent=await account('parent',schools[0]);const other=await account('principal',schools[1]);
  const original={title:'Parent meeting',body:'The parent meeting is on 7 November 2026 at 9 AM. Bring the science book.'};
  const notice=await must(admin.from('announcements').insert({...original,school_id:schools[0],created_by:principal.id}).select('id').single());
  const payload={kind:'announcement',id:notice.id,language:'hi'};
  assert.equal((await request('translate',payload)).status,401);
  assert.equal((await request('translate',payload,parent.token,{Origin:'https://example.invalid'})).status,403);
  assert.equal((await request('translate',payload,parent.token,{Host:'schovera.vercel.app'})).status,404);
  assert.equal((await request('translate',payload,other.token)).status,404);
  assert.equal((await request('translate',{...payload,school_id:schools[0]},parent.token)).status,400);
  assert.equal((await request('translate',payload,parent.token)).status,404,'A parent without a child link must not read school notices.');
  const klass=await must(admin.from('classes').insert({school_id:schools[0],grade:'7',division:'COMM',academic_year:'SYNTHETIC'}).select('id').single());
  const child=await must(admin.from('students').insert({school_id:schools[0],class_id:klass.id,full_name:'Synthetic child',roll_number:'01'}).select('id').single());
  await must(admin.from('parent_student_links').insert({parent_id:parent.id,student_id:child.id,status:'active'}));
  const teacher=await account('teacher',schools[0]);
  await must(admin.from('teacher_class_assignments').insert({teacher_id:teacher.id,class_id:klass.id}));
  const updateId=await must(teacher.client.rpc('send_student_update',{p_class_id:klass.id,p_student_id:child.id,p_category:'general',p_title:original.title,p_message:original.body,p_importance:'normal',p_client_request_id:randomUUID()}));
  const teacherMessage=await request('translate',{kind:'update',id:updateId,language:'en'},parent.token);
  assert.equal(teacherMessage.status,200);assert.equal((await teacherMessage.json()).body,original.body);
  for(const language of ['hi','mr','ko']){
    const response=await request('translate',{...payload,language},parent.token);
    assert.equal(response.status,200,`${language}: ${response.ok?'':await response.text()}`);
    const result=await response.json();
    assert.equal(result.method,'automatic');assert.equal(result.language,language);assert.equal(result.sourceBody,original.body);
    assert.ok(language==='ko'?/[가-힣]/.test(result.body):/[\u0900-\u097f]/u.test(result.body));
    const digits=result.body.replace(/[०-९]/gu,c=>String(c.charCodeAt(0)-0x966));
    assert.ok(digits.includes('7')&&digits.includes('2026')&&digits.includes('9'));
    assert.ok(result.body.includes({hi:'नवंबर',mr:'नोव्हेंबर',ko:'11월'}[language]));
    console.log(`${language}: automatic translation, protected date/time and original identity passed. Fluent-language review remains required.`);
  }
  assert.equal((await request('translate',payload,other.token)).status,404,'Cache must not bypass RLS.');
  await must(admin.from('parent_student_links').delete().eq('parent_id',parent.id).eq('student_id',child.id));
  assert.equal((await request('translate',payload,parent.token)).status,404,'Cached translation must not survive loss of source access.');
  assert.equal((await request('translate',{kind:'update',id:updateId,language:'en'},parent.token)).status,404,'An unlinked parent must not translate a student update.');
  await must(admin.from('parent_student_links').insert({parent_id:parent.id,student_id:child.id,status:'active'}));
  const samples={en:'School notices can be read aloud.',hi:'नमस्ते। स्कूल की सूचना पढ़ी जा रही है।',mr:'नमस्कार. शाळेची सूचना वाचली जात आहे.',ko:'안녕하세요. 학교 알림을 읽어 드립니다.'};
  for(const [language,text]of Object.entries(samples)){
    const response=await request('speech',{text,language},parent.token);assert.equal(response.status,200,`${language} audio unavailable`);
    console.log(`${language}: real local WAV ${JSON.stringify(waveEvidence(await response.arrayBuffer()))}`);
  }
  assert.equal((await request('speech',{text:'An English notice',language:'ko'},parent.token)).status,400);
  assert.equal((await request('speech',{text:samples.en,language:'en'})).status,401);
  browser=await chromium.launch({channel:'chrome',headless:false});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(45000);
  const external=[];
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return route.continue();external.push(u.hostname);return route.abort();});
  await page.addInitScript(()=>{
    const NativeAudio=window.Audio;
    window.Audio=function(...args){const audio=new NativeAudio(...args);window.__lastLocalAudio=audio;return audio;};
    window.Audio.prototype=NativeAudio.prototype;
  });
  await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(parent.email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in securely',exact:true}).click();await page.locator('.role-parent').waitFor();
  await page.goto(`${base}/parent/notices`);
  const view=page.locator('.notice-language-view').first();await view.getByText(original.title,{exact:true}).waitFor();
  assert.equal(await view.locator('.parent-speech-language').count(),0,'English original should need only one language selector.');
  for(const language of ['hi','mr','ko']){
    await view.locator('.notice-language-toolbar > label select').selectOption(language);
    await view.getByText('Automatic translation — may contain mistakes. View the original to check.',{exact:true}).waitFor({timeout:150000});
    assert.equal(await view.locator('.notice-visible-text').getAttribute('lang'),language);
    await view.getByRole('button',{name:'Listen to notice',exact:true}).click();
    await view.getByRole('button',{name:'Pause',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__lastLocalAudio?.currentTime>.2&&!window.__lastLocalAudio.paused);
    assert.equal(await page.evaluate(()=>window.__lastLocalAudio.muted),false);
    await view.getByRole('button',{name:'Pause',exact:true}).click();assert.equal(await page.evaluate(()=>window.__lastLocalAudio.paused),true);
    await view.getByRole('button',{name:'Resume',exact:true}).click();
    await page.waitForFunction(()=>!window.__lastLocalAudio.paused);
    await view.getByRole('button',{name:'Stop',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__lastLocalAudio.paused),true);
    if(language==='ko')await view.screenshot({path:join(captures,'parent-korean.png')});
    console.log(`${language}: real browser media advanced, unmuted; Pause/Resume/Stop passed at 390px.`);
  }
  await view.getByRole('button',{name:'View original',exact:true}).click();await view.getByText(original.body,{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(external,[]);
  await page.screenshot({path:join(captures,'parent-original-mobile.png'),fullPage:true});
  assert.deepEqual(await must(admin.from('announcements').select('title,body').eq('id',notice.id).single()),original);
  assert.equal((await must(admin.from('student_updates').select('message').eq('id',updateId).single())).message,original.body);
  const staff=await browser.newPage();staff.setDefaultTimeout(45000);
  await staff.goto(base);await staff.getByLabel('Email',{exact:true}).fill(teacher.email);await staff.getByLabel('Password',{exact:true}).fill(password);
  await staff.getByRole('button',{name:'Sign in securely',exact:true}).click();await staff.locator('.role-teacher').waitFor();
  await staff.goto(`${base}/teacher/students`);
  await staff.getByRole('button',{name:/Synthetic child/}).first().click();
  await staff.getByText(original.body,{exact:true}).waitFor();
  assert.equal(await staff.locator('.translation-manager').count(),0,'Teacher must not need a manual translation form.');
  await browser.close();browser=null;
  console.log('Single language choice, original preservation, real audio and role/tenant denial passed.');
  console.log(`Synthetic UI captures: ${captures}`);
}finally{
  await browser?.close();
  if(schools.length){await must(admin.from('announcements').delete().in('school_id',schools));await must(admin.from('audit_events').delete().in('school_id',schools));await must(admin.from('student_updates').delete().in('school_id',schools));if(users.length){await must(admin.from('parent_student_links').delete().in('parent_id',users));await must(admin.from('teacher_class_assignments').delete().in('teacher_id',users));}await must(admin.from('students').delete().in('school_id',schools));await must(admin.from('classes').delete().in('school_id',schools));await must(admin.from('profiles').delete().in('school_id',schools));}
  for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw r.error;}
  if(schools.length){await must(admin.from('schools').delete().in('id',schools));assert.equal((await must(admin.from('schools').select('id').in('id',schools))).length,0);}
  console.log('Synthetic communication fixtures cleaned.');
}
