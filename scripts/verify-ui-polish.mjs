import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
import {prepareUiFixture,cleanUiFixture,uiActor} from './lib/ui-polish-fixture.mjs';
import {selectTeacherStudent} from './lib/navigate-portal.mjs';
assertLocalTestEnvironment();
const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104';
const output=`.local/ui-polish-${Date.now()}`;mkdirSync(output,{recursive:true});
const result={rosters:[],history:[],localized:[],errors:[],external:[],screenshots:[]};let fixture,browser,activePage;
const until=async(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:20000});
async function shot(page,name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled',style:'.application-shell{position:relative!important;top:auto!important} nextjs-portal{display:none!important}'});result.screenshots.push(name+'.png');}
async function login(role){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.route('**/*',r=>{const u=new URL(r.request().url());if(['data:','blob:'].includes(u.protocol)||['127.0.0.1','localhost','[::1]'].includes(u.hostname))return r.continue();result.external.push(u.hostname);return r.abort();});const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>result.errors.push(e.message));await p.goto(base);await p.getByLabel('Email',{exact:true}).fill(fixture.accounts[role].email);await p.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.locator(`.role-${role}`).waitFor();return p;}
try{
 fixture=await prepareUiFixture({stress:true,onCreated:f=>fixture=f});browser=await chromium.launch();
 const teacher=await login('teacher'),actor=await uiActor(fixture,'teacher');activePage=teacher;
 for(const klass of fixture.classes){
  await teacher.goto(`${base}/teacher/attendance`);await teacher.getByRole('button',{name:`Grade 7-${klass.division}`,exact:true}).click();
  await until(teacher,count=>document.querySelectorAll('.teacher-attendance-register .roster-row').length===count,klass.count);
  assert.equal(await teacher.locator('#teacher-attendance-history').getAttribute('open'),null);
  assert.equal(await teacher.locator('#teacher-attendance-insights').getAttribute('open'),null);
  for(const width of [320,390,768,1440]){
   await teacher.setViewportSize({width,height:width<768?844:1000});
   const m=await teacher.evaluate(()=>{const list=document.querySelector('.teacher-attendance-register .roster'),save=document.querySelector('.attendance-save-area'),h=document.documentElement;return {height:h.scrollHeight,width:h.scrollWidth,viewport:innerWidth,listHeight:list.clientHeight,listScroll:list.scrollHeight,saveTop:save.getBoundingClientRect().top+scrollY};});
   result.rosters.push({count:klass.count,width,...m});
   assert.ok(m.width<=width+1,`Register overflow at ${width}`);assert.ok(m.listHeight<=522,'Register must remain bounded');assert.ok(m.height<2400,'Primary attendance page grew with the full roster');
   const region=teacher.getByRole('region',{name:'Attendance register students',exact:true});await region.focus();await teacher.keyboard.press('End');
   if(m.listScroll>m.listHeight+1)assert.ok(await region.evaluate(el=>el.scrollTop>0),'Keyboard cannot scroll the register');
   assert.equal(await teacher.locator('.attendance-save-area button').isVisible(),true);
   const controls=await teacher.locator('.attendance-choice').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize)})));
   assert.ok(controls.every(c=>c.height>=44&&c.width>=44&&c.font>=14),'Attendance controls lost readable touch targets');
   if([390,1440].includes(width))await shot(teacher,`attendance-${klass.count}-${width}`);
  }
  await teacher.setViewportSize({width:390,height:844});const first=fixture.students.find(s=>s.class_id===klass.id),last=fixture.students.filter(s=>s.class_id===klass.id).at(-1);
  const search=teacher.getByLabel('Find a student in this register',{exact:true});
  if(klass.count>10){await search.fill(first.full_name);await until(teacher,()=>document.querySelectorAll('.roster-row').length===1);}
  await teacher.locator('.roster-row').filter({hasText:first.full_name}).getByRole('button',{name:'Absent',exact:true}).click();
  if(klass.count>10)await search.fill(last.full_name);
  await teacher.locator('.roster-row').filter({hasText:last.full_name}).getByRole('button',{name:'Late',exact:true}).click();
  if(klass.count>10)await search.fill('');
  await teacher.locator('.attendance-save-area button').click();
  await until(teacher,()=>document.querySelector('.teacher-attendance-register')?.textContent.includes('Attendance saved'));
  const saved=await actor.from('attendance_records').select('student_id,status').eq('class_id',klass.id).eq('attendance_date',fixture.date);assert.equal(saved.error,null);assert.equal(saved.data.length,klass.count);assert.equal(saved.data.find(r=>r.student_id===first.id).status,'absent');assert.equal(saved.data.find(r=>r.student_id===last.id).status,'late');
  assert.equal(saved.data.filter(r=>r.status==='present').length,klass.count-2);
  if(klass.count>10){await search.fill('no-matching-synthetic-learner');assert.equal(await teacher.locator('.roster-row').count(),0);if(klass===fixture.classes.at(-1))await search.fill('');}
 }
 // Analytics remain usable, but they are not part of the default marking task.
 await teacher.locator('#teacher-attendance-history > summary').click();await teacher.locator('.attendance-trends[data-loaded=true]').waitFor();await shot(teacher,'attendance-history-expanded');
 await teacher.locator('#teacher-attendance-history > summary').click();await teacher.locator('#teacher-attendance-insights > summary').click();await teacher.locator('.attendance-insights').waitFor();await shot(teacher,'attendance-insights-expanded');
 await teacher.goto(`${base}/teacher/students`);await teacher.getByRole('button',{name:'Grade 7-A',exact:true}).click();await selectTeacherStudent(teacher,fixture.students[0].full_name);await teacher.locator('#teacher-update-form').waitFor();
 await until(teacher,()=>document.querySelectorAll('.teacher-task-panel .teacher-update-card').length===3);
 assert.equal(await teacher.locator('#teacher-roster-browser').isVisible(),false);
 await teacher.setViewportSize({width:1440,height:1000});await teacher.locator('#teacher-update-form input[name=title]').fill('Unsaved synthetic rehearsal draft');await selectTeacherStudent(teacher,fixture.students[0].full_name);assert.equal(await teacher.locator('#teacher-update-form input[name=title]').inputValue(),'Unsaved synthetic rehearsal draft');assert.equal(await teacher.locator('.teacher-update-card').count(),3);await teacher.locator('#teacher-update-form input[name=title]').fill('');await teacher.setViewportSize({width:390,height:844});
 const initialHeight=await teacher.evaluate(()=>document.documentElement.scrollHeight);assert.ok(initialHeight<4800,'Initial history is still unbounded');
 await teacher.getByRole('link',{name:'Send an update',exact:true}).click();const formTop=await teacher.locator('#teacher-update-form').evaluate(el=>el.getBoundingClientRect().top);assert.ok(formTop>=0&&formTop<650,'Composer jump does not reach the form below the header');await shot(teacher,'students-mobile-default');
 await teacher.getByRole('button',{name:'Browse student list',exact:true}).click();assert.equal(await teacher.locator('#teacher-roster-browser').isVisible(),true);await teacher.getByRole('button',{name:'Close student list',exact:true}).click();
 const more=teacher.getByRole('button',{name:/View more updates/});while(await more.count())await more.click();assert.equal(await teacher.locator('.teacher-update-card').count(),32);
 result.history.push({initialCards:3,totalCards:32,initialHeight,expandedHeight:await teacher.evaluate(()=>document.documentElement.scrollHeight)});await shot(teacher,'students-history-expanded');
 await teacher.locator('.teacher-update-card').last().getByRole('button',{name:'Send correction',exact:true}).click();assert.equal(await teacher.locator('#teacher-update-form input[name=title]').inputValue(),`Rehearsal ${fixture.date} · note 1`);await shot(teacher,'students-older-correction');
 // A new selection resets the visible history without leaking the prior student's records.
 await selectTeacherStudent(teacher,fixture.students[1].full_name);await until(teacher,()=>document.querySelectorAll('.teacher-update-card').length===0);assert.equal(await teacher.locator('#teacher-update-form input[name=title]').inputValue(),'');
 await selectTeacherStudent(teacher,fixture.students[0].full_name);await until(teacher,()=>document.querySelectorAll('.teacher-update-card').length===3);
 for(const language of ['hi','mr','en']){
  await teacher.locator('.language-selector select').selectOption(language);
  for(const route of ['students','attendance']){await teacher.goto(`${base}/teacher/${route}`);if(route==='students')await selectTeacherStudent(teacher,fixture.students[0].full_name);
   for(const width of [320,390,768,1440]){await teacher.setViewportSize({width,height:844});assert.equal(await teacher.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);result.localized.push({language,route,width});if(width===390)await shot(teacher,`${route}-${language}-390`);}
  }
 }
 const principal=await login('principal');await principal.goto(`${base}/principal/users`);await principal.locator('.account-mode-empty').waitFor();assert.equal(await principal.getByText('Create an account, choose its portal and connect it to your school. Existing passwords are never changed here.',{exact:true}).count(),0);assert.equal(await principal.locator('.account-create-form').count(),0);
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log('5/20/40/60 real synthetic registers: bounded layout, keyboard scroll, whole-class saves and SQL reads passed.');console.log('32-message history: initial three, complete View more traversal, older correction, selection reset and localized mobile/desktop states passed.');
}catch(error){if(activePage)await shot(activePage,'failure');result.passed=false;result.failure=String(error.message);throw error;}finally{await browser?.close();if(fixture)await cleanUiFixture(fixture.runId);writeFileSync(`${output}/results.json`,JSON.stringify(result,null,2));console.log(`Polish evidence: ${output}`);}
