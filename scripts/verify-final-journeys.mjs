// Connected real-browser regression; every account and record is synthetic/local.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { prepareManualFixture, cleanManualFixture, actorClient, manualPaths, readManualFixture } from './manual-demo.mjs';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { openOptionalTool } from './lib/open-optional-tool.mjs';

assertLocalTestEnvironment();
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
let browser, fixture;
const views = [];
async function login(account, speech = false) {
  console.log(`Connected journey: sign in as ${account.role}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const external = [], errors = [];
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); external.push(u.hostname); return route.abort(); });
  if (speech) await context.addInitScript(() => {
    window.__finalSpeech = { spoken: [] };
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string' && input === '/api/communication/speech' && typeof init?.body === 'string') {
        const body = JSON.parse(init.body); window.__finalSpeech.spoken.push({ text: body.text, lang: body.language });
      }
      return originalFetch.call(this, input, init);
    };
    const NativeAudio = window.Audio;
    window.Audio = function(...args) { const audio = new NativeAudio(...args); window.__finalAudio = audio; return audio; };
    window.Audio.prototype = NativeAudio.prototype;
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(45000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' }); await page.getByLabel('Email').fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in securely' }).click(); await page.locator(`.role-${account.role}`).waitFor({ timeout: 30000 });
  const view = { page, context, external, errors }; views.push(view); return view;
}
const go = (page, role, route) => { console.log(`Connected journey: ${role}/${route}`); return page.goto(`${base}/${role}/${route}`, { waitUntil: 'networkidle' }); };
const signout = async (page) => { await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByLabel('Email').waitFor(); };
function entry(command) {
  const minimal = Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP'].flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
  const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types', fileURLToPath(new URL('./manual-entry.mjs', import.meta.url)), command], { env: minimal, encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.equal(result.status, 0, `Synthetic gateway ${command} failed: ${result.stderr.slice(0, 200)}`);
  return JSON.parse(result.stdout);
}
try {
  console.log('Connected journey: preparing isolated records');
  fixture = await prepareManualFixture({ onCreated: (created) => { fixture = created; } });
  await assert.rejects(prepareManualFixture(), /already exists/, 'A second preparation must preserve the existing fixture');
  assert.equal(readManualFixture().runId, fixture.runId);
  browser = await chromium.launch({ headless: true });
  const teacher = await login(fixture.accounts.teacher); await go(teacher.page, 'teacher', 'attendance');
  await teacher.page.getByRole('button', { name: 'Grade 8-A', exact: true }).click();
  await teacher.page.locator('.teacher-attendance-register .roster-row').filter({ hasText: 'Synthetic Child A' }).waitFor();
  await teacher.page.getByRole('button', { name: 'Grade 8-A', exact: true }).click();
  assert.equal(await teacher.page.locator('.teacher-attendance-register .roster-row').count(), 1, 'Re-selecting the active class must not clear its roster');
  await openOptionalTool(teacher.page, 'teacher-attendance-insights');
  const insights = teacher.page.getByTestId('attendance-insights'); await insights.getByText('Attendance Follow-up Suggested', { exact: true }).waitFor();
  await teacher.page.getByLabel('Date', { exact: true }).fill(fixture.dates.at(-1));
  const register = teacher.page.locator('.teacher-attendance-register');
  await register.locator('.roster-row button[aria-pressed=true]').filter({ hasText: 'Absent' }).waitFor();
  await register.locator('.roster-row').getByRole('button', { name: 'Present', exact: true }).click();
  await register.getByRole('button', { name: /Save attendance|Save changes/ }).click();
  await teacher.page.getByText('Attendance saved', { exact: false }).waitFor();
  await insights.getByText('No follow-up pattern under these rules.', { exact: false }).waitFor();
  await go(teacher.page, 'teacher', 'students'); await teacher.page.getByRole('button', { name: /Synthetic Child A/ }).first().click();
  const title = 'Synthetic final connected notice';
  await teacher.page.locator('input[name=title]').fill(title); await teacher.page.locator('textarea[name=message]').fill('Synthetic connected journey: bring a library notebook at 09:00.');
  await teacher.page.locator('input[name=important]').check(); await teacher.page.getByRole('button', { name: 'Send update to parent', exact: true }).click();
  const sent = teacher.page.locator('.teacher-update-card').filter({ hasText: title }); await sent.waitFor();
  assert.equal(await sent.locator('.translation-manager').count(), 0, 'Teachers send their original once; optional review belongs to the Principal.');
  const principal = await login(fixture.accounts.principal); await go(principal.page, 'principal', 'communication');
  const reviewCard = principal.page.locator('.principal-communication-card').filter({ hasText: title }); const review = reviewCard.locator('.translation-manager');
  await review.locator('summary').click(); await review.locator('select').selectOption('mr');
  await review.getByLabel('Translated title', { exact: true }).fill('नमुना जोडलेली सूचना'); await review.getByLabel('Translated message', { exact: true }).fill('नमुना सूचना: 09:00 वाजता वाचनालयाची वही आणा. ही फक्त चाचणी आहे.');
  await review.getByRole('button', { name: 'Save draft', exact: true }).click(); await review.getByRole('button', { name: 'Submit for review', exact: true }).click(); await review.getByText('Submitted for Principal review', { exact: true }).waitFor();
  await review.getByLabel('I checked the meaning', { exact: false }).check();
  await review.getByRole('button', { name: 'Approve reviewed translation', exact: true }).click(); await review.getByText('School-approved translation', { exact: true }).waitFor();
  await go(principal.page, 'principal', 'attendance'); await principal.page.getByTestId('attendance-insights').getByRole('heading', { name: 'Classroom attendance insights' }).waitFor();
  const parent = await login(fixture.accounts.parent, true); await go(parent.page, 'parent', 'home'); await parent.page.locator('.child-switcher select').selectOption(fixture.students[0].id);
  await go(parent.page, 'parent', 'updates');
  const notice = parent.page.locator('.parent-updates .update-card').first(); await notice.getByText(title, { exact: true }).waitFor();
  const content = notice.locator('.notice-language-view'); await content.locator('.notice-language-toolbar > label select').selectOption('mr');
  await content.getByText('School-approved translation', { exact: true }).waitFor(); await content.getByRole('button', { name: 'Listen to notice', exact: true }).click();
  await parent.page.waitForFunction(() => window.__finalAudio?.currentTime > .1 && !window.__finalAudio.paused);
  await content.getByRole('button', { name: 'Pause', exact: true }).click(); await content.getByRole('button', { name: 'Resume', exact: true }).click(); await content.getByRole('button', { name: 'Stop', exact: true }).click();
  assert.equal(await parent.page.evaluate(() => window.__finalSpeech.spoken.at(-1)?.lang), 'mr');
  await notice.getByRole('button', { name: `Acknowledge update: ${title}`, exact: true }).click(); await notice.getByText('Acknowledged', { exact: true }).waitFor();
  for (const [route, selector] of [['homework', '.assignment-card'], ['attendance', '.attendance-card'], ['timetable', '.timetable-workspace'], ['profile', '.student-profile']]) { await go(parent.page, 'parent', route); await parent.page.locator(selector).first().waitFor(); }
  await go(parent.page, 'parent', 'notices'); await openOptionalTool(parent.page, 'notification-simulation-tools'); const prefs = parent.page.getByTestId('fallback-preferences');
  await prefs.locator('fieldset:not([disabled])').waitFor({ state: 'visible' });
  await prefs.getByLabel('I opt in to simulated SMS notices', { exact: true }).check(); await prefs.getByLabel('I opt in to simulated voice-call notices', { exact: true }).check(); await prefs.getByLabel('Preferred notice language').selectOption('mr'); await prefs.getByRole('button', { name: 'Save my preferences' }).click(); await prefs.getByText('Preferences saved.', { exact: false }).waitFor();
  await go(teacher.page, 'teacher', 'students'); await teacher.page.getByRole('button', { name: /Synthetic Child A/ }).first().click();
  await teacher.page.locator('.teacher-update-card').filter({ hasText: title }).getByText('Acknowledged', { exact: true }).waitFor();
  const dispatch = teacher.page.locator('.teacher-update-card').filter({ hasText: title }).getByTestId('fallback-dispatch'); await dispatch.locator('summary').click(); await dispatch.getByRole('button', { name: 'Queue eligible synthetic recipients' }).click(); await dispatch.getByText('Pending simulation', { exact: true }).first().waitFor();
  await dispatch.getByRole('button', { name: 'Run fake delivery / check status' }).first().click(); await dispatch.getByText('SIMULATED delivered — not read', { exact: true }).waitFor();
  await go(principal.page, 'principal', 'communication'); const overview = principal.page.locator('.principal-communication-card').filter({ hasText: title }).getByTestId('fallback-dispatch'); await overview.locator('summary').click(); await overview.getByText('SIMULATED delivered — not read', { exact: true }).waitFor();
  assert.equal(entry('queue').queue.pending, 1); assert.equal(entry('offline').queue.pending, 1); assert.equal(entry('status').queue.pending, 1);
  const synced = entry('sync'); assert.equal(synced.queue.delivered_to_local_server, 1); assert.equal(entry('duplicate').canonicalRetry.duplicate, true);
  for (const view of [parent, teacher, principal]) { await go(view.page, view === parent ? 'parent' : view === teacher ? 'teacher' : 'principal', 'home'); await openOptionalTool(view.page); const events = view.page.locator('.school-entry-panel .school-entry-event'); await events.getByText('Check-in recorded', { exact: true }).waitFor(); assert.equal(await events.count(), 1, 'One persisted observation must appear once in each authorized role'); }
  await parent.page.locator('.child-switcher select').selectOption(fixture.students[1].id); await parent.page.locator('.school-entry-panel').getByText('No entry record available', { exact: true }).waitFor();
  assert.equal(entry('queue').queue.pending, 1); const principalClient = await actorClient(fixture.accounts.principal);
  const revoked = await principalClient.rpc('revoke_student_credential', { p_credential_id: fixture.assignmentId }); assert.equal(revoked.error, null);
  assert.equal(entry('sync').queue.attention_required, 1);
  for (const [account, prompt] of [[fixture.accounts.unlinkedParent, /linked child|linked children|school has not linked|No child/i], [fixture.accounts.unassignedTeacher, /assigned class|No active class|No classes/i]]) {
    const view = await login(account); await view.page.getByText(prompt).filter({ visible: true }).first().waitFor();
  }
  for (const view of [parent, teacher, principal]) await signout(view.page);
  for (const view of views) { assert.deepEqual(view.external, []); assert.deepEqual(view.errors, []); }
  console.log('Connected journeys passed: Teacher insights/send; Principal draft/approval/review; Parent translated real-media playback/acknowledgement/homework/attendance/timetable/profile/consent/child switching; durable offline/restart/local sync/duplicate/revocation; empty contexts and logout.');
  console.log(`Private generated fixture was held only in its ignored run directory (${manualPaths().runDirectory}); no credentials printed.`);
} catch (error) {
  console.error(`Connected journey assertion failed: ${error.message}`);
  for (const { page } of views) {
    console.error(JSON.stringify(await page.evaluate(() => ({ path: location.pathname, date: document.querySelector('input[type=date]')?.value, register: document.querySelector('.teacher-attendance-register')?.innerText, alerts: [...document.querySelectorAll('[role=alert],.error')].map((e) => e.textContent) }))));
  }
  throw error;
} finally {
  await browser?.close();
  if (fixture) {
    assert.equal(readManualFixture().runId, fixture.runId, 'Refusing cleanup of another run');
    await cleanManualFixture();
  }
}
