import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { ingestReaderSubmission, signReaderSubmission, hashReaderKey } from './rfid-gateway/ingress.mjs';
import { openGatewayDatabase } from './rfid-gateway/storage.mjs';
import { LocalSupabaseV2Transport } from './rfid-gateway/local-v2-transport.mjs';
import { canonicalEventV2, type DeviceEventV2 } from './rfid-simulator/event-v2';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

type Account = { id: string; email: string; client: SupabaseClient; token: string };
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const appUrl = process.env.SCHOVERA_TEST_URL ?? 'http://127.0.0.1:3000';
const browserPassword = `LocalGateway-${randomUUID()}!aA1`;
const suffix = randomUUID().slice(0, 8);
function expectValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const must = async <T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<Exclude<T, null>> => {
  const { data, error } = await query; if (error) throw new Error(error.message); return data as Exclude<T, null>;
};
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
let admin: SupabaseClient;
let schoolA: string; let schoolB: string; let classA: string; let classB: string;
let studentA: { id: string; name: string }; let studentB: { id: string; name: string };
let principalA: Account; let principalB: Account; let parentA: Account; let parentUnlinked: Account;
let teacherA: Account; let teacherUnassigned: Account;
let deviceId: string; let devicePrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
let assignmentA: string; let assignmentB: string; let capabilityA: string; let capabilityB: string;
let refA: string; let temporaryDirectory: string; let dbPath: string; let deviceKeyPath: string;
let readerId: string; let readerKey: string; let browser: Browser;
const created = { schools: [] as string[], classes: [] as string[], students: [] as string[], users: [] as string[], devices: [] as string[], credentials: [] as string[] };
const observedExternal = new Set<string>();

function requestLocal(urlText: string, pathname: string, body?: unknown, token?: string, method = 'POST'): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  const url = new URL(urlText);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('integration request target must be loopback HTTP');
  const raw = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ protocol: url.protocol, hostname: url.hostname, port: url.port || 80, method, path: pathname,
      agent: false, headers: { host: url.host, ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) }), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 20_000) { req.destroy(new Error('response too large')); return; } chunks.push(chunk); });
      res.on('end', () => { const status = res.statusCode ?? 0; if (status >= 300 && status < 400) { reject(new Error('loopback endpoint returned a redirect')); return; } resolve({ status, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }); });
    });
    req.setTimeout(8_000, () => req.destroy(new Error('loopback endpoint timeout')));
    req.on('error', reject); req.end(raw);
  });
}

async function createSchool(label: string): Promise<string> {
  const row = await must(admin.from('schools').insert({ name: `Synthetic Gateway ${label} ${suffix}`, code: `GW-${label}-${suffix}-${randomUUID().slice(0, 4)}` }).select('id').single());
  created.schools.push(row.id); return row.id;
}
async function createAccount(role: 'principal' | 'parent' | 'teacher', schoolId: string): Promise<Account> {
  const email = `${role}-${suffix}-${randomUUID().slice(0, 4)}@gateway-local.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: browserPassword, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('synthetic account creation failed');
  created.users.push(data.user.id);
  await must(admin.from('profiles').insert({ id: data.user.id, school_id: schoolId, email, full_name: `Synthetic ${role} ${suffix}`, role, active: true }));
  const client = createClient(dbUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password: browserPassword });
  if (login.error || !login.data.session) throw login.error ?? new Error('synthetic user sign-in failed');
  return { id: data.user.id, email, client, token: login.data.session.access_token };
}
async function createClass(schoolId: string, division: string): Promise<string> {
  const row = await must(admin.from('classes').insert({ school_id: schoolId, grade: '9', division: `${division}-${suffix}`, academic_year: 'GATEWAY-LOCAL-TEST' }).select('id').single());
  created.classes.push(row.id); return row.id;
}
async function createStudent(schoolId: string, classId: string, label: string): Promise<{ id: string; name: string }> {
  const name = `Synthetic Gateway Student ${label} ${suffix}`;
  const row = await must(admin.from('students').insert({ school_id: schoolId, class_id: classId, roll_number: `${label}-${suffix}`, full_name: name, active: true }).select('id').single());
  created.students.push(row.id); return { id: row.id, name };
}
async function issueCapability(principal: Account, assignmentId: string): Promise<string> {
  const response = await requestLocal(appUrl, '/api/device/v2/capabilities', { assignment_id: assignmentId, device_id: deviceId }, principal.token);
  if (response.status !== 200) throw new Error(`local capability issuance failed (${response.status})`);
  return JSON.parse(response.body).capability as string;
}

function localProcessEnv() {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH, Path: process.env.Path, PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    SCHOVERA_TEST_URL: new URL(appUrl).origin };
  // Deliberately do not inherit .env.local, Supabase service-role, issuer or AI keys into gateway child processes.
  return env;
}
function runGatewaySync(extra: string[] = []) {
  const cli = path.join(repoRoot, 'scripts', 'rfid-gateway', 'cli.mjs');
  const args = ['--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types', cli,
    'sync-v2', '--local-only', '--target', new URL(appUrl).origin, '--database', dbPath, '--device-key-file', deviceKeyPath, '--force', ...extra];
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, env: localProcessEnv(), encoding: 'utf8', timeout: 20_000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`gateway process failed (${result.status ?? 'no status'}): ${String(result.stderr ?? '').slice(0, 600)}`);
  if (result.stdout.includes(devicePrivateKey.export({ type: 'pkcs8', format: 'pem' }).toString()) || result.stdout.includes(serviceKey)) throw new Error('gateway output exposed private credentials');
  return JSON.parse(result.stdout) as { results: Array<Record<string, unknown>>; queue: Record<string, unknown> };
}

function queueEvent(event: DeviceEventV2) {
  const store = openGatewayDatabase(dbPath);
  try {
    const submission = { ...signReaderSubmission(event, { readerId, key: readerKey }), readerKey };
    const ack = ingestReaderSubmission(store, submission);
    if (ack.outcome !== 'recorded_locally' || ack.queue_state !== 'pending') throw new Error('gateway did not durably accept the synthetic event');
    const row = store.getEvent(event.device_id, event.event_id);
    expectValue(row?.canonical_payload === canonicalEventV2(event), 'gateway altered the immutable v2 payload');
    return ack;
  } finally { store.close(); }
}

function eventV2(sequence: number, assignment: string, capability: string, credentialRef: string, eventId = randomUUID()): DeviceEventV2 {
  return { schema_version: 2, event_id: eventId, device_id: deviceId, credential_ref: credentialRef,
    credential_assignment_id: assignment, credential_assignment_version: sequence === 3 ? 2 : 1,
    assignment_capability: capability, event_type: 'check_in', observed_at: new Date().toISOString(), device_sequence: sequence };
}

async function loginAndCheck(account: Account, expectedTexts: string[], forbiddenTexts: string[] = []) {
  const context = await browser.newContext({ locale: 'en-US' });
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname) || ['about:', 'data:'].includes(requestUrl.protocol)) return route.continue();
    observedExternal.add(`${requestUrl.protocol}//${requestUrl.host}`); return route.abort();
  });
  const page = await context.newPage();
  await page.goto(new URL('/', appUrl).href, { waitUntil: 'domcontentloaded' });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill(account.email);
    await page.locator('input[type="password"]').fill(browserPassword);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
  }
  const panel = page.locator('[data-testid="school-entry-panel"]');
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="school-entry-panel"]')?.getAttribute('data-loaded') === 'true', undefined, { timeout: 20_000 });
  for (const text of expectedTexts) await panel.locator('.school-entry-event').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 12_000 });
  for (const text of forbiddenTexts) await expect.poll(() => panel.getByText(text, { exact: false }).count()).toBe(0);
  await context.close();
}

async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  if (admin) {
    if (created.devices.length) {
      const receipts = await admin.from('device_event_receipts').delete().in('device_id', created.devices);
      const events = await admin.from('school_entry_events').delete().in('device_id', created.devices);
      const devices = await admin.from('school_devices').delete().in('id', created.devices);
      if (receipts.error || events.error || devices.error) throw new Error('synthetic device/event cleanup failed');
    }
    if (created.credentials.length && (await admin.from('student_credentials').delete().in('id', created.credentials)).error) throw new Error('synthetic credentials cleanup failed');
    if (created.schools.length && (await admin.from('rfid_capability_signing_keys').delete().in('school_id', created.schools)).error) throw new Error('synthetic key cleanup failed');
    if (created.students.length) {
      const links = await admin.from('parent_student_links').delete().in('student_id', created.students);
      const students = await admin.from('students').delete().in('id', created.students);
      if (links.error || students.error) throw new Error('synthetic students cleanup failed');
    }
    if (created.classes.length) {
      const assignments = await admin.from('teacher_class_assignments').delete().in('class_id', created.classes);
      if (assignments.error) throw new Error('synthetic teacher assignments cleanup failed');
    }
    if (created.schools.length && (await admin.from('audit_events').delete().in('school_id', created.schools)).error) throw new Error('synthetic audits cleanup failed');
    if (created.users.length && (await admin.from('profiles').delete().in('id', created.users)).error) throw new Error('synthetic profiles cleanup failed');
    if (created.classes.length && (await admin.from('classes').delete().in('id', created.classes)).error) throw new Error('synthetic classes cleanup failed');
    for (const id of created.users) if ((await admin.auth.admin.deleteUser(id)).error) throw new Error('synthetic Auth cleanup failed');
    if (created.schools.length && (await admin.from('schools').delete().in('id', created.schools)).error) throw new Error('synthetic schools cleanup failed');
  }
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}

describe('Task 32H gateway to loopback local Supabase', () => {
  beforeAll(async () => {
    assertLocalTestEnvironment(process.env);
    const target = new URL(appUrl);
    expectValue(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'app target must be loopback HTTP');
    const health = await requestLocal(appUrl, '/', undefined, undefined, 'GET');
    expectValue(health.status === 200, 'local Schovera app is not responding on the configured loopback URL');
    admin = createClient(dbUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    browser = await chromium.launch({ headless: true });
    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'schovera-task32h-'));
    dbPath = path.join(temporaryDirectory, 'gateway.sqlite');
    deviceKeyPath = path.join(temporaryDirectory, 'synthetic-device-private.pem');
    schoolA = await createSchool('A'); schoolB = await createSchool('B');
    principalA = await createAccount('principal', schoolA); principalB = await createAccount('principal', schoolB);
    parentA = await createAccount('parent', schoolA); parentUnlinked = await createAccount('parent', schoolA);
    teacherA = await createAccount('teacher', schoolA); teacherUnassigned = await createAccount('teacher', schoolA);
    classA = await createClass(schoolA, 'A'); classB = await createClass(schoolA, 'B');
    studentA = await createStudent(schoolA, classA, 'A'); studentB = await createStudent(schoolA, classB, 'B');
    await must(admin.from('parent_student_links').insert({ parent_id: parentA.id, student_id: studentA.id, status: 'active' }));
    await must(admin.from('teacher_class_assignments').insert({ teacher_id: teacherA.id, class_id: classA }));
    const pair = generateKeyPairSync('ed25519'); devicePrivateKey = pair.privateKey;
    const devicePublicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    deviceId = await must(principalA.client.rpc('provision_school_device', { p_label: `synthetic gateway ${suffix}`, p_hardware_type: 'local_simulator', p_verification_public_key: devicePublicPem }));
    created.devices.push(deviceId);
    const registration = await requestLocal(appUrl, '/api/device/v2/capability-keys', undefined, principalA.token);
    expectValue(registration.status === 200, 'synthetic Principal could not register local issuer key');
    const rejected = await requestLocal(appUrl, '/api/device/v2/capability-keys', undefined, parentA.token);
    expectValue(rejected.status === 403, 'non-Principal registered a capability issuer key');
    refA = `gateway-ref-${suffix}`;
    assignmentA = await must(principalA.client.rpc('issue_student_credential', { p_student_id: studentA.id, p_credential_ref: refA, p_credential_version: 1 }));
    created.credentials.push(assignmentA);
    capabilityA = await issueCapability(principalA, assignmentA);
    const publicClient = createClient(dbUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const publicKeyRegistration = await publicClient.from('rfid_capability_signing_keys').select('key_id').limit(1);
    expect(publicKeyRegistration.error || publicKeyRegistration.data?.length === 0).toBe(true);
    readerId = randomUUID(); readerKey = randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64);
    const store = openGatewayDatabase(dbPath);
    store.registerReader({ readerId, deviceId, tokenHash: hashReaderKey(readerKey), now: new Date().toISOString() });
    store.close();
    writeFileSync(deviceKeyPath, devicePrivateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { flag: 'wx', mode: 0o600 });
  }, 120_000);
  afterAll(cleanup, 120_000);

  it('persists offline, restarts, syncs immutable v2, handles reassignment unresolved, and proves RLS/UI', async () => {
    const eventA = eventV2(1, assignmentA, capabilityA, refA);
    const localAck = queueEvent(eventA);
    expect(localAck).toMatchObject({ queue_state: 'pending', outcome: 'recorded_locally', cloud_delivered: false });
    const offline = runGatewaySync(['--simulate-offline']);
    expect(offline.results[0]).toMatchObject({ event_id: eventA.event_id, state: 'pending', error_class: 'simulated_offline' });
    let reopened = openGatewayDatabase(dbPath);
    expect(reopened.getEvent(deviceId, eventA.event_id)).toMatchObject({ queue_state: 'pending', local_receipt_id: localAck.local_receipt_id, canonical_payload: canonicalEventV2(eventA) });
    reopened.close();

    const synced = runGatewaySync();
    expect(synced.results[0]).toMatchObject({ event_id: eventA.event_id, state: 'delivered_to_local_server', outcome: 'accepted' });
    reopened = openGatewayDatabase(dbPath);
    const delivered = reopened.getEvent(deviceId, eventA.event_id);
    expect(delivered).toMatchObject({ queue_state: 'delivered', remote_outcome: 'accepted', remote_receipt_id: expect.any(String), remote_received_at: expect.any(String), canonical_payload: canonicalEventV2(eventA) });
    expect(delivered.clock_quality).toBe('ok');
    reopened.close();
    expect(await must(admin.from('school_entry_events').select('id,student_id,credential_assignment_id').eq('device_event_id', eventA.event_id).single()))
      .toMatchObject({ student_id: studentA.id, credential_assignment_id: assignmentA });

    const eventDelayed = eventV2(2, assignmentA, capabilityA, refA);
    queueEvent(eventDelayed);
    expect(runGatewaySync(['--simulate-offline']).results[0].state).toBe('pending');
    reopened = openGatewayDatabase(dbPath);
    expect(reopened.getEvent(deviceId, eventDelayed.event_id).canonical_payload).toBe(canonicalEventV2(eventDelayed));
    reopened.close();
    await must(principalA.client.rpc('revoke_student_credential', { p_credential_id: assignmentA }));
    assignmentB = await must(principalA.client.rpc('issue_student_credential', { p_student_id: studentB.id, p_credential_ref: refA, p_credential_version: 2 }));
    created.credentials.push(assignmentB);
    capabilityB = await issueCapability(principalA, assignmentB);
    const revokedSync = runGatewaySync();
    expect(revokedSync.results[0]).toMatchObject({ event_id: eventDelayed.event_id, state: 'attention_required', outcome: 'unresolved' });
    expect(await countRows(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_event_id', eventDelayed.event_id))).toBe(0);

    const eventB = eventV2(3, assignmentB, capabilityB, refA);
    queueEvent(eventB);
    const syncB = runGatewaySync();
    expect(syncB.results[0]).toMatchObject({ event_id: eventB.event_id, state: 'delivered_to_local_server', outcome: 'accepted' });
    expect(await must(admin.from('school_entry_events').select('student_id,credential_assignment_id').eq('device_event_id', eventB.event_id).single()))
      .toMatchObject({ student_id: studentB.id, credential_assignment_id: assignmentB });

    const gatewayTransport = new LocalSupabaseV2Transport({ target: appUrl, devicePrivateKey });
    const duplicateReceipt = await gatewayTransport.send(eventA);
    expect(duplicateReceipt.duplicate).toBe(true);
    await expect(gatewayTransport.send({ ...eventA, event_type: 'check_out' })).rejects.toMatchObject({ errorClass: 'server_event_or_nonce_conflict' });
    expect(await countRows(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_event_id', eventA.event_id))).toBe(1);

    const parentRows = await must(parentA.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]));
    expect(parentRows.map((row) => row.device_event_id)).toEqual([eventA.event_id]);
    const teacherRows = await must(teacherA.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]));
    expect(teacherRows.map((row) => row.device_event_id)).toEqual([eventA.event_id]);
    expect(await must(principalA.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]))).toHaveLength(2);
    expect(await must(principalB.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]))).toHaveLength(0);
    expect(await must(parentUnlinked.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]))).toHaveLength(0);
    expect(await must(teacherUnassigned.client.from('school_entry_events').select('device_event_id').in('device_event_id', [eventA.event_id, eventB.event_id]))).toHaveLength(0);

    await loginAndCheck(parentA, ['Check-in recorded'], [studentB.name]);
    await loginAndCheck(teacherA, [studentA.name], [studentB.name]);
    await loginAndCheck(principalA, [studentA.name, studentB.name]);
    await loginAndCheck(principalB, [], [studentA.name, studentB.name]);
    await loginAndCheck(parentUnlinked, [], [studentA.name, studentB.name]);
    await loginAndCheck(teacherUnassigned, [], [studentA.name, studentB.name]);
    expect(observedExternal.size).toBe(0);
    const attendance = await must(admin.from('attendance_records').select('id').in('student_id', [studentA.id, studentB.id]));
    expect(attendance).toHaveLength(0);
  }, 180_000);
});

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query; if (error) throw new Error(error.message); return count ?? 0;
}
