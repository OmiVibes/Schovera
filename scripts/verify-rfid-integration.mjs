/* Local-only RFID persistence, device auth and role-RLS acceptance test. */
import { randomUUID, generateKeyPairSync, sign, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { canonicalEvent } from './rfid-simulator/core.ts';

assertLocalTestEnvironment();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const testUrl = process.env.SCHOVERA_TEST_URL ?? 'http://127.0.0.1:3000';
const parsedTestUrl = new URL(testUrl);
if (parsedTestUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedTestUrl.hostname.toLowerCase())) {
  throw new Error('RFID integration test refuses a non-loopback application URL.');
}
const endpoint = new URL('/api/device/v1/events', parsedTestUrl).toString();
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = { schools: [], classes: [], students: [], users: [], devices: [], credentials: [], eventRows: [], receiptIds: [], auditSchoolIds: [] };
const suffix = randomUUID().slice(0, 8);
const password = `LocalRfid-${randomUUID()}!aA1`;
const expect = (condition, message) => { if (!condition) throw new Error(message); };
async function must(result) { const { data, error } = await result; if (error) throw error; return data; }
async function count(result) { const { count: rows, error } = await result; if (error) throw error; return rows ?? 0; }
async function createUser(role, schoolId) {
  const email = `${role}-${suffix}-${randomUUID().slice(0, 4)}@rfid.local.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('could not create local test user');
  created.users.push(data.user.id);
  await must(admin.from('profiles').insert({ id: data.user.id, school_id: schoolId, email, full_name: `RFID Test ${role}`, role, active: true }));
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: data.user.id, email, client };
}
async function createClass(schoolId, division) {
  const row = await must(admin.from('classes').insert({ school_id: schoolId, grade: '9', division, academic_year: 'RFID-TEST' }).select('id').single());
  created.classes.push(row.id);
  return row.id;
}
async function createStudent(schoolId, classId, roll) {
  const row = await must(admin.from('students').insert({ school_id: schoolId, class_id: classId, roll_number: roll, full_name: `Synthetic RFID ${roll}`, active: true }).select('id').single());
  created.students.push(row.id);
  return row.id;
}
function makeEvent(deviceId, credentialRef, sequence, overrides = {}) {
  return {
    schema_version: 1,
    event_id: randomUUID(),
    device_id: deviceId,
    credential_ref: credentialRef,
    event_type: sequence % 2 ? 'check_in' : 'check_out',
    observed_at: new Date().toISOString(),
    device_sequence: sequence,
    ...overrides,
  };
}
async function send(event, privateKey, options = {}) {
  const body = canonicalEvent(event);
  const timestamp = options.timestamp ?? String(Date.now());
  const nonce = options.nonce ?? randomUUID();
  const digest = createHash('sha256').update(body).digest('hex');
  const message = `POST\n/api/device/v1/events\n${timestamp}\n${nonce}\n${digest}`;
  const signature = sign(null, Buffer.from(message), privateKey).toString('base64');
  if (options.badSignature) return fetch(endpoint, { method: 'POST', headers: headers(event, timestamp, nonce, 'invalid'), body });
  return fetch(endpoint, { method: 'POST', headers: headers(event, timestamp, nonce, signature), body });
}
function headers(event, timestamp, nonce, signature) {
  return { 'content-type': 'application/json', 'x-schovera-device-id': event.device_id, 'x-schovera-timestamp': timestamp,
    'x-schovera-nonce': nonce, 'x-schovera-signature': signature };
}
async function json(response) { return response.json(); }
async function postWithRawHost(hostHeader) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: Number(parsedTestUrl.port || 80), path: '/api/device/v1/events',
      method: 'POST', headers: { host: hostHeader, 'content-type': 'application/json', 'content-length': '2' } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end('{}');
  });
}
async function provision(principal, label) {
  const pair = generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const id = await must(principal.client.rpc('provision_school_device', { p_label: label, p_hardware_type: 'local_simulator', p_verification_public_key: publicKey }));
  created.devices.push(id);
  return { id, privateKey: pair.privateKey };
}
async function issue(principal, studentId, ref) {
  const id = await must(principal.client.rpc('issue_student_credential', { p_student_id: studentId, p_credential_ref: ref, p_credential_version: 1 }));
  created.credentials.push(id);
  return id;
}
async function runSimulatorAgainstLocalApi(device, credentialRef) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'schovera-rfid-'));
  const privateKeyPath = join(temporaryDirectory, 'device-private.pem');
  try {
    const key = device.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    await writeFile(privateKeyPath, key, { mode: 0o600 });
    const cliPath = fileURLToPath(new URL('./rfid-simulator/cli.mjs', import.meta.url));
    execFileSync(process.execPath, [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types', cliPath,
      '--scenario', 'normal', '--local-api', '--target', endpoint, '--device-id', device.id,
      '--private-key-file', privateKeyPath, '--credential-ref', credentialRef, '--sequence-start', '1',
    ], { env: { ...process.env, SCHOVERA_TEST_MODE: 'local', SCHOVERA_RFID_API_MODE: 'local' }, stdio: 'pipe' });
    console.log('PASS existing Task 32A simulator delivered synthetic check-in and check-out to the local API.');
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function verifyDashboardViews(accounts, expectedStudentName, device, credentialRef) {
  const browser = await chromium.launch({ headless: true });
  const screenshotDirectory = await mkdtemp(join(tmpdir(), 'schovera-task32c-'));
  const contexts = [];
  const externalRequests = [];
  const openPages = [];
  async function signIn(role, email) {
    const roleContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(roleContext);
    await roleContext.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname.toLowerCase())) {
        externalRequests.push(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await roleContext.newPage();
    const entryResponses = [];
    page.on('response', async (response) => {
      if (response.url().includes('/rest/v1/school_entry_events')) {
        const parsed = new URL(response.url());
        entryResponses.push({ status: response.status(), eventType: parsed.searchParams.get('event_type'), range: parsed.searchParams.get('received_at'), select: parsed.searchParams.get('select') });
      }
    });
    await page.goto(parsedTestUrl.toString(), { waitUntil: 'networkidle' });
    if (role === 'Parent') await page.evaluate(([key, id]) => sessionStorage.setItem(key, id), [`schovera:selected-child:${accounts.parentId}`, accounts.childId]);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    const panel = page.locator('[data-testid="school-entry-panel"]');
    await panel.waitFor({ state: 'visible', timeout: 20000 });
    try { await page.locator('[data-testid="school-entry-panel"][data-loaded="true"]').waitFor({ timeout: 20000 }); }
    catch { throw new Error(`${role} dashboard did not finish loading: ${(await panel.innerText()).replace(/\s+/g, ' ').slice(-1200)}`); }
    const scriptUrls = await page.locator('script[src]').evaluateAll((nodes) => nodes.map((node) => node.src));
    const bundleBodies = await Promise.all(scriptUrls.map(async (scriptUrl) => {
      const response = await fetch(scriptUrl);
      return response.ok ? response.text() : '';
    }));
    expect(!bundleBodies.some((body) => body.includes(serviceKey)), `${role} browser bundle exposed a service-role credential.`);
    await page.screenshot({ path: join(screenshotDirectory, `${role.toLowerCase()}-signedin.png`), fullPage: true });
    expect(await panel.locator('.school-entry-event.check_in').count() > 0, `${role} dashboard did not render the persisted check-in record (${JSON.stringify(entryResponses)}; UI ${(await panel.innerText()).replace(/\s+/g, ' ').slice(-500)})`);
    return page;
  }
  try {
    const parent = await signIn('Parent', accounts.parent);
    openPages.push(parent);
    expect(await parent.locator('.school-entry-event-title').getByText(expectedStudentName).count() === 0, 'Parent entry event exposed an unnecessary child name instead of its selected-child context.');
    await parent.locator('[data-testid="school-entry-panel"]').getByText('School entry updates').waitFor();
    await parent.screenshot({ path: join(screenshotDirectory, 'parent-desktop.png'), fullPage: true });
    await parent.locator('.child-switcher select').selectOption({ label: accounts.siblingName });
    await parent.locator('[data-testid="school-entry-panel"][data-loaded="true"]').waitFor({ timeout: 10000 });
    await parent.locator('[data-testid="school-entry-panel"]').getByText('No entry record available').waitFor({ timeout: 10000 });
    expect(!(await parent.locator('[data-testid="school-entry-panel"] .school-entry-event.check_in').count()), 'Parent child switching retained the previous child event.');
    await parent.locator('.child-switcher select').selectOption({ label: expectedStudentName });
    await parent.locator('[data-testid="school-entry-panel"][data-loaded="true"]').waitFor({ timeout: 10000 });
    await parent.locator('[data-testid="school-entry-panel"] .school-entry-event.check_in').first().waitFor({ timeout: 10000 });
    await parent.setViewportSize({ width: 390, height: 844 });
    await parent.waitForTimeout(250);
    await parent.screenshot({ path: join(screenshotDirectory, 'parent-mobile.png'), fullPage: true });
    expect(await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Parent school-entry view overflows at 390px.');
    const language = parent.locator('.language-selector select');
    await language.selectOption('hi');
    await parent.locator('[data-testid="school-entry-panel"]').getByText('स्कूल प्रवेश अपडेट').waitFor();
    await language.selectOption('mr');
    await parent.locator('[data-testid="school-entry-panel"]').getByText('शाळा प्रवेश अपडेट').waitFor();

    for (const [role, email] of [['Teacher', accounts.teacher], ['Principal', accounts.principal]]) {
      const page = await signIn(role, email);
      openPages.push(page);
      const panel = page.locator('[data-testid="school-entry-panel"]');
      await panel.getByText(expectedStudentName).first().waitFor();
      expect(await panel.locator('.school-entry-event.check_in').count() > 0, `${role} does not show the persisted check-in.`);
      await page.screenshot({ path: join(screenshotDirectory, `${role.toLowerCase()}-desktop.png`), fullPage: true });
      if (role === 'Principal') {
        expect(await panel.locator('.school-entry-delayed').count() > 0, 'Principal dashboard omitted the delayed/uncertain timestamp indicator.');
        const fromInput = panel.locator('.school-entry-filters input[type="date"]').nth(0);
        const toInput = panel.locator('.school-entry-filters input[type="date"]').nth(1);
        const endDate = await toInput.inputValue();
        await fromInput.fill(endDate);
        await panel.getByRole('button', { name: 'Apply dates' }).click();
        await page.locator('[data-testid="school-entry-panel"][data-loaded="true"]').waitFor({ timeout: 10000 });
        const eventFilter = panel.locator('.school-entry-filters select');
        await eventFilter.selectOption('check_out');
        await page.waitForFunction(() => {
          const root = document.querySelector('[data-testid="school-entry-panel"]');
          return root?.getAttribute('data-loaded') === 'true' && root.querySelectorAll('.school-entry-event').length > 0;
        }, null, { timeout: 10000 });
        expect(await panel.locator('.school-entry-event.check_out').count() > 0, 'Principal event-type filter returned no check-outs.');
        expect(await panel.locator('.school-entry-event.check_in').count() === 0, 'Principal event-type filter retained check-ins.');
        await eventFilter.selectOption('all');
        await page.waitForFunction(() => document.querySelector('[data-testid="school-entry-panel"]')?.getAttribute('data-loaded') === 'true', null, { timeout: 10000 });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(screenshotDirectory, `${role.toLowerCase()}-mobile.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${role} school-entry view overflows at 390px.`);
    }

    await parent.locator('.language-selector select').selectOption('en');
    const previousCheckIns = await Promise.all(openPages.map((page) => page.locator('[data-testid="school-entry-panel"] .school-entry-event.check_in').count()));
    const liveCheckIn = makeEvent(device.id, credentialRef, 5, { event_type: 'check_in' });
    const liveResponse = await send(liveCheckIn, device.privateKey);
    const liveReceipt = await json(liveResponse);
    expect(liveResponse.status === 202 && liveReceipt.outcome === 'accepted', 'controlled dashboard-refresh check-in was not persisted.');
    const retryResponse = await send(liveCheckIn, device.privateKey);
    const retryReceipt = await json(retryResponse);
    expect(retryResponse.status === 200 && retryReceipt.duplicate === true && retryReceipt.receipt_id === liveReceipt.receipt_id, 'retry did not return the original dashboard-refresh receipt.');
    expect(await count(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_id', device.id).eq('device_event_id', liveCheckIn.event_id)) === 1, 'dashboard-refresh check-in was persisted more than once.');
    for (let index = 0; index < openPages.length; index += 1) {
      const page = openPages[index];
      const panel = page.locator('[data-testid="school-entry-panel"]');
      await panel.locator('.school-entry-refresh').click();
      await page.waitForFunction((previous) => {
        const root = document.querySelector('[data-testid="school-entry-panel"]');
        return root?.getAttribute('data-loaded') === 'true' && root.querySelectorAll('.school-entry-event.check_in').length > previous;
      }, previousCheckIns[index], { timeout: 10000 });
      expect(await panel.locator('.school-entry-event.check_in').count() === previousCheckIns[index] + 1, 'retry rendered a duplicate school-entry event.');
    }

    await parent.context().setOffline(true);
    await parent.evaluate(() => window.dispatchEvent(new Event('offline')));
    await parent.locator('[data-testid="school-entry-panel"][data-connection-state="offline"]').waitFor({ timeout: 10000 });
    await parent.context().setOffline(false);
    await parent.evaluate(() => window.dispatchEvent(new Event('online')));
    await parent.locator('[data-testid="school-entry-panel"][data-connection-state="online"]').waitFor({ timeout: 10000 });
    expect(externalRequests.length === 0, `Dashboard test contacted a non-loopback endpoint: ${externalRequests.join(', ')}`);
    console.log(`PASS local Parent/Teacher/Principal dashboard reads, child-switch isolation, Hindi/Marathi labels, changed persisted event visible after explicit refresh in all roles, retry rendered once, offline recovery and 390px overflow check. Synthetic UI screenshots: ${screenshotDirectory}`);
  } finally {
    await Promise.all(contexts.map((roleContext) => roleContext.close()));
    await browser.close();
  }
}

async function cleanup() {
  if (created.devices.length) await must(admin.from('device_event_receipts').delete().in('device_id', created.devices));
  if (created.devices.length) await must(admin.from('school_entry_events').delete().in('device_id', created.devices));
  if (created.credentials.length) await must(admin.from('student_credentials').delete().in('id', created.credentials));
  if (created.devices.length) await must(admin.from('school_devices').delete().in('id', created.devices));
  if (created.schools.length) await must(admin.from('audit_events').delete().in('school_id', created.schools));
  if (created.students.length) await must(admin.from('parent_student_links').delete().in('student_id', created.students));
  if (created.classes.length) await must(admin.from('teacher_class_assignments').delete().in('class_id', created.classes));
  if (created.students.length) await must(admin.from('students').delete().in('id', created.students));
  if (created.classes.length) await must(admin.from('classes').delete().in('id', created.classes));
  for (const id of created.users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw error; }
  if (created.schools.length) await must(admin.from('schools').delete().in('id', created.schools));
}

try {
  const apiHealth = await fetch(new URL('/auth/v1/health', supabaseUrl));
  expect(apiHealth.ok, 'local Supabase Auth health endpoint is unavailable');
  const appHealth = await fetch(parsedTestUrl);
  expect(appHealth.ok, 'local Schovera app is unavailable; start npm run dev:rfid-local first');
  const remoteHostRejected = await postWithRawHost('schovera.vercel.app');
  expect(remoteHostRejected === 404, 'local ingestion accepted a non-loopback Host header');

  const schoolA = (await must(admin.from('schools').insert({ name: `Synthetic RFID School A ${suffix}`, code: `RFID-A-${suffix}`, timezone: 'Asia/Kolkata' }).select('id').single())).id;
  const schoolB = (await must(admin.from('schools').insert({ name: `Synthetic RFID School B ${suffix}`, code: `RFID-B-${suffix}`, timezone: 'Asia/Kolkata' }).select('id').single())).id;
  created.schools.push(schoolA, schoolB);
  const principalA = await createUser('principal', schoolA);
  const teacherA = await createUser('teacher', schoolA);
  const parentA = await createUser('parent', schoolA);
  const principalB = await createUser('principal', schoolB);
  const classA = await createClass(schoolA, 'A');
  const classUnassigned = await createClass(schoolA, 'B');
  const classB = await createClass(schoolB, 'A');
  const studentLinked = await createStudent(schoolA, classA, `L-${suffix}`);
  const studentUnlinked = await createStudent(schoolA, classA, `U-${suffix}`);
  const studentSibling = await createStudent(schoolA, classA, `S-${suffix}`);
  const studentUnassigned = await createStudent(schoolA, classUnassigned, `X-${suffix}`);
  const studentOtherSchool = await createStudent(schoolB, classB, `Z-${suffix}`);
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: teacherA.id, class_id: classA }));
  await must(admin.from('parent_student_links').insert({ parent_id: parentA.id, student_id: studentLinked, status: 'active' }));
  await must(admin.from('parent_student_links').insert({ parent_id: parentA.id, student_id: studentSibling, status: 'active' }));
  const deviceA = await provision(principalA, `Local synthetic gate ${suffix}`);
  const refLinked = `synth-linked-${suffix}`;
  const refUnlinked = `synth-unlinked-${suffix}`;
  const refUnassigned = `synth-unassigned-${suffix}`;
  const refOtherSchool = `synth-other-school-${suffix}`;
  const credentialLinkedId = await issue(principalA, studentLinked, refLinked);
  const credentialUnlinkedId = await issue(principalA, studentUnlinked, refUnlinked);
  const credentialUnassignedId = await issue(principalA, studentUnassigned, refUnassigned);
  await issue(principalB, studentOtherSchool, refOtherSchool);
  const attendanceBefore = await count(admin.from('attendance_records').select('id', { count: 'exact', head: true }).in('student_id', [studentLinked, studentUnlinked, studentUnassigned, studentOtherSchool]));
  expect(attendanceBefore === 0, 'test students unexpectedly have ordinary attendance rows');

  await runSimulatorAgainstLocalApi(deviceA, refLinked);

  const first = makeEvent(deviceA.id, refLinked, 3, { event_type: 'check_in' });
  const firstResponse = await send(first, deviceA.privateKey);
  const firstResult = await json(firstResponse);
  expect(firstResponse.status === 202 && firstResult.outcome === 'accepted', 'synthetic check-in was not accepted');
  expect(!JSON.stringify(firstResult).includes('Synthetic RFID') && !JSON.stringify(firstResult).includes(refLinked), 'API leaked student/credential details');
  const exactRetry = await send(first, deviceA.privateKey);
  const exactRetryResult = await json(exactRetry);
  expect(exactRetry.status === 200 && exactRetryResult.duplicate === true && exactRetryResult.receipt_id === firstResult.receipt_id, 'exact retry did not return original receipt');
  const conflict = await send({ ...first, event_type: 'check_out' }, deviceA.privateKey);
  expect(conflict.status === 409, 'changed payload reuse was not rejected as conflict');
  const firstEventCount = await count(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_id', deviceA.id).eq('device_event_id', first.event_id));
  expect(firstEventCount === 1, 'retry/conflict created more than one accepted event');
  const extraFieldResponse = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...first, school_id: schoolB }) });
  expect(extraFieldResponse.status === 400, 'unexpected school identity field was not rejected');
  const badTypeResponse = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...first, event_type: 'arrival' }) });
  expect(badTypeResponse.status === 400, 'invalid event type was not rejected');
  const oversizedResponse = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"padding":"${'x'.repeat(17 * 1024)}"}` });
  expect(oversizedResponse.status === 413, 'oversized body was not rejected');

  const second = makeEvent(deviceA.id, refLinked, 4, { event_type: 'check_out' });
  const secondResponse = await send(second, deviceA.privateKey);
  expect(secondResponse.status === 202 && (await json(secondResponse)).outcome === 'accepted', 'synthetic check-out was not accepted');
  await verifyDashboardViews({ parent: parentA.email, parentId: parentA.id, childId: studentLinked, siblingName: `Synthetic RFID S-${suffix}`, teacher: teacherA.email, principal: principalA.email }, `Synthetic RFID L-${suffix}`, deviceA, refLinked);
  const nonce = randomUUID();
  const replayBase = makeEvent(deviceA.id, refLinked, 6);
  const replayFirst = await send(replayBase, deviceA.privateKey, { nonce });
  expect(replayFirst.status === 202, 'fresh request nonce was unexpectedly rejected');
  const replaySecond = await send(makeEvent(deviceA.id, refLinked, 6), deviceA.privateKey, { nonce });
  expect(replaySecond.status === 409, 'reused request nonce was not rejected');
  expect((await send(makeEvent(deviceA.id, refLinked, 6), deviceA.privateKey, { badSignature: true })).status === 401, 'invalid signature was not rejected');
  expect((await send(makeEvent(deviceA.id, refLinked, 6), deviceA.privateKey, { timestamp: String(Date.now() - 600_001) })).status === 401, 'stale signed timestamp was not rejected');

  const parallelEvent = makeEvent(deviceA.id, refLinked, 7);
  const parallel = await Promise.all(Array.from({ length: 5 }, () => send(parallelEvent, deviceA.privateKey)));
  const parallelBodies = await Promise.all(parallel.map(json));
  expect(parallel.every((response) => [200, 202].includes(response.status)), 'concurrent exact retries returned an unexpected status');
  expect(new Set(parallelBodies.map((body) => body.receipt_id)).size === 1, 'concurrent exact retries created different receipts');
  const parallelCount = await count(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_id', deviceA.id).eq('device_event_id', parallelEvent.event_id));
  expect(parallelCount === 1, 'concurrent retries inserted duplicate raw events');

  const secondCredentialEvent = makeEvent(deviceA.id, refUnlinked, 8);
  expect((await send(secondCredentialEvent, deviceA.privateKey)).status === 202, 'unlinked-child synthetic event did not process');
  const unassignedEvent = makeEvent(deviceA.id, refUnassigned, 9);
  expect((await send(unassignedEvent, deviceA.privateKey)).status === 202, 'unassigned-class event did not process');
  const crossSchoolEvent = makeEvent(deviceA.id, refOtherSchool, 10);
  const crossSchoolResponse = await send(crossSchoolEvent, deviceA.privateKey);
  expect(crossSchoolResponse.status === 202 && (await json(crossSchoolResponse)).outcome === 'unmatched', 'cross-school credential did not resolve as unmatched');
  const unknownResponse = await send(makeEvent(deviceA.id, `unknown-${suffix}`, 11), deviceA.privateKey);
  expect(unknownResponse.status === 202 && (await json(unknownResponse)).outcome === 'unmatched', 'unknown credential did not return a generic unmatched receipt');
  const unmatchedRows = await must(admin.from('device_event_receipts').select('device_event_id,event_id,outcome').in('device_event_id', [crossSchoolEvent.event_id]));
  expect(unmatchedRows.length === 1 && unmatchedRows[0].event_id === null && unmatchedRows[0].outcome === 'unmatched', 'unmatched credential created a resolved event row');

  const serviceEvents = await must(admin.from('school_entry_events').select('id,student_id,device_event_id,observed_at,received_at,sequence_state,timestamp_quality').in('device_id', [deviceA.id]));
  created.eventRows.push(...serviceEvents.map((row) => row.id));
  const linkedEvent = serviceEvents.find((row) => row.device_event_id === first.event_id);
  expect(linkedEvent?.student_id === studentLinked && linkedEvent.observed_at && linkedEvent.received_at, 'persisted event lost resolved student or source/server timestamps');
  expect(linkedEvent.sequence_state === 'in_order', 'first event sequence state is incorrect');

  const parentRows = await must(parentA.client.from('school_entry_events').select('id,student_id'));
  expect(parentRows.some((row) => row.student_id === studentLinked), 'Parent cannot read linked child event');
  expect(!parentRows.some((row) => row.student_id === studentUnlinked || row.student_id === studentUnassigned), 'Parent read an unlinked child event');
  const teacherRows = await must(teacherA.client.from('school_entry_events').select('id,student_id'));
  expect(teacherRows.some((row) => row.student_id === studentLinked), 'assigned Teacher cannot read assigned-class event');
  expect(!teacherRows.some((row) => row.student_id === studentUnassigned), 'Teacher read an unassigned-class event');
  const principalRows = await must(principalA.client.from('school_entry_events').select('id,school_id'));
  expect(principalRows.length === serviceEvents.length && principalRows.every((row) => row.school_id === schoolA), 'Principal cannot read only own school events');
  const principalBRows = await must(principalB.client.from('school_entry_events').select('id,school_id'));
  expect(!principalBRows.some((row) => row.school_id === schoolA), 'cross-school Principal read another school event');
  const anonymous = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymousRead = await anonymous.from('school_entry_events').select('id');
  expect(Boolean(anonymousRead.error) || (anonymousRead.data?.length ?? 0) === 0, 'anonymous caller accessed protected events');
  const directInsert = await teacherA.client.from('school_entry_events').insert({ school_id: schoolA, student_id: studentLinked, device_id: deviceA.id,
    device_event_id: randomUUID(), event_type: 'check_in', observed_at: new Date().toISOString(), device_sequence: 99,
    sequence_state: 'in_order', timestamp_quality: 'within_tolerance', credential_version: 1 });
  expect(Boolean(directInsert.error), 'authenticated browser role could directly insert a raw event');
  const directCredentialRead = await teacherA.client.from('student_credentials').select('credential_ref');
  expect(Boolean(directCredentialRead.error) || (directCredentialRead.data?.length ?? 0) === 0, 'Teacher directly read credential mappings');
  const directCredentialInsert = await teacherA.client.from('student_credentials').insert({ school_id: schoolA, student_id: studentLinked,
    credential_ref: `forged-${suffix}`, credential_version: 1, created_by: teacherA.id });
  expect(Boolean(directCredentialInsert.error), 'authenticated browser role could directly insert a credential mapping');

  const outOfOrder = makeEvent(deviceA.id, refLinked, 2, { event_type: 'check_out' });
  const outOfOrderResponse = await send(outOfOrder, deviceA.privateKey);
  const outOfOrderResult = await json(outOfOrderResponse);
  expect(outOfOrderResponse.status === 202 && outOfOrderResult.sequence_state === 'out_of_order', 'out-of-order event was not retained and flagged');
  const reassignment = await must(principalA.client.rpc('revoke_student_credential', { p_credential_id: credentialLinkedId }));
  expect(!reassignment?.error, 'existing card credential revocation failed');
  const replacementRef = `synth-replacement-${suffix}`;
  await issue(principalA, studentLinked, replacementRef);
  const afterRevoke = await send(makeEvent(deviceA.id, refLinked, 12), deviceA.privateKey);
  expect(afterRevoke.status === 202 && (await json(afterRevoke)).outcome === 'unmatched', 'revoked credential created a resolved event');
  const historical = await must(admin.from('school_entry_events').select('student_id').eq('device_event_id', first.event_id).single());
  expect(historical.student_id === studentLinked, 'credential revocation/reissue changed historical attribution');
  await must(principalA.client.rpc('revoke_student_credential', { p_credential_id: credentialUnlinkedId }));
  await must(principalA.client.rpc('revoke_student_credential', { p_credential_id: credentialUnassignedId }));
  await issue(principalA, studentUnassigned, refUnlinked);
  const reassignedEvent = makeEvent(deviceA.id, refUnlinked, 13);
  const reassignedResponse = await send(reassignedEvent, deviceA.privateKey);
  expect(reassignedResponse.status === 202 && (await json(reassignedResponse)).outcome === 'accepted', 'revoked credential reference could not be reassigned');
  const originalOwner = await must(admin.from('school_entry_events').select('student_id').eq('device_event_id', secondCredentialEvent.event_id).single());
  const newOwner = await must(admin.from('school_entry_events').select('student_id').eq('device_event_id', reassignedEvent.event_id).single());
  expect(originalOwner.student_id === studentUnlinked && newOwner.student_id === studentUnassigned, 'credential reassignment rewrote historical ownership or failed to resolve new owner');
  const revokedCard = await send(makeEvent(deviceA.id, refUnassigned, 14), deviceA.privateKey);
  expect(revokedCard.status === 202 && (await json(revokedCard)).outcome === 'unmatched', 'revoked card was not handled as unmatched');
  await must(principalA.client.rpc('revoke_school_device', { p_device_id: deviceA.id }));
  const revokedDevice = await send(makeEvent(deviceA.id, replacementRef, 15), deviceA.privateKey);
  expect(revokedDevice.status === 403, 'revoked device remained able to submit');

  const attendanceAfter = await count(admin.from('attendance_records').select('id', { count: 'exact', head: true }).in('student_id', [studentLinked, studentUnlinked, studentUnassigned, studentOtherSchool]));
  expect(attendanceAfter === 0, 'RFID ingestion mutated ordinary classroom attendance');
  console.log('PASS: synthetic check-in/check-out, signature/time/nonce protection, dedupe/conflict/concurrency, credential and device revocation, cross-school unmatched behavior, role RLS and no attendance writes.');
} finally {
  await cleanup();
  if (created.devices.length) {
    const receiptsLeft = await count(admin.from('device_event_receipts').select('id', { count: 'exact', head: true }).in('device_id', created.devices));
    const eventsLeft = await count(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).in('device_id', created.devices));
    const devicesLeft = await count(admin.from('school_devices').select('id', { count: 'exact', head: true }).in('id', created.devices));
    expect(receiptsLeft === 0 && eventsLeft === 0 && devicesLeft === 0, 'temporary RFID devices, events or receipts remain after cleanup');
  }
  if (created.credentials.length) {
    const credentialsLeft = await count(admin.from('student_credentials').select('id', { count: 'exact', head: true }).in('id', created.credentials));
    expect(credentialsLeft === 0, 'temporary RFID credential mappings remain after cleanup');
  }
  if (created.students.length) {
    const studentsLeft = await count(admin.from('students').select('id', { count: 'exact', head: true }).in('id', created.students));
    const linksLeft = await count(admin.from('parent_student_links').select('id', { count: 'exact', head: true }).in('student_id', created.students));
    expect(studentsLeft === 0 && linksLeft === 0, 'temporary RFID student or parent-link rows remain after cleanup');
  }
  if (created.classes.length) {
    const classesLeft = await count(admin.from('classes').select('id', { count: 'exact', head: true }).in('id', created.classes));
    const assignmentsLeft = await count(admin.from('teacher_class_assignments').select('id', { count: 'exact', head: true }).in('class_id', created.classes));
    expect(classesLeft === 0 && assignmentsLeft === 0, 'temporary RFID class or teacher-assignment rows remain after cleanup');
  }
  if (created.schools.length) {
    const schoolsLeft = await count(admin.from('schools').select('id', { count: 'exact', head: true }).in('id', created.schools));
    const auditLeft = await count(admin.from('audit_events').select('id', { count: 'exact', head: true }).in('school_id', created.schools));
    expect(schoolsLeft === 0 && auditLeft === 0, 'temporary RFID schools or audit rows remain after cleanup');
  }
  console.log('Local synthetic RFID records cleaned.');
}
