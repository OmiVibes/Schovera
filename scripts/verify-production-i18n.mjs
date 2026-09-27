/* Controlled production acceptance for the Marathi Parent acknowledgement + reconnect path. */
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const baseUrl = process.env.SCHOVERA_TEST_URL || 'https://schovera.vercel.app';
if (!url || !serviceKey || !publishableKey) throw new Error('Required Supabase environment configuration is missing.');
if (!baseUrl.startsWith('https://')) throw new Error('Production verification requires an HTTPS target.');

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = randomUUID();
const title = `I18N TEMP ${suffix}`;
const message = `Temporary Marathi acknowledgement verification ${suffix}.`;
const expect = (condition, description) => { if (!condition) throw new Error(description); };
const must = async (query) => { const { data, error } = await query; if (error) throw error; return data; };
let browser;
let contexts = [];
let pages = [];
let teacherProfile;
let parentProfile;
let principalProfile;
let aarav;
let teacherUpdateId;
let priorUpdateIds = [];

function waitForRealtimeJoin(page, email) {
  let resolveReady;
  let rejectReady;
  let settled = false;
  const sockets = [];
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => {
    if (!settled) { settled = true; rejectReady(new Error(`No confirmed production Realtime subscription for ${email}.`)); }
  }, 25000);
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    sockets.push(socket);
    socket.on('framereceived', (frame) => {
      const payload = Buffer.isBuffer(frame.payload) ? frame.payload.toString('utf8') : String(frame.payload ?? '');
      if (payload.includes('phx_reply') && /"status"\s*:\s*"ok"/.test(payload) && !settled) {
        settled = true;
        clearTimeout(timer);
        resolveReady();
      }
    });
  });
  return { readiness, sockets };
}

async function login(page, email) {
  const joined = waitForRealtimeJoin(page, email);
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
  }
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText(email.split('@')[0] === 'teacher' ? 'Teacher' : email.split('@')[0] === 'parent' ? 'Parent' : 'Principal', { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await joined.readiness;
  return joined;
}

async function cleanup() {
  const found = await admin.from('student_updates').select('id').eq('title', title);
  if (found.error) throw found.error;
  const ids = [...new Set([teacherUpdateId, ...(found.data || []).map((row) => row.id)].filter(Boolean))];
  if (ids.length) {
    const { error: ackError } = await admin.from('acknowledgements').delete().in('update_id', ids);
    if (ackError) throw ackError;
    const { error: auditError } = await admin.from('audit_events').delete().in('target_id', ids);
    if (auditError) throw auditError;
    const { error: updateError } = await admin.from('student_updates').delete().in('id', ids);
    if (updateError) throw updateError;
  }
  const [updatesLeft, acknowledgementsLeft, auditsLeft] = await Promise.all([
    admin.from('student_updates').select('id').eq('title', title),
    ids.length ? admin.from('acknowledgements').select('id').in('update_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from('audit_events').select('id').in('target_id', ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (updatesLeft.error || acknowledgementsLeft.error || auditsLeft.error) throw updatesLeft.error || acknowledgementsLeft.error || auditsLeft.error;
  expect(!(updatesLeft.data || []).length && !(acknowledgementsLeft.data || []).length && !(auditsLeft.data || []).length, 'Temporary production update, acknowledgement, or audit rows remain.');
  if (priorUpdateIds.length) {
    const current = await must(admin.from('student_updates').select('id').in('id', priorUpdateIds));
    expect(current.length === priorUpdateIds.length, 'Natural Aarav demo updates changed during cleanup.');
  }
}

try {
  const profiles = await must(admin.from('profiles').select('id,email,school_id').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo']));
  const profile = (email) => profiles.find((row) => row.email === email);
  teacherProfile = profile('teacher@schovera.demo');
  parentProfile = profile('parent@schovera.demo');
  principalProfile = profile('principal@schovera.demo');
  expect(teacherProfile && parentProfile && principalProfile, 'Production demo role profiles are missing.');
  aarav = await must(admin.from('students').select('id,class_id,full_name').eq('school_id', parentProfile.school_id).eq('full_name', 'Aarav Patil').maybeSingle());
  expect(aarav, 'Production Aarav demo record is missing.');
  const assignment = await must(admin.from('teacher_class_assignments').select('class_id,classes(grade,division)').eq('teacher_id', teacherProfile.id).eq('class_id', aarav.class_id).is('ended_at', null).maybeSingle());
  expect(assignment, 'Production Teacher is not assigned to Aarav\'s class.');
  priorUpdateIds = (await must(admin.from('student_updates').select('id').eq('student_id', aarav.id))).map((row) => row.id);

  browser = await chromium.launch({ headless: true });
  contexts = [await browser.newContext({ viewport: { width: 1440, height: 1000 } }), await browser.newContext({ viewport: { width: 1440, height: 1000 } }), await browser.newContext({ viewport: { width: 1440, height: 1000 } })];
  pages = await Promise.all(contexts.map((context) => context.newPage()));
  pages.forEach((page) => page.on('pageerror', (error) => { throw error; }));
  const [teacherPage, parentPage, principalPage] = pages;
  const [teacherReady, parentReady, principalReady] = await Promise.all([
    login(teacherPage, teacherProfile.email),
    login(parentPage, parentProfile.email),
    login(principalPage, principalProfile.email),
  ]);
  expect(teacherReady.sockets.length > 0 && parentReady.sockets.length > 0 && principalReady.sockets.length > 0, 'One or more production role sessions did not establish Realtime sockets.');

  const parentLanguage = parentPage.locator('.language-selector select');
  await parentLanguage.selectOption('hi');
  await parentPage.waitForFunction(() => document.documentElement.lang === 'hi');
  await parentPage.reload({ waitUntil: 'networkidle' });
  const hindiLanguage = parentPage.locator('.language-selector select');
  await expect(await hindiLanguage.inputValue() === 'hi', 'Hindi preference did not persist after production refresh.');
  await parentPage.locator('#parent-child-heading').waitFor({ state: 'visible', timeout: 20000 });
  const hindiChildSelector = parentPage.locator('.child-switcher select');
  if (await hindiChildSelector.count()) await hindiChildSelector.selectOption({ label: 'Aarav Patil' });
  for (const section of ['प्रोफ़ाइल', 'अपडेट', 'उपस्थिति', 'गृहकार्य', 'समय-सारणी', 'स्कूल सूचनाएँ']) {
    await parentPage.getByRole('link', { name: section }).click();
    await parentPage.waitForFunction(() => document.documentElement.lang === 'hi');
  }
  await parentLanguage.selectOption('mr');
  await parentPage.waitForFunction(() => document.documentElement.lang === 'mr');
  await parentPage.reload({ waitUntil: 'networkidle' });
  const reloadedLanguage = parentPage.locator('.language-selector select');
  await expect(await reloadedLanguage.inputValue() === 'mr', 'Marathi preference did not persist after production refresh.');
  await parentPage.locator('#parent-child-heading').waitFor({ state: 'visible', timeout: 20000 });
  const childSelector = parentPage.locator('.child-switcher select');
  if (await childSelector.count()) await childSelector.selectOption({ label: 'Aarav Patil' });
  await parentPage.waitForFunction(() => document.querySelector('#parent-child-heading')?.textContent?.includes('Aarav Patil'), null, { timeout: 15000 });
  await expect(await parentPage.locator('.language-selector select').inputValue() === 'mr', 'Language change altered the selected child context.');

  const classLabel = `Grade ${assignment.classes.grade}${assignment.classes.division}`;
  await teacherPage.getByRole('link', { name: 'विद्यार्थी' }).count().then(async (count) => {
    if (count) await teacherPage.getByRole('link', { name: 'विद्यार्थी' }).click();
    else await teacherPage.getByRole('link', { name: 'Students' }).click();
  });
  await teacherPage.getByRole('button', { name: classLabel }).first().click();
  await teacherPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
  await teacherPage.locator('#teacher-update-form').waitFor({ state: 'visible', timeout: 15000 });
  await teacherPage.locator('#teacher-update-form [name="title"]').fill(title);
  await teacherPage.locator('#teacher-update-form [name="message"]').fill(message);
  await teacherPage.locator('#teacher-update-form [name="important"]').check();

  let parentLoadCount = 0;
  parentPage.on('load', () => { parentLoadCount += 1; });
  const initialLoads = parentLoadCount;
  await contexts[1].setOffline(true);
  await teacherPage.getByRole('button', { name: 'Send update to parent' }).click();
  const createdRows = await must(admin.from('student_updates').select('id,importance,corrects_update_id').eq('teacher_id', teacherProfile.id).eq('student_id', aarav.id).eq('title', title));
  expect(createdRows.length === 1 && createdRows[0].importance === 'important' && !createdRows[0].corrects_update_id, 'Teacher UI did not create exactly one Important update.');
  teacherUpdateId = createdRows[0].id;
  await contexts[1].setOffline(false);
  await parentPage.locator('.attention-panel .update-card').filter({ hasText: title }).waitFor({ state: 'visible', timeout: 30000 });
  await parentPage.locator('.attention-panel').getByText('महत्त्वाचे', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await parentPage.locator('.attention-panel').getByText('पुष्टी आवश्यक', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  expect(parentLoadCount === initialLoads, 'Parent navigated/reloaded instead of recovering live after reconnect.');
  const parentImportantCard = parentPage.locator('.attention-panel .update-card').filter({ hasText: title });
  const acknowledgementButton = parentImportantCard.getByRole('button', { name: /पुष्टी करा/ });
  await acknowledgementButton.waitFor({ state: 'visible', timeout: 10000 });

  await teacherPage.locator('.teacher-update-card').filter({ hasText: title }).getByText('Awaiting acknowledgement').waitFor({ state: 'visible', timeout: 20000 });
  const principalCard = principalPage.locator('.principal-communication-card').filter({ hasText: title });
  await principalCard.getByText('Awaiting acknowledgement').waitFor({ state: 'visible', timeout: 20000 });
  await principalPage.locator('.principal-awaiting-metric b').waitFor({ state: 'visible' });
  const principalBeforeAck = (await principalPage.locator('.principal-metrics b').allTextContents()).map(Number);
  await acknowledgementButton.click();
  await parentImportantCard.getByText('पुष्टी केली', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await teacherPage.locator('.teacher-update-card').filter({ hasText: title }).getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  await principalCard.getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  await principalPage.waitForFunction((before) => {
    const values = Array.from(document.querySelectorAll('.principal-metrics b')).map((node) => Number(node.textContent));
    return values[0] === before[0] && values[1] === before[1] + 1 && values[2] === before[2] - 1;
  }, principalBeforeAck, { timeout: 20000 });
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', teacherUpdateId))).length === 1, 'Production Important acknowledgement row count was not exactly one.');

  for (const page of pages) await page.reload({ waitUntil: 'networkidle' });
  await parentPage.locator('#parent-child-heading').waitFor({ state: 'visible', timeout: 20000 });
  if (await parentPage.locator('.child-switcher select').count()) await parentPage.locator('.child-switcher select').selectOption({ label: 'Aarav Patil' });
  await parentPage.locator('#parent-updates .update-card').filter({ hasText: title }).getByText('पुष्टी केली', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  expect(await parentPage.locator('.language-selector select').inputValue() === 'mr', 'Marathi selection did not survive refresh.');
  await teacherPage.getByRole('link', { name: 'Students' }).click();
  await teacherPage.getByRole('button', { name: classLabel }).first().click();
  await teacherPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
  await teacherPage.locator('.teacher-update-card').filter({ hasText: title }).getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  await principalCard.getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  expect((await must(admin.from('student_updates').select('id').eq('title', title))).length === 1, 'Production update was not persisted exactly once.');
  await parentPage.locator('.language-selector select').selectOption('en');
  await parentPage.waitForFunction(() => document.documentElement.lang === 'en');
  await parentPage.locator('#parent-updates .update-card').filter({ hasText: title }).getByText('Acknowledged', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  console.log('Production Marathi Important update, reconnect recovery, acknowledgement Realtime, metrics, and refresh persistence passed.');
} finally {
  if (contexts.length) await Promise.all(contexts.map((context) => context.setOffline(false).catch(() => {})));
  if (browser) await browser.close();
  await cleanup();
}
