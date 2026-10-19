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

type Account = { id: string; email: string; role: 'principal' | 'parent' | 'teacher'; client: SupabaseClient; token: string };
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
let cleanupStarted = false;
const created = { schools: [] as string[], classes: [] as string[], students: [] as string[], users: [] as string[], devices: [] as string[], credentials: [] as string[] };
const observedExternal = new Set<string>();
const parentLinkCheckpoints: Array<{ point: string; rows: number | null; errorCode: string | null }> = [];
const fixtureSnapshots: Array<Record<string, unknown>> = [];
function tokenFacts(token: string, userId: string) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub?: string; role?: string; exp?: number; iss?: string; aud?: string | string[]; aal?: string; session_id?: string; app_metadata?: { provider?: string; providers?: string[]; role?: string } };
    return { parentMatches: claims.sub === userId, authenticatedRole: claims.role === 'authenticated', unexpired: (claims.exp ?? 0) > Math.floor(Date.now() / 1000), iss: claims.iss, aud: claims.aud, aal: claims.aal, sessionIdPresent: Boolean(claims.session_id), appRole: claims.app_metadata?.role, provider: claims.app_metadata?.provider };
  } catch { return { parentMatches: false, authenticatedRole: false, unexpired: false }; }
}

function uuidSql(value: string | undefined): string {
  if (!value) return 'NULL::uuid';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('fixture diagnostic expected a UUID');
  return `'${value}'::uuid`;
}

async function snapshotFixture(checkpoint: string, browserToken = '', parentContext: Account | undefined = parentA) {
  const parentId = parentContext?.id;
  const profileId = uuidSql(parentId);
  const schoolId = uuidSql(schoolA);
  const studentId = uuidSql(studentA?.id);
  const classId = uuidSql(classA);
  const sql = `SELECT jsonb_build_object(
    'database', current_database(), 'schema', current_schema(), 'server_address', inet_server_addr()::text, 'server_port', inet_server_port(),
    'parent_profile', (SELECT jsonb_build_object('id',id,'school_id',school_id,'role',role,'active',active) FROM public.profiles WHERE id=${profileId}),
    'school', (SELECT jsonb_build_object('id',id,'timezone',timezone) FROM public.schools WHERE id=${schoolId}),
    'student', (SELECT jsonb_build_object('id',id,'school_id',school_id,'class_id',class_id,'active',active) FROM public.students WHERE id=${studentId}),
    'class', (SELECT jsonb_build_object('id',id,'school_id',school_id) FROM public.classes WHERE id=${classId}),
    'parent_link', (SELECT jsonb_build_object('id',id,'parent_id',parent_id,'student_id',student_id,'status',status) FROM public.parent_student_links WHERE parent_id=${profileId} AND student_id=${studentId}),
    'matching_counts', jsonb_build_object(
      'profiles', (SELECT count(*) FROM public.profiles WHERE id=${profileId}),
      'schools', (SELECT count(*) FROM public.schools WHERE id=${schoolId}),
      'students', (SELECT count(*) FROM public.students WHERE id=${studentId}),
      'classes', (SELECT count(*) FROM public.classes WHERE id=${classId}),
      'parent_student_links', (SELECT count(*) FROM public.parent_student_links WHERE parent_id=${profileId} AND student_id=${studentId})
    ))::text`;
  const independent = spawnSync('docker', ['exec', 'supabase_db_Schovera', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true });
  if (independent.error || independent.status !== 0 || !independent.stdout.trim()) throw new Error(`independent local PostgreSQL fixture snapshot failed (${independent.status ?? 'no status'})`);
  const physical = JSON.parse(independent.stdout.trim()) as Record<string, unknown>;
  const rls: Record<string, unknown> = { direct_client: null, actual_browser_token: null };
  if (parentContext) {
    const profile = await parentContext.client.from('profiles').select('id,school_id,role,active').eq('id', parentContext.id);
    const links = await parentContext.client.from('parent_student_links').select('id,parent_id,student_id,status').eq('parent_id', parentContext.id);
    const nested = await parentContext.client.from('parent_student_links').select('id,parent_id,student_id,status,students(id,school_id,class_id,active,classes(id,school_id))').eq('parent_id', parentContext.id).eq('status', 'active');
    const students = studentA ? await parentContext.client.from('students').select('id,school_id,class_id,active').eq('id', studentA.id) : null;
    const classes = classA ? await parentContext.client.from('classes').select('id,school_id').eq('id', classA) : null;
    rls.direct_client = { profileRows: profile.data?.length ?? null, profileRole: profile.data?.[0]?.role ?? null, profileActive: profile.data?.[0]?.active ?? null,
      linkRows: links.data?.length ?? null, linkStatuses: links.data?.map((row) => row.status) ?? null,
      nestedLinkRows: nested.data?.length ?? null, nestedStudentPresent: nested.data?.map((row) => Boolean(row.students)) ?? null,
      studentRows: students?.data?.length ?? null, classRows: classes?.data?.length ?? null,
      errors: [profile.error?.code, links.error?.code, nested.error?.code, students?.error?.code, classes?.error?.code].filter(Boolean) };
  }
  if (browserToken) {
    const read = async (table: string, params: URLSearchParams) => {
      const response = await fetch(`${dbUrl}/rest/v1/${table}?${params}`, { headers: { apikey: publicKey, authorization: `Bearer ${browserToken}` } });
      let body: unknown; try { body = await response.json(); } catch { body = null; }
      return { status: response.status, rows: Array.isArray(body) ? body.length : null, errorCode: (body as { code?: string } | null)?.code ?? null };
    };
    const browserParent = new URLSearchParams({ id: `eq.${parentId}`, select: 'id,school_id,role,active' });
    const browserLinks = new URLSearchParams({ parent_id: `eq.${parentId}`, select: 'id,parent_id,student_id,status' });
    const browserNested = new URLSearchParams({ parent_id: `eq.${parentId}`, status: 'eq.active', select: 'id,parent_id,student_id,status,students(id,school_id,class_id,active,classes(id,school_id))' });
    const browserStudents = new URLSearchParams({ id: `eq.${studentA?.id ?? ''}`, select: 'id,school_id,class_id,active' });
    const browserClasses = new URLSearchParams({ id: `eq.${classA ?? ''}`, select: 'id,school_id' });
    rls.actual_browser_token = { profile: await read('profiles', browserParent), links: await read('parent_student_links', browserLinks),
      nestedLinks: await read('parent_student_links', browserNested), students: studentA ? await read('students', browserStudents) : null,
      classes: classA ? await read('classes', browserClasses) : null };
  }
  const physicalRow = (key: string) => physical[key] as Record<string, unknown> | null;
  const directRls = rls.direct_client as Record<string, unknown>;
  const browserRls = rls.actual_browser_token as Record<string, Record<string, unknown>> | null;
  const snapshot = { runId: suffix, checkpoint, parentScenario: parentContext?.id === parentA?.id ? 'linked-parent' : parentContext ? 'other-parent' : 'no-parent', cleanupStarted,
    appTarget: new URL(appUrl).origin,
    supabaseHttpTarget: new URL(dbUrl).origin, independentPostgresConnection: 'fresh docker exec → supabase_db_Schovera / postgres', physical, rls };
  fixtureSnapshots.push(snapshot);
  console.log(`[fixture-state] ${JSON.stringify({ runId: suffix, checkpoint, parentScenario: snapshot.parentScenario, cleanupStarted,
    db: { database: physical.database, schema: physical.schema, httpTarget: new URL(dbUrl).origin, postgresConnection: 'fresh local Docker psql' },
    ids: { parent: physicalRow('parent_profile')?.id ?? parentId ?? null, school: physicalRow('school')?.id ?? schoolA ?? null,
      student: physicalRow('student')?.id ?? studentA?.id ?? null, class: physicalRow('class')?.id ?? classA ?? null,
      link: physicalRow('parent_link')?.id ?? null },
    physical: { rows: physical.matching_counts, parent: physicalRow('parent_profile'), student: physicalRow('student'), link: physicalRow('parent_link') },
    rls: directRls, browser: browserRls })}`);
  return snapshot;
}

function expectCompleteParentFixture(snapshot: Record<string, unknown> | undefined, label: string) {
  expect(snapshot, `${label}: diagnostic snapshot exists`).toBeDefined();
  const physical = snapshot?.physical as { matching_counts?: Record<string, number> } | undefined;
  expect(physical?.matching_counts, `${label}: physical fixture rows`).toMatchObject({ profiles: 1, schools: 1, students: 1, classes: 1, parent_student_links: 1 });
}

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
  return { id: data.user.id, email, role, client, token: login.data.session.access_token };
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
  const diagnostics: string[] = [];
  let actualParentQuery = '';
  let actualBrowserToken = '';
  let firstParentResponseSnapshot: Promise<unknown> | null = null;
  context.on('requestfailed', (request) => diagnostics.push(`failed ${request.method()} ${new URL(request.url()).host}${new URL(request.url()).pathname}`));
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname) || ['about:', 'data:'].includes(requestUrl.protocol)) return route.continue();
    observedExternal.add(`${requestUrl.protocol}//${requestUrl.host}`); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => diagnostics.push(`pageerror ${error.message.slice(0, 160)}`));
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.push(`console ${message.text().slice(0, 160)}`); });
  page.on('request', (request) => {
    const u = new URL(request.url());
    if (u.port !== '54321') return;
    if (u.pathname === '/rest/v1/parent_student_links') {
      const authorization = request.headers().authorization ?? '';
      const browserToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      actualParentQuery = request.url();
      actualBrowserToken = browserToken;
      diagnostics.push(`parent filter matches account=${u.searchParams.get('parent_id') === `eq.${account.id}`}, status active=${u.searchParams.get('status') === 'eq.active'}, projection expected=${u.searchParams.get('select') === 'students(*,classes(grade,division))'}, api key matches=${request.headers()['apikey'] === publicKey}, bearer=${Boolean(browserToken)}, request-token-equals-direct-token=${browserToken === account.token}, request claims=${JSON.stringify(tokenFacts(browserToken, account.id))}, direct claims=${JSON.stringify(tokenFacts(account.token, account.id))}`);
    }
    diagnostics.push(`request ${request.method()} ${u.pathname}`);
  });
  page.on('response', async (response) => {
    const u = new URL(response.url());
    if (u.port !== '54321') return;
    if (response.status() >= 400) diagnostics.push(`response ${response.status()} ${u.pathname}`);
    if (u.pathname === '/rest/v1/parent_student_links') {
      try {
        const body = await response.json() as Array<{ students?: unknown }>;
        diagnostics.push(`parent-links rows=${body.length} nested-student-null=${body.filter((row) => !row.students).length}`);
        if (account.role === 'parent' && !firstParentResponseSnapshot) {
          const checkpoint = body.length === 0 ? 'first-browser-parent-query-zero' : 'first-browser-parent-query-result';
          firstParentResponseSnapshot = snapshotFixture(checkpoint, actualBrowserToken, account)
            .catch((error) => ({ snapshotError: error instanceof Error ? error.message : 'unknown snapshot error' }));
        }
      } catch { diagnostics.push('parent-links response unreadable'); }
    }
    if (u.pathname === '/rest/v1/profiles') {
      try {
        const body = await response.json() as Array<{ role?: string }>;
        diagnostics.push(`profile response roles=${body.map((row) => row.role ?? 'missing').join(',') || 'empty'}`);
      } catch { diagnostics.push('profile response unreadable'); }
    }
    if (u.pathname === '/auth/v1/user') {
      try {
        const body = await response.json() as { id?: string };
        diagnostics.push(`browser-auth-user-matches-account=${body.id === account.id}`);
      } catch { diagnostics.push('browser-auth-user response unreadable'); }
    }
  });
  await page.goto(new URL('/', appUrl).href, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill(account.email);
    await page.locator('input[type="password"]').fill(browserPassword);
    if (account.role === 'parent') await snapshotFixture('immediately-before-parent-browser-login', account.token, account);
    const parentQueryResponse = account.role === 'parent'
      ? page.waitForResponse((response) => new URL(response.url()).port === '54321' && new URL(response.url()).pathname === '/rest/v1/parent_student_links')
      : null;
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    if (parentQueryResponse) await parentQueryResponse;
  }
  const panel = page.locator('[data-testid="school-entry-panel"]');
  try { await panel.waitFor({ state: 'visible', timeout: 20_000 }); }
  catch { throw new Error(`dashboard panel did not render for synthetic role; url=${new URL(page.url()).pathname}, title=${await page.title()}, body=${(await page.locator('body').innerText()).slice(0, 700)}, network=${diagnostics.join('; ')}`); }
  const parentHasNoLinkedChildren = account.role === 'parent' && account.id !== parentA?.id;
  const teacherHasNoAssignedClasses = account.role === 'teacher' && account.id === teacherUnassigned?.id;
  const hasNoEntryContext = parentHasNoLinkedChildren || teacherHasNoAssignedClasses;
  try {
    if (hasNoEntryContext) {
      const prompt = parentHasNoLinkedChildren ? 'Choose a linked child to view their records.' : 'Choose an assigned class to view its records.';
      await panel.getByText(prompt, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
      expect(await panel.locator('.school-entry-event').count()).toBe(0);
    } else {
      await page.waitForFunction(() => {
        const panel = document.querySelector('[data-testid="school-entry-panel"]');
        return panel?.getAttribute('data-loaded') === 'true' || Boolean(panel?.querySelector('[role="alert"]'));
      }, undefined, { timeout: 20_000 });
    }
  } catch {
    if (firstParentResponseSnapshot) await firstParentResponseSnapshot;
    const nodeProbe = async (token: string) => {
      const response = await fetch(actualParentQuery, { headers: { apikey: publicKey, authorization: `Bearer ${token}` } });
      let body: unknown; try { body = await response.json(); } catch { body = null; }
      const errorCode = typeof body === 'object' && body !== null && 'code' in body ? String(body.code) : null;
      return { status: response.status, rows: Array.isArray(body) ? body.length : null, errorCode };
    };
    const currentSession = await account.client.auth.getSession();
    const activeClientToken = currentSession.data.session?.access_token ?? '';
    const directClientQuery = await account.client.from('parent_student_links').select('students(*,classes(grade,division))').eq('parent_id', account.id).eq('status', 'active');
    const directClientResult = { rows: directClientQuery.data?.length ?? null, errorCode: directClientQuery.error?.code ?? null, currentSessionTokenEqualsCaptured: activeClientToken === account.token };
    const browserProbes = await page.evaluate(async ({ queryUrl, key, tokenA, tokenB }) => {
      const run = async (token: string) => {
        const response = await fetch(queryUrl, { headers: { apikey: key, authorization: `Bearer ${token}` } });
        let body; try { body = await response.json(); } catch { body = null; }
        return { status: response.status, rows: Array.isArray(body) ? body.length : null, errorCode: (body as { code?: string } | null)?.code ?? null };
      };
      return { sessionA_browser: await run(tokenA), sessionB_browser: await run(tokenB) };
    }, { queryUrl: actualParentQuery, key: publicKey, tokenA: account.token, tokenB: actualBrowserToken }).catch(() => null);
    const persistedLink = await admin.from('parent_student_links').select('status').eq('parent_id', account.id).eq('student_id', studentA.id).maybeSingle();
    const directLinkOnly = await account.client.from('parent_student_links').select('id,status').eq('parent_id', account.id).eq('student_id', studentA.id);
    const directStudent = await account.client.from('students').select('id,class_id,active').eq('id', studentA.id);
    const directClass = await account.client.from('classes').select('id').eq('id', classA);
    const matrix = actualParentQuery ? { sessionA_direct: await nodeProbe(account.token), sessionB_direct: await nodeProbe(actualBrowserToken), currentClientToken_direct: await nodeProbe(activeClientToken), directSupabaseClient: directClientResult, directLinkOnly: { rows: directLinkOnly.data?.length ?? null, errorCode: directLinkOnly.error?.code ?? null }, directStudent: { rows: directStudent.data?.length ?? null, errorCode: directStudent.error?.code ?? null }, directClass: { rows: directClass.data?.length ?? null, errorCode: directClass.error?.code ?? null }, adminLink: { exists: Boolean(persistedLink.data), status: persistedLink.data?.status ?? null, errorCode: persistedLink.error?.code ?? null }, ...browserProbes } : { parentLinkRequestObserved: false };
    const safeUrl = actualParentQuery ? new URL(actualParentQuery) : null;
    safeUrl?.searchParams.set('parent_id', 'eq.<synthetic-parent>');
    throw new Error(`entry panel never settled for role=${account.role}, linkedParent=${!parentHasNoLinkedChildren}, assignedTeacher=${!teacherHasNoAssignedClasses}; state=${await panel.getAttribute('data-connection-state')}, loaded=${await panel.getAttribute('data-loaded')}, checkpoints=${JSON.stringify(parentLinkCheckpoints)}, token-swap=${JSON.stringify(matrix)}, query=${safeUrl ? `${safeUrl.pathname}${safeUrl.search}` : '<no-parent-link-request>'}, text=${(await panel.innerText()).slice(0, 500)}, first-parent-response-snapshot=${JSON.stringify(fixtureSnapshots.filter((item) => String(item.checkpoint).startsWith('first-browser-parent-query-')).at(-1) ?? null)}, network=${diagnostics.join('; ')}`);
  }
  if (await panel.getByRole('alert').count()) throw new Error(`entry panel load error: ${await panel.getByRole('alert').first().innerText()}, network=${diagnostics.join('; ')}`);
  for (const text of expectedTexts) await panel.locator('.school-entry-event').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 12_000 });
  for (const text of forbiddenTexts) await expect.poll(() => panel.getByText(text, { exact: false }).count()).toBe(0);
  if (account.role === 'parent') {
    // Playwright's response event handler is async and is not awaited by the
    // browser. Wait until it has parsed the body and captured the matching
    // token/RLS snapshot before this account's context is closed.
    await expect.poll(() => firstParentResponseSnapshot !== null, {
      message: 'first Parent link response snapshot is captured',
    }).toBe(true);
    await firstParentResponseSnapshot;
  }
  await context.close();
}

async function checkpointParentLink(point: string) {
  const result = await parentA.client.from('parent_student_links')
    .select('students(*,classes(grade,division))')
    .eq('parent_id', parentA.id).eq('status', 'active');
  parentLinkCheckpoints.push({ point, rows: result.data?.length ?? null, errorCode: result.error?.code ?? null });
}

async function cleanup() {
  cleanupStarted = true;
  if (parentA && admin) {
    try {
      const finalSnapshot = await snapshotFixture('immediately-before-final-cleanup');
      expectCompleteParentFixture(finalSnapshot, 'pre-cleanup');
      expect(finalSnapshot.cleanupStarted).toBe(true);
    }
    catch (error) { console.error(`[fixture-state] cleanup snapshot failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }
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
    await snapshotFixture('after-all-auth-sessions-created');
    classA = await createClass(schoolA, 'A'); classB = await createClass(schoolA, 'B');
    studentA = await createStudent(schoolA, classA, 'A'); studentB = await createStudent(schoolA, classB, 'B');
    await must(admin.from('parent_student_links').insert({ parent_id: parentA.id, student_id: studentA.id, status: 'active' }));
    await snapshotFixture('immediately-after-synthetic-fixture-creation');
    const parentLinkCheck = await parentA.client.from('parent_student_links').select('id').eq('student_id', studentA.id);
    expectValue(!parentLinkCheck.error && parentLinkCheck.data?.length === 1, `synthetic Parent RLS link precondition failed (${parentLinkCheck.error?.code ?? 'no matching row'})`);
    const parentNestedLinkCheck = await parentA.client.from('parent_student_links').select('students(*,classes(grade,division))').eq('parent_id', parentA.id).eq('status', 'active');
    expectValue(!parentNestedLinkCheck.error && parentNestedLinkCheck.data?.length === 1, `synthetic Parent nested RLS query failed (${parentNestedLinkCheck.error?.code ?? 'no matching row'})`);
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
    await snapshotFixture('after-device-and-assignment-enrollment');
    const publicClient = createClient(dbUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const publicKeyRegistration = await publicClient.from('rfid_capability_signing_keys').select('key_id').limit(1);
    expect(Boolean(publicKeyRegistration.error) || publicKeyRegistration.data?.length === 0).toBe(true);
    readerId = randomUUID(); readerKey = randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64);
    const store = openGatewayDatabase(dbPath);
    store.registerReader({ readerId, deviceId, tokenHash: hashReaderKey(readerKey), now: new Date().toISOString() });
    store.close();
    writeFileSync(deviceKeyPath, devicePrivateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { flag: 'wx', mode: 0o600 });
    await snapshotFixture('after-gateway-queue-setup');
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
    await snapshotFixture('after-offline-restart-recovery');

    const synced = runGatewaySync();
    expect(synced.results[0]).toMatchObject({ event_id: eventA.event_id, state: 'delivered_to_local_server', outcome: 'accepted' });
    reopened = openGatewayDatabase(dbPath);
    const delivered = reopened.getEvent(deviceId, eventA.event_id);
    expect(delivered).toMatchObject({ queue_state: 'delivered', remote_outcome: 'accepted', remote_receipt_id: expect.any(String), remote_received_at: expect.any(String), canonical_payload: canonicalEventV2(eventA) });
    expect(delivered.clock_quality).toBe('ok');
    reopened.close();
    expect(await must(admin.from('school_entry_events').select('id,student_id,credential_assignment_id').eq('device_event_id', eventA.event_id).single()))
      .toMatchObject({ student_id: studentA.id, credential_assignment_id: assignmentA });
    await checkpointParentLink('after-first-cloud-sync');
    await snapshotFixture('after-first-local-api-sync');

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
    await checkpointParentLink('after-revocation-and-unresolved-sync');
    await snapshotFixture('after-revocation-unresolved-sync');

    const eventB = eventV2(3, assignmentB, capabilityB, refA);
    queueEvent(eventB);
    const syncB = runGatewaySync();
    expect(syncB.results[0]).toMatchObject({ event_id: eventB.event_id, state: 'delivered_to_local_server', outcome: 'accepted' });
    expect(await must(admin.from('school_entry_events').select('student_id,credential_assignment_id').eq('device_event_id', eventB.event_id).single()))
      .toMatchObject({ student_id: studentB.id, credential_assignment_id: assignmentB });
    await checkpointParentLink('after-reassigned-event-sync');
    await snapshotFixture('after-reassigned-event-sync');

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

    const persistedParentLink = await must(admin.from('parent_student_links').select('status,student_id').eq('parent_id', parentA.id).eq('student_id', studentA.id).single());
    expect(persistedParentLink.status).toBe('active');

    await loginAndCheck(parentA, ['Check-in recorded'], [studentB.name]);
    const linkedParentBrowserSnapshot = fixtureSnapshots.find((item) => item.checkpoint === 'first-browser-parent-query-result' && item.parentScenario === 'linked-parent');
    expectCompleteParentFixture(linkedParentBrowserSnapshot, 'linked Parent browser response');
    const linkedBrowserRls = linkedParentBrowserSnapshot?.rls as { actual_browser_token?: { links?: { rows?: number }; nestedLinks?: { rows?: number }; students?: { rows?: number }; classes?: { rows?: number } } } | undefined;
    expect(linkedBrowserRls?.actual_browser_token).toMatchObject({ links: { rows: 1 }, nestedLinks: { rows: 1 }, students: { rows: 1 }, classes: { rows: 1 } });
    await snapshotFixture('after-parent-dashboard-assertions', parentA.token);
    await loginAndCheck(teacherA, [studentA.name], [studentB.name]);
    await loginAndCheck(principalA, [studentA.name, studentB.name]);
    await loginAndCheck(principalB, [], [studentA.name, studentB.name]);
    await loginAndCheck(parentUnlinked, [], [studentA.name, studentB.name]);
    const unlinkedParentBrowserSnapshot = fixtureSnapshots.find((item) => item.checkpoint === 'first-browser-parent-query-zero' && item.parentScenario === 'other-parent');
    expect(unlinkedParentBrowserSnapshot, 'unlinked Parent zero-row browser response snapshot exists').toBeDefined();
    const unlinkedPhysical = unlinkedParentBrowserSnapshot?.physical as { parent_link?: unknown; matching_counts?: Record<string, number> } | undefined;
    expect(unlinkedPhysical?.parent_link).toBeNull();
    expect(unlinkedPhysical?.matching_counts).toMatchObject({ profiles: 1, schools: 1, students: 1, classes: 1, parent_student_links: 0 });
    const unlinkedBrowserRls = unlinkedParentBrowserSnapshot?.rls as { actual_browser_token?: { profile?: { rows?: number }; links?: { rows?: number }; nestedLinks?: { rows?: number }; students?: { rows?: number }; classes?: { rows?: number } } } | undefined;
    expect(unlinkedBrowserRls?.actual_browser_token).toMatchObject({ profile: { rows: 1 }, links: { rows: 0 }, nestedLinks: { rows: 0 }, students: { rows: 0 }, classes: { rows: 0 } });
    await loginAndCheck(teacherUnassigned, [], [studentA.name, studentB.name]);
    await snapshotFixture('after-all-dashboard-assertions', parentA.token);
    expect(observedExternal.size).toBe(0);
    const attendance = await must(admin.from('attendance_records').select('id').in('student_id', [studentA.id, studentB.id]));
    expect(attendance).toHaveLength(0);
  }, 180_000);
});

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query; if (error) throw new Error(error.message); return count ?? 0;
}
