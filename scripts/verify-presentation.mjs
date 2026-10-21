import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { preparePresentation } from './presentation-demo.mjs';
import { actorClient } from './manual-demo.mjs';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { shiftSchoolDate, schoolToday } from '../src/lib/school-date.mjs';
import { provisionBrowserFixture } from './online-demo/browser-fixture.mjs';

assertLocalTestEnvironment();
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
const provisioned = process.argv.includes('--provisioner') ? await provisionBrowserFixture() : null;
const f = provisioned?.fixture ?? await preparePresentation();
if(!provisioned)assert.equal((await preparePresentation()).runId, f.runId);
const output = path.resolve('.local/schovera-rfid-gateway/task32r-presentation'); mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const contexts = [], errors = [], external = [], measurements = [];
const suffix = Date.now().toString(36), workTitle = `Presentation practice ${suffix}`, revisedTitle = `Revised practice ${suffix}`, noticeTitle = `Reading practice ${suffix}`;
const routes = { teacher: ['home','students','profile','attendance','homework','timetable','ai','notices'], parent: ['home','profile','updates','attendance','homework','timetable','notices'], principal: ['home','students','communication','attendance','homework','timetable','notices'] };
const go = async (p, role, section) => { await p.goto(`${base}/${role}/${section}`, { waitUntil: 'networkidle' }); await p.locator(`.role-${role}`).waitFor(); };
async function login(account, mocked = false) {
  const context = await browser.newContext({ viewport: { width:1440, height:1000 } }); contexts.push(context);
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (['127.0.0.1','localhost','[::1]'].includes(u.hostname) || ['data:','blob:','about:'].includes(u.protocol)) return route.continue(); external.push(u.hostname); return route.abort(); });
  if (mocked) await context.addInitScript(() => {
    window.__demoSpoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{ speaking:false, paused:false, getVoices:()=>['en-IN','hi-IN','mr-IN'].map(lang=>({lang})), speak:u=>{window.__demoSpoken.push(u.lang);queueMicrotask(()=>u.onstart?.());}, cancel(){}, pause(){},resume(){},addEventListener(){},removeEventListener(){} } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:class{constructor(text){this.text=text;}} });
  });
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'}); await page.getByLabel('Email').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator(`.role-${account.role}`).waitFor({timeout:30000});
  await page.getByText('Schovera Model School — Demo Campus',{exact:true}).first().waitFor();
  return {page,context};
}
const must = async q => { const r=await q;if(r.error)throw new Error(r.error.message);return r.data; };
try {
  const preparationTeacher = await actorClient(f.accounts.teacher);
  await must(preparationTeacher.rpc('save_class_attendance',{p_class_id:f.classes[0].id,p_attendance_date:f.dates.at(-1),p_records:f.students.slice(0,10).map((s,i)=>({student_id:s.id,status:i===0?'absent':'present'}))}));
  const teacher=await login(f.accounts.teacher), principal=await login(f.accounts.principal), parent=await login(f.accounts.parent,true);
  await go(teacher.page,'teacher','students');await teacher.page.getByRole('button',{name:'Grade 7A',exact:true}).click();await teacher.page.locator('button.student').filter({hasText:'Aarav Deshmukh'}).waitFor();
  assert.equal(await teacher.page.locator('button.student').count(),10);
  await teacher.page.getByRole('button',{name:'Grade 7B',exact:true}).click();await teacher.page.locator('button.student').filter({hasText:'Vihaan Shinde'}).waitFor();assert.equal(await teacher.page.locator('button.student').count(),10);
  await go(teacher.page,'teacher','attendance');await teacher.page.getByRole('button',{name:'Grade 7A',exact:true}).click();
  const reg=teacher.page.locator('.teacher-attendance-register');await reg.locator('.roster-row').filter({hasText:'Aarav Deshmukh'}).waitFor();
  await teacher.page.getByRole('button',{name:'Grade 7A',exact:true}).click();assert.equal(await reg.locator('.roster-row').count(),10);
  await reg.getByLabel('Date',{exact:true}).fill(f.dates.at(-1));
  const row=reg.locator('.roster-row').filter({hasText:'Aarav Deshmukh'});await row.locator('button[aria-pressed=true]').filter({hasText:'Absent'}).waitFor();
  // Hold a real stale attendance refetch, then edit before delivering its response.
  let releaseRead, capturedRead; const gateRead=new Promise(resolve=>{releaseRead=resolve;});const captured=new Promise(resolve=>{capturedRead=resolve;});let held=false;
  const oldRead=async route=>{const url=new URL(route.request().url());if(!held&&route.request().method()==='GET'&&url.searchParams.get('class_id')===`eq.${f.classes[0].id}`&&url.searchParams.get('attendance_date')===`eq.${f.dates.at(-1)}`){held=true;const response=await route.fetch();capturedRead();await gateRead;await route.fulfill({response});}else await route.continue();};
  await teacher.page.route('**/rest/v1/attendance_records*',oldRead);await teacher.page.bringToFront();await teacher.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await Promise.race([captured,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Controlled attendance refetch was not observed')),15000))]);
  await row.getByRole('button',{name:'Present',exact:true}).click();const finished=teacher.page.waitForEvent('requestfinished',{predicate:request=>request.url().includes('/rest/v1/attendance_records')&&new URL(request.url()).searchParams.get('attendance_date')===`eq.${f.dates.at(-1)}`});releaseRead();await finished;await teacher.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await teacher.page.unroute('**/rest/v1/attendance_records*',oldRead);
  await teacher.page.getByRole('button',{name:'Grade 7A',exact:true}).click();assert.equal(await row.getByRole('button',{name:'Present',exact:true}).getAttribute('aria-pressed'),'true','Stale refetch must not replace unsaved attendance');
  await reg.getByRole('button',{name:/Save attendance|Save changes/}).click();await teacher.page.getByText('Attendance saved',{exact:false}).waitFor();await teacher.page.getByTestId('attendance-insights').getByText('No follow-up pattern under these rules.',{exact:false}).waitFor();
  console.log('20-person demo: 10-student class switching, repeated active selection, attendance correction and insights passed.');
  await go(teacher.page,'teacher','homework'); const form=teacher.page.locator('.assignment-form').first();
  await form.getByLabel('Subject',{exact:true}).fill('Science');await form.getByLabel('Title',{exact:true}).fill(workTitle);await form.getByLabel('Description',{exact:true}).fill('Explain two simple machines with a labelled drawing.');await form.getByLabel('Due date',{exact:true}).fill(shiftSchoolDate(schoolToday(),4));await form.getByRole('button',{name:'Assign homework',exact:true}).click();
  const block=teacher.page.locator('.teacher-homework .assignment-card').filter({hasText:workTitle}).locator('..');await block.getByRole('button',{name:'Edit homework',exact:true}).click();await block.getByLabel('Title',{exact:true}).fill(revisedTitle);await block.getByRole('button',{name:'Save homework changes'}).click();await teacher.page.getByText(revisedTitle,{exact:true}).waitFor();
  const owner=await actorClient(f.accounts.teacher), guardian=await actorClient(f.accounts.parent), leader=await actorClient(f.accounts.principal), otherTeacher=await actorClient(f.accounts.teacherB);
  const saved=await must(owner.from('class_assignments').select('*').eq('title',revisedTitle).single());
  const args={p_assignment_id:saved.id,p_subject:saved.subject,p_title:'Changed with stale timestamp',p_description:saved.description,p_due_date:saved.due_date,p_expected_updated_at:'2000-01-01T00:00:00Z'};
  assert.ok((await owner.rpc('edit_class_assignment',args)).error,'Stale update must fail');
  for(const denied of [guardian,leader,otherTeacher])assert.ok((await denied.rpc('edit_class_assignment',{...args,p_expected_updated_at:saved.updated_at})).error,'Non-author must not edit');
  assert.ok((await owner.rpc('edit_class_assignment',{...args,p_expected_updated_at:saved.updated_at,p_title:'   '})).error);
  assert.ok((await owner.rpc('edit_class_assignment',{...args,p_expected_updated_at:saved.updated_at,p_due_date:'2000-01-01'})).error);
  assert.equal((await owner.rpc('edit_class_assignment',{...args,p_title:saved.title})).error,null,'Same-payload retry must not create another edit');
  const editRace=await Promise.all(['First reviewed description','Second reviewed description'].map(description=>owner.rpc('edit_class_assignment',{...args,p_title:saved.title,p_expected_updated_at:saved.updated_at,p_description:description})));
  assert.equal(editRace.filter(result=>!result.error).length,1,'Concurrent stale edits must permit exactly one content change');
  await go(parent.page,'parent','homework');await parent.page.locator('.child-switcher select').selectOption(f.students[0].id);await parent.page.getByText(revisedTitle,{exact:true}).waitFor();
  console.log('Homework browser create/edit and author-only/stale/validation/idempotent retry checks passed.');
  await go(teacher.page,'teacher','students');await teacher.page.getByRole('button',{name:'Grade 7A',exact:true}).click();await teacher.page.getByRole('button',{name:/Aarav Deshmukh/}).first().click();
  await teacher.page.locator('input[name=title]').fill(noticeTitle);await teacher.page.locator('textarea[name=message]').fill('Please read one page and bring your reading journal tomorrow.');await teacher.page.locator('input[name=important]').check();await teacher.page.getByRole('button',{name:'Send update to parent',exact:true}).click();
  const sent=teacher.page.locator('.teacher-update-card').filter({hasText:noticeTitle});await sent.waitFor();
  const draft=sent.locator('.translation-manager');await draft.locator('summary').click();await draft.locator('select').selectOption('mr');await draft.getByLabel('Translated title',{exact:true}).fill('वाचनाच्या सरावाची सूचना');await draft.getByLabel('Translated message',{exact:true}).fill('कृपया एक पान वाचा आणि उद्या वाचनाची वही आणा. ही प्रात्यक्षिकाची सूचना आहे.');await draft.getByRole('button',{name:'Save draft',exact:true}).click();await draft.getByRole('button',{name:'Submit for review',exact:true}).click();await draft.getByText('Submitted for Principal review',{exact:true}).waitFor();
  await go(principal.page,'principal','communication');const review=principal.page.locator('.principal-communication-card').filter({hasText:noticeTitle}).locator('.translation-manager');await review.locator('summary').click();await review.locator('select').selectOption('mr');await review.getByLabel('I checked the meaning',{exact:false}).check();await review.getByRole('button',{name:'Approve reviewed translation'}).click();await review.getByText('School-approved translation',{exact:true}).waitFor();
  await go(parent.page,'parent','updates');const notice=parent.page.locator('.parent-updates .update-card').first();await notice.getByText(noticeTitle,{exact:true}).waitFor();const language=notice.locator('.notice-language-toolbar select');await language.selectOption('mr');await notice.getByText('School-approved translation',{exact:true}).waitFor();await notice.getByRole('button',{name:'Listen to notice'}).click();await notice.getByRole('button',{name:'Pause',exact:true}).click();await notice.getByRole('button',{name:'Resume',exact:true}).click();await notice.getByRole('button',{name:'Stop',exact:true}).click();assert.equal(await parent.page.evaluate(()=>window.__demoSpoken.at(-1)),'mr-IN');
  await notice.getByRole('button',{name:`Acknowledge update: ${noticeTitle}`,exact:true}).click();await notice.getByText('Acknowledged',{exact:true}).waitFor();await sent.getByText('Acknowledged',{exact:true}).waitFor();
  const library=parent.page.locator('.parent-updates .update-card').filter({has:parent.page.getByRole('button',{name:'Acknowledge update: Library notebook reminder',exact:true})});await library.waitFor();
  for(const lang of ['hi','mr']) {await library.locator('.notice-language-toolbar select').selectOption(lang);await library.getByText('School-approved translation',{exact:true}).waitFor();await library.locator('.notice-language-toolbar select').selectOption('original');}
  await go(parent.page,'parent','home');await parent.page.locator('.child-switcher select').selectOption(f.students[10].id);await parent.page.locator('#parent-child-heading').getByText('Vihaan Shinde',{exact:true}).waitFor();await go(parent.page,'parent','updates');assert.equal(await parent.page.getByText(noticeTitle,{exact:true}).count(),0);
  console.log('Teacher draft, Principal approval, Parent Hindi/Marathi/original, mocked speech, notice-specific acknowledgement and child isolation passed.');
  await go(principal.page,'principal','timetable');await principal.page.locator('.timetable-select select').selectOption(f.classes[0].id);const tableForm=principal.page.locator('.timetable-form');await tableForm.getByLabel(/^Teacher/).selectOption(f.accounts.teacher.id);await tableForm.getByLabel('Subject',{exact:true}).fill('Presentation club');await tableForm.getByLabel(/^Day/).selectOption('1');await tableForm.getByLabel('Period',{exact:true}).fill('18');await tableForm.getByLabel('Start',{exact:true}).fill('17:00');await tableForm.getByLabel('End',{exact:true}).fill('17:40');await tableForm.getByRole('button',{name:'Add period',exact:true}).click();
  const period=principal.page.locator('.timetable-manage-list').locator('div').filter({has:principal.page.getByText('Presentation club',{exact:true})});await period.getByRole('button',{name:'Edit',exact:true}).click();await tableForm.getByLabel('Subject',{exact:true}).fill('Reading club');await tableForm.getByRole('button',{name:'Save changes',exact:true}).click();await principal.page.locator('.timetable-manage-list').getByText('Reading club',{exact:true}).waitFor();
  await go(principal.page,'principal','notices');const compose=principal.page.locator('.notice-composer');await compose.getByLabel('Title',{exact:true}).fill('Reading exhibition invitation');await compose.getByLabel('Message',{exact:true}).fill('Families are welcome to explore our fictional reading exhibition. This is a demo notice.');await compose.getByRole('button',{name:'Publish notice',exact:true}).click();await principal.page.getByText('Announcement published.',{exact:true}).waitFor();
  console.log('Principal timetable creation/editing and school announcement browser flow passed.');
  for(const [role,view] of [['teacher',teacher],['parent',parent],['principal',principal]]) {
    if(role==='parent'){await go(view.page,role,'home');await view.page.locator('.child-switcher select').selectOption(f.students[0].id);}
    for(const section of routes[role]) {
      await go(view.page,role,section);
      if(role==='teacher'&&['students','profile'].includes(section)){await view.page.getByRole('button',{name:/Aarav Deshmukh/}).first().click();}
      if(role==='principal'&&section==='students')await view.page.locator('.principal-student-results button.student').first().click();
      await view.page.waitForFunction(()=>document.querySelectorAll('.skeleton,.notice-skeleton,.principal-communication-skeleton').length===0);
      for(const width of [390,768,1024,1440]){
        await view.page.setViewportSize({width,height:1000});await view.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert.ok(await view.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${role}/${section}/${width} overflows`);
        await view.page.screenshot({path:path.join(output,`${role}-${section}-${width}.png`),fullPage:true,animations:'disabled'});
      }
    }
  }
  console.log('Presentation visual coverage passed: all 22 destinations × 4 widths; 88 real screenshots.');
  if(provisioned)await provisioned.checkSessions(parent);
  for(const role of ['parent','teacher']){
    const context=await browser.newContext();contexts.push(context);const page=await context.newPage();
    const cdp=await context.newCDPSession(page);let bytes=0;cdp.on('Network.loadingFinished',e=>{bytes+=e.encodedDataLength;});await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:128*1024,uploadThroughput:64*1024});
    const start=Date.now();await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.getByLabel('Email').waitFor({timeout:120000});const initialMs=Date.now()-start;
    await page.getByLabel('Email').fill(f.accounts[role].email);await page.getByLabel('Password',{exact:true}).fill(f.accounts[role].password);await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator(`.role-${role}`).waitFor({timeout:60000});
    const nav=Date.now();await page.locator(`nav a[href="/${role}/${role==='parent'?'updates':'attendance'}"]`).click();await page.locator(role==='parent'?'.parent-updates .update-card':'.teacher-attendance-register .roster-row').first().waitFor({timeout:60000});
    measurements.push({role,mode:'Next development server; cold browser cache; 150ms latency, 1Mbps down/512Kbps up',initialLoginFormMs:initialMs,keyNavigationMs:Date.now()-nav,encodedBytesDuringLoadLoginNavigation:bytes});
    await context.setOffline(true);await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.role-parent,.role-teacher'));assert.equal(await page.locator('.update-card,.roster-row,.student-profile').count(),0,'Private data must disappear on offline logout');await page.getByLabel('Email').waitFor({timeout:30000});await context.setOffline(false);await page.reload({waitUntil:'domcontentloaded',timeout:120000});await page.getByLabel('Email').waitFor({timeout:60000});assert.equal(await page.locator('.role-parent,.role-teacher').count(),0,'Reconnecting after logout must not restore private data');await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  writeFileSync(path.join(output,'measurements.json'),JSON.stringify({measurements,audio:'AUDIO NOT VERIFIED',routes:22,widths:4,screenshots:88},null,2));
  console.log(JSON.stringify(measurements));console.log(`Presentation evidence: ${output}`);
} finally {await browser.close();if(provisioned)await provisioned.cleanup();}
