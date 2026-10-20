// Local synthetic acceptance only. Never discovers .env.local or phones/providers.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

assertLocalTestEnvironment(); // Must run before constructing clients or requests.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Synthetic-${randomUUID()}!aA1`;
const schools = [], users = [], updates = [];
const captures = process.argv.includes('--screenshots') ? mkdtempSync(join(tmpdir(), 'schovera-fallback-ui-')) : null;
let browser;
const must = async (query) => { const { data, error } = await query; if (error) throw new Error(error.message); return data; };
const denied = async (query) => assert.ok((await query).error, 'unauthorized mutation succeeded');
const rpc = (name, args) => must(admin.rpc(name, args));
async function school() {
  const s = await must(admin.from('schools').insert({ name: `Synthetic fallback ${randomUUID()}`, code: `FM-${randomUUID().slice(0, 8)}` }).select().single());
  schools.push(s.id); return s.id;
}
async function account(role, schoolId) {
  const email = `${role}-${randomUUID()}@fallback.local.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error; users.push(data.user.id);
  await must(admin.from('profiles').insert({ id: data.user.id, email, full_name: `Synthetic ${role}`, role, school_id: schoolId, active: true }));
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await must(client.auth.signInWithPassword({ email, password }));
  return { id: data.user.id, email, role, client, token: auth.session.access_token };
}
const prefs = (actor, sms, ivr, language = 'en') => rpc('set_fallback_simulation_preferences', { p_actor: actor.id, p_sms: sms, p_ivr: ivr, p_language: language });
const queue = (actor, source) => rpc('queue_fallback_simulation', { p_actor: actor.id, p_kind: source.kind, p_source_id: source.id });
const review = (actor, source) => rpc('review_fallback_simulation', { p_actor: actor.id, p_kind: source.kind, p_source_id: source.id });
const prepare = (actor, id) => rpc('step_fallback_simulation', { p_actor: actor.id, p_delivery_id: id, p_phase: 'prepare' });
const due = (id) => must(admin.from('fallback_simulation_deliveries').update({ next_attempt_at: '2000-01-01T00:00:00Z' }).eq('id', id));
const finish = (actor, id, prepared, status, receipt = null) => rpc('step_fallback_simulation', { p_actor: actor.id, p_delivery_id: id, p_phase: 'finish', p_expected_updated_at: prepared.updated_at, p_result: { label: 'SIMULATED', status, receipt_ref: receipt, code: 'fake_test' } });
async function request(actor, body, query = '') {
  const response = await fetch(`${base}/api/fallback-simulator${query}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${actor.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function login(actor, route) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const external = [];
  await context.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || ['data:', 'blob:', 'about:'].includes(target.protocol)) return route.continue();
    external.push(target.hostname); return route.abort();
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(actor.email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click(); await page.locator(`.role-${actor.role}`).waitFor({ timeout: 30000 });
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  return { page, context, external };
}
try {
  const a = await school(), b = await school();
  const teacher = await account('teacher', a), otherTeacher = await account('teacher', a);
  const principal = await account('principal', a), foreign = await account('principal', b);
  const parent = await account('parent', a), unlinked = await account('parent', a), foreignParent = await account('parent', b);
  const klass = await must(admin.from('classes').insert({ school_id: a, grade: '8', division: randomUUID().slice(0, 5), academic_year: 'FALLBACK-TEST' }).select().single());
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: teacher.id, class_id: klass.id }));
  const student = await must(admin.from('students').insert({ school_id: a, class_id: klass.id, full_name: 'Synthetic Fallback Child', roll_number: '01', active: true }).select().single());
  const link = await must(admin.from('parent_student_links').insert({ parent_id: parent.id, student_id: student.id, status: 'active' }).select().single());
  async function source(importance = 'important') {
    const title = `Synthetic Important ${randomUUID().slice(0, 8)}`, body = 'Synthetic notice. No personal information or telephone number.';
    const id = await must(teacher.client.rpc('send_student_update', { p_class_id: klass.id, p_student_id: student.id, p_category: 'general', p_title: title, p_message: body, p_importance: importance, p_client_request_id: randomUUID() }));
    updates.push(id); return { kind: 'update', id, title, body };
  }
  async function translated(s) {
    let row = null;
    for (const [actor, action] of [[teacher, 'save'], [teacher, 'submit'], [principal, 'approve']]) {
      await must(actor.client.rpc('manage_communication_translation', { p_source_kind: s.kind, p_source_id: s.id, p_language: 'mr', p_action: action,
        p_expected_title: s.title, p_expected_body: s.body, p_title: 'नमुना सूचना', p_body: 'ही मंजूर कृत्रिम मराठी सूचना आहे.', p_expected_updated_at: row?.updated_at ?? null }));
      row = await must(admin.from('communication_translations').select('*').eq('student_update_id', s.id).single());
    }
    return row;
  }
  const original = await source();
  assert.equal(await queue(teacher, original), 0, 'no implicit consent');
  await prefs(parent, true, false, 'mr'); await prefs(unlinked, true, true); await prefs(foreignParent, true, true);
  assert.equal((await review(teacher, original)).eligible_count, 1, 'unlinked and foreign excluded');
  assert.equal(await queue(teacher, original), 1); assert.equal(await queue(principal, original), 0, 'duplicate queue suppressed');
  let delivery = (await review(teacher, original)).deliveries[0];
  assert.equal(delivery.channel, 'sms'); assert.equal(delivery.language, 'original', 'no unapproved translation');
  for (const actor of [parent, otherTeacher, foreign]) {
    await denied(admin.rpc('queue_fallback_simulation', { p_actor: actor.id, p_kind: original.kind, p_source_id: original.id }));
    await denied(admin.rpc('step_fallback_simulation', { p_actor: actor.id, p_delivery_id: delivery.id, p_phase: 'prepare' }));
  }
  await denied(admin.rpc('set_fallback_simulation_preferences', { p_actor: principal.id, p_sms: true, p_ivr: true, p_language: 'en' }));
  await denied(parent.client.rpc('set_fallback_simulation_preferences', { p_actor: unlinked.id, p_sms: true, p_ivr: true, p_language: 'en' }));
  await denied(parent.client.from('fallback_simulation_preferences').update({ opted_in: true }).eq('parent_id', unlinked.id));
  assert.equal((await must(unlinked.client.from('fallback_simulation_preferences').select('parent_id'))).every((r) => r.parent_id === unlinked.id), true);
  for (const actor of [foreign, foreignParent, otherTeacher, unlinked]) assert.equal((await must(actor.client.from('fallback_simulation_deliveries').select('id'))).length, 0);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  await denied(anon.from('fallback_simulation_preferences').select('id')); await denied(anon.from('fallback_simulation_deliveries').select('id'));
  await prefs(parent, false, false, 'mr'); assert.equal((await prepare(teacher, delivery.id)).status, 'blocked');
  assert.equal(await queue(teacher, await source()), 0, 'optout before queue');
  await prefs(parent, true, true, 'mr');
  const approved = await source(); const tr = await translated(approved);
  assert.equal(await queue(teacher, approved), 2, 'independent SMS and IVR optin');
  const translatedDeliveries = (await review(teacher, approved)).deliveries;
  assert.ok(translatedDeliveries.every((d) => d.language === 'mr'));
  const payload = await prepare(teacher, translatedDeliveries[0].id); assert.equal(payload.body, tr.body);
  await must(teacher.client.rpc('manage_communication_translation', { p_source_kind: approved.kind, p_source_id: approved.id, p_language: 'mr', p_action: 'save', p_expected_title: approved.title, p_expected_body: approved.body, p_title: tr.title, p_body: tr.body, p_expected_updated_at: tr.updated_at }));
  assert.equal((await finish(teacher, translatedDeliveries[0].id, payload, 'delivered')).status, 'blocked', 'invalidate between prepare and finish');
  assert.equal((await prepare(principal, translatedDeliveries[1].id)).status, 'blocked');
  const linkedSource = await source(); await queue(teacher, linkedSource);
  await must(admin.from('parent_student_links').delete().eq('id', link.id));
  const linkedD = (await review(principal, linkedSource)).deliveries[0];
  assert.equal((await prepare(teacher, linkedD.id)).status, 'blocked');
  assert.equal((await must(parent.client.from('fallback_simulation_deliveries').select('id'))).length, 0);
  await must(admin.from('parent_student_links').insert(link));
  const normal = await source('normal'); await denied(admin.rpc('queue_fallback_simulation', { p_actor: teacher.id, p_kind: 'update', p_source_id: normal.id }));
  const stale = await source(); await queue(teacher, stale);
  const correction = await must(teacher.client.rpc('send_student_update_correction', { p_original_update_id: stale.id, p_title: 'Corrected synthetic notice', p_message: 'Corrected synthetic message only.' })); updates.push(correction);
  assert.equal((await prepare(teacher, (await review(principal, stale)).deliveries[0].id)).status, 'blocked');
  await prefs(parent, true, false);
  const consentRace = await source(); await queue(teacher, consentRace);
  const consentDelivery = (await review(principal, consentRace)).deliveries[0];
  const consentPrepared = await prepare(teacher, consentDelivery.id);
  await prefs(parent, false, false); await prefs(parent, true, false);
  assert.equal((await finish(teacher, consentDelivery.id, consentPrepared, 'delivered')).status, 'blocked', 'optout then reoptin cannot revive old consent');
  const assignmentSource = await source(); await queue(teacher, assignmentSource);
  const assignmentD = (await review(principal, assignmentSource)).deliveries[0];
  await must(admin.from('teacher_class_assignments').update({ ended_at: new Date().toISOString() }).eq('teacher_id', teacher.id));
  await denied(admin.rpc('step_fallback_simulation', { p_actor: teacher.id, p_delivery_id: assignmentD.id, p_phase: 'prepare' }));
  await must(admin.from('teacher_class_assignments').update({ ended_at: null }).eq('teacher_id', teacher.id));
  const announcement = await must(admin.from('announcements').insert({ school_id: a, created_by: principal.id, title: 'Synthetic Important announcement', body: 'Synthetic school-wide fallback notice.', priority: 'important' }).select().single());
  const schoolNotice = { kind: 'announcement', id: announcement.id };
  assert.equal(await queue(principal, schoolNotice), 1, 'school-wide recipients still require an active same-school child link');
  await denied(admin.rpc('queue_fallback_simulation', { p_actor: teacher.id, p_kind: 'announcement', p_source_id: announcement.id }));
  const schoolDelivery = (await review(principal, schoolNotice)).deliveries[0];
  await must(admin.from('announcements').update({ body: 'Changed synthetic announcement.' }).eq('id', announcement.id));
  assert.equal((await prepare(principal, schoolDelivery.id)).status, 'blocked', 'edited original cannot dispatch queued old version');
  const retrySource = await source(); await queue(teacher, retrySource);
  delivery = (await review(teacher, retrySource)).deliveries[0];
  let before = await prepare(teacher, delivery.id);
  assert.equal((await finish(teacher, delivery.id, before, 'retry_wait')).status, 'retry_wait');
  assert.equal((await prepare(teacher, delivery.id)).ready, false, 'bounded backoff prevents immediate retry');
  for (let i = 1; i < 5; i++) { await due(delivery.id); before = await prepare(teacher, delivery.id); await finish(teacher, delivery.id, before, 'retry_wait'); }
  assert.equal((await prepare(teacher, delivery.id)).status, 'failed', 'retry exhausted after five attempts');
  console.log('Fallback DB checks passed: channel consent, optouts, actor/RLS isolation, approved/current language, original fallback, revoked links, corrections, idempotency, backoff and bounded retries.');

  if (!process.argv.includes('--database-only')) {
    const api = await request(parent); assert.equal(api.status, 200);
    assert.equal((await request(principal, { op: 'preferences', sms: true, ivr: true, language: 'en' })).status, 403);
    assert.equal((await request(parent, { op: 'preferences', sms: true, ivr: false, language: 'en', parent_id: unlinked.id })).status, 400);
    assert.equal((await request(parent, { op: 'preferences', sms: true, ivr: false, language: 'en', phone: '+919999999999' })).status, 400);
    for (const scenario of ['deliver', 'delay', 'temporary_failure', 'permanent_failure', 'unreachable', 'reject', 'timeout']) {
      const s = await source(); await queue(teacher, s); const d = (await review(teacher, s)).deliveries[0];
      assert.equal((await request(parent, { op: 'dispatch', delivery_id: d.id, scenario })).status, 403);
      assert.equal((await request(foreign, { op: 'dispatch', delivery_id: d.id, scenario })).status, 403);
      const result = await request(teacher, { op: 'dispatch', delivery_id: d.id, scenario }); assert.equal(result.status, 200); assert.equal(result.data.simulated, true);
      const expected = { deliver: 'delivered', delay: 'accepted', temporary_failure: 'retry_wait', permanent_failure: 'failed', unreachable: 'failed', reject: 'failed', timeout: 'uncertain' }[scenario];
      assert.equal(result.data.status, expected);
      const after = (await review(principal, s)).deliveries[0]; assert.equal(after.attempt_count, 1);
      if (['accepted', 'uncertain', 'retry_wait'].includes(expected)) {
        await due(d.id); assert.equal((await request(teacher, { op: 'dispatch', delivery_id: d.id, scenario: 'deliver' })).data.status, 'delivered');
        const confirmed = (await review(principal, s)).deliveries[0];
        if (after.receipt_ref) assert.equal(confirmed.receipt_ref, after.receipt_ref, 'timeout/delay same fake receipt');
      }
      const count = (await review(teacher, s)).deliveries[0].attempt_count;
      await request(teacher, { op: 'dispatch', delivery_id: d.id, scenario: 'deliver' });
      assert.equal((await review(teacher, s)).deliveries[0].attempt_count, count, 'terminal receipt not reprocessed');
    }
    const concurrent = await source(); await queue(teacher, concurrent); const cd = (await review(teacher, concurrent)).deliveries[0];
    await Promise.all(Array.from({ length: 3 }, () => request(teacher, { op: 'dispatch', delivery_id: cd.id, scenario: 'deliver' })));
    assert.equal((await review(teacher, concurrent)).deliveries[0].attempt_count, 1);
    // Node fetch normalizes Host; use raw local HTTP to test the actual header.
    const forgedStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(`${base}/api/fallback-simulator`, { headers: { Host: 'schovera.vercel.app' } }, (response) => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(forgedStatus, 404);
    console.log('Fallback HTTP checks passed: fake provider scenarios, timeout confirmation, terminal/concurrent deduplication, forged Host and identity/phone injection refusal.');

    browser = await chromium.launch({ headless: true });
    const family = await login(parent, '/parent/notices'); const panel = family.page.getByTestId('fallback-preferences');
    const sms = panel.getByLabel('I opt in to simulated SMS notices', { exact: true });
    await sms.waitFor(); await sms.uncheck(); await panel.getByLabel('I opt in to simulated voice-call notices', { exact: true }).check();
    await panel.getByLabel('Preferred notice language').selectOption('mr');
    await panel.getByRole('button', { name: 'Save my preferences', exact: true }).click(); await panel.getByText('Preferences saved.', { exact: false }).waitFor();
    const saved = await must(parent.client.from('fallback_simulation_preferences').select('*'));
    const saveButton = panel.getByRole('button', { name: 'Save my preferences', exact: true });
    await saveButton.hover();
    assert.ok(await saveButton.evaluate((button) => {
      const style = getComputedStyle(button);
      const luminance = (color) => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map((v) => Number(v) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
    }), 'save button hover contrast');
    if (captures) await panel.screenshot({ path: join(captures, 'parent-mobile.png'), style: '.application-shell{visibility:hidden!important}' });
    assert.equal(saved.find((p) => p.channel === 'sms').opted_in, false); assert.equal(saved.find((p) => p.channel === 'ivr').opted_in, true);
    assert.ok(saved.every((p) => p.preferred_language === 'mr' && /^SIM-/.test(p.recipient_ref)));
    await sms.focus(); await family.page.keyboard.press('Space'); assert.equal(await sms.isChecked(), true);
    await panel.getByRole('button', { name: 'Save my preferences', exact: true }).click(); await panel.getByText('Preferences saved.', { exact: false }).waitFor();
    for (const lang of ['hi', 'mr', 'en']) {
      await family.page.evaluate((value) => { localStorage.setItem('schovera.language', value); }, lang);
      await family.page.reload({ waitUntil: 'networkidle' }); await panel.waitFor();
      const headings = { en: 'SMS and call simulation preferences', hi: 'SMS और कॉल अनुकरण की प्राथमिकताएँ', mr: 'SMS आणि कॉल अनुकरण प्राधान्ये' };
      assert.equal(await panel.getByRole('heading', { level: 3 }).textContent(), headings[lang]);
      assert.equal(await panel.getByRole('checkbox').count(), 2);
      assert.equal(await panel.locator('input[type=tel]').count(), 0);
      assert.equal(await family.page.evaluate(() => document.documentElement.lang), lang);
      assert.ok(await family.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    const uiSource = await source();
    const staff = await login(teacher, '/teacher/students');
    await staff.page.getByRole('button', { name: new RegExp(student.full_name) }).first().click();
    const card = staff.page.locator('.teacher-update-card').filter({ hasText: uiSource.title });
    const manager = card.getByTestId('fallback-dispatch'); await manager.locator('summary').click();
    await manager.getByText('Eligible channel preferences:', { exact: false }).waitFor();
    await manager.getByRole('button', { name: 'Queue eligible synthetic recipients' }).click();
    await manager.getByText('Pending simulation', { exact: true }).first().waitFor();
    await manager.getByRole('button', { name: 'Run fake delivery / check status' }).first().click();
    await manager.getByText('SIMULATED delivered — not read', { exact: true }).waitFor();
    if (captures) await manager.screenshot({ path: join(captures, 'teacher-mobile.png'), style: '.application-shell{visibility:hidden!important}' });
    assert.ok(await staff.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const leader = await login(principal, '/principal/communication');
    const oversight = leader.page.locator('.principal-communication-card').filter({ hasText: uiSource.title }).getByTestId('fallback-dispatch');
    await oversight.locator('summary').click(); await oversight.getByText('SIMULATED delivered — not read', { exact: true }).waitFor();
    assert.ok(await leader.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (captures) { await leader.page.setViewportSize({ width: 1440, height: 1000 }); await oversight.screenshot({ path: join(captures, 'principal-desktop.png') }); }
    // Check source code downloaded by browser without ever printing the value.
    const bundles = await family.page.locator('script[src]').evaluateAll((nodes) => nodes.map((n) => n.src));
    for (const script of bundles) {
      assert.ok(new URL(script).hostname === '127.0.0.1');
      const text = await (await fetch(script)).text(); assert.equal(text.includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
    }
    assert.deepEqual([...family.external, ...staff.external, ...leader.external], []);
    for (const view of [family, staff, leader]) await view.context.close();
    console.log('Fallback browser checks passed: Parent preferences, keyboard checkbox, en/hi/mr, Teacher queue/dispatch, Principal review, 390px and no external destinations/browser service key.');
    if (captures) console.log(`Synthetic UI captures: ${captures}`);
  }
  assert.equal((await must(admin.from('acknowledgements').select('id').in('update_id', updates))).length, 0, 'fake delivery never acknowledges');
  for (const table of ['attendance_records', 'school_entry_events']) assert.equal((await must(admin.from(table).select('id').eq('student_id', student.id))).length, 0);
  const logs = await must(admin.from('audit_events').select('metadata').in('school_id', schools));
  assert.equal(JSON.stringify(logs).includes(original.body), false);
  console.log('No acknowledgement, classroom attendance, RFID events, or message-text operational logs created.');
} finally {
  await browser?.close();
  if (schools.length) {
    for (const table of ['fallback_simulation_deliveries', 'fallback_simulation_preferences', 'communication_translations']) await must(admin.from(table).delete().in('school_id', schools));
    if (updates.length) await must(admin.from('acknowledgements').delete().in('update_id', updates));
    await must(admin.from('audit_events').delete().in('school_id', schools));
    for (const id of [...updates].reverse()) await must(admin.from('student_updates').delete().eq('id', id));
    await must(admin.from('announcements').delete().in('school_id', schools));
    if (users.length) {
      await must(admin.from('parent_student_links').delete().in('parent_id', users));
      await must(admin.from('teacher_class_assignments').delete().in('teacher_id', users));
    }
    for (const table of ['students', 'classes', 'profiles']) await must(admin.from(table).delete().in('school_id', schools));
    for (const id of users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw error; }
    await must(admin.from('schools').delete().in('id', schools));
    for (const table of ['fallback_simulation_deliveries', 'fallback_simulation_preferences', 'schools']) {
      const column = table === 'schools' ? 'id' : 'school_id';
      assert.equal((await must(admin.from(table).select('id').in(column, schools))).length, 0);
    }
  }
  console.log('Temporary fallback fixtures cleaned and verified.');
}
