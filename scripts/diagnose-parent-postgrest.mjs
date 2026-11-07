import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { openOptionalTool } from './lib/open-optional-tool.mjs';

assertLocalTestEnvironment(process.env);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.SCHOVERA_TEST_URL ?? 'http://127.0.0.1:3000';
const parsedApp = new URL(appUrl);
if (parsedApp.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedApp.hostname)) {
  throw new Error('Refusing Parent PostgREST diagnostic: app URL must be loopback HTTP.');
}

const suffix = randomUUID().slice(0, 8);
const password = `ParentDiag-${randomUUID()}!aA1`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const directA = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = { school: '', class: '', student: '', user: '' };
let browser;

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function claims(token, expectedUserId) {
  try {
    const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return {
      expectedSub: value.sub === expectedUserId,
      role: value.role,
      aud: value.aud,
      issuerIsLocal: value.iss === `${supabaseUrl}/auth/v1`,
      exp: value.exp,
      iat: value.iat,
      sessionIdPresent: Boolean(value.session_id),
      aal: value.aal,
      appRole: value.app_metadata?.role ?? null,
    };
  } catch {
    return { validJwtPayload: false };
  }
}

async function queryOverNode(token, queryUrl) {
  const response = await fetch(queryUrl, { headers: { apikey: publishableKey, authorization: `Bearer ${token}` } });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, rows: Array.isArray(body) ? body.length : null, errorCode: body?.code ?? null, errorMessage: body?.message ?? null };
}

async function queryInBrowser(page, token, queryUrl) {
  return page.evaluate(async ({ token: bearer, queryUrl: url, key }) => {
    const response = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${bearer}` } });
    let body;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, rows: Array.isArray(body) ? body.length : null, errorCode: body?.code ?? null, errorMessage: body?.message ?? null };
  }, { token, queryUrl, key: publishableKey });
}

async function removeAbandonedDiagnosticFixture() {
  const profiles = must(await admin.from('profiles').select('id,email,school_id').like('email', 'parent-%@diag-local.test'), 'find prior synthetic diagnostic profiles');
  for (const profile of profiles) {
    if (!profile.email?.endsWith('@diag-local.test')) continue;
    const schoolResult = await admin.from('schools').select('name').eq('id', profile.school_id).maybeSingle();
    if (schoolResult.error || !schoolResult.data?.name?.startsWith('Synthetic Parent Diagnostic ')) continue;
    const students = must(await admin.from('students').select('id,class_id').eq('school_id', profile.school_id), 'find prior synthetic diagnostic students');
    const studentIds = students.map((row) => row.id);
    if (studentIds.length) must(await admin.from('parent_student_links').delete().in('student_id', studentIds), 'remove prior synthetic Parent links');
    if (studentIds.length) must(await admin.from('students').delete().in('id', studentIds), 'remove prior synthetic students');
    const classIds = students.map((row) => row.class_id);
    if (classIds.length) must(await admin.from('classes').delete().in('id', [...new Set(classIds)]), 'remove prior synthetic classes');
    must(await admin.from('profiles').delete().eq('id', profile.id), 'remove prior synthetic Parent profile');
    must(await admin.auth.admin.deleteUser(profile.id), 'remove prior synthetic Parent Auth user');
    must(await admin.from('schools').delete().eq('id', profile.school_id), 'remove prior synthetic school');
  }
}

try {
  await removeAbandonedDiagnosticFixture();
  const school = must(await admin.from('schools').insert({ name: `Synthetic Parent Diagnostic ${suffix}`, code: `PD-${suffix}-${randomUUID().slice(0, 4)}` }).select('id').single(), 'create local school');
  ids.school = school.id;
  const auth = must(await admin.auth.admin.createUser({ email: `parent-${suffix}@diag-local.test`, password, email_confirm: true }), 'create local Parent Auth user');
  ids.user = auth.user.id;
  must(await admin.from('profiles').insert({ id: ids.user, school_id: ids.school, email: auth.user.email, full_name: `Synthetic Parent ${suffix}`, role: 'parent', active: true }), 'create local Parent profile');
  const klass = must(await admin.from('classes').insert({ school_id: ids.school, grade: '9', division: `PD-${suffix}`, academic_year: 'PARENT-DIAG' }).select('id').single(), 'create local class');
  ids.class = klass.id;
  const student = must(await admin.from('students').insert({ school_id: ids.school, class_id: ids.class, roll_number: `PD-${suffix}`, full_name: `Synthetic Student ${suffix}`, active: true }).select('id').single(), 'create local student');
  ids.student = student.id;
  must(await admin.from('parent_student_links').insert({ parent_id: ids.user, student_id: ids.student, status: 'active' }), 'create local Parent link');

  const signIn = async (client) => {
    const result = await client.auth.signInWithPassword({ email: auth.user.email, password });
    if (result.error || !result.data.session) throw new Error('synthetic Parent sign-in failed');
    return result.data.session.access_token;
  };
  const tokenA = await signIn(directA);
  const authUser = must(await admin.from('profiles').select('role,active,school_id').eq('id', ids.user).single(), 'verify Parent profile');
  const committedLink = must(await admin.from('parent_student_links').select('status,student_id').eq('parent_id', ids.user).eq('student_id', ids.student).single(), 'verify committed Parent link');
  if (!authUser.active || authUser.role !== 'parent' || committedLink.status !== 'active') throw new Error('synthetic fixture did not reach the expected committed state');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || ['about:', 'data:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  let tokenB = '';
  const browserChildRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === supabaseUrl && url.pathname === '/rest/v1/parent_student_links') {
      const authHeader = request.headers().authorization ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (token) tokenB ||= token;
      browserChildRequests.push({ method: request.method(), path: url.pathname, select: url.searchParams.get('select'), parentFilterMatches: url.searchParams.get('parent_id') === `eq.${ids.user}`, activeFilter: url.searchParams.get('status') === 'eq.active', hasBearer: Boolean(token), apiKeyMatches: request.headers().apikey === publishableKey });
    }
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== supabaseUrl || url.pathname !== '/rest/v1/parent_student_links') return;
    try {
      const body = await response.json();
      browserChildRequests.push({ responseStatus: response.status(), responseRows: Array.isArray(body) ? body.length : null, errorCode: body?.code ?? null, errorMessage: body?.message ?? null });
    } catch {
      browserChildRequests.push({ responseStatus: response.status(), responseBody: 'unreadable' });
    }
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.locator('input[autocomplete="username"]').fill(auth.user.email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.origin === supabaseUrl && url.pathname === '/rest/v1/parent_student_links';
  }, { timeout: 20_000 });
  if (!tokenB) throw new Error('browser Parent child query did not send an authenticated Bearer token');
  await openOptionalTool(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="school-entry-panel"]')?.getAttribute('data-loaded') === 'true', undefined, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');

  const exactQuery = new URL('/rest/v1/parent_student_links', supabaseUrl);
  exactQuery.searchParams.set('select', 'students(*,classes(grade,division))');
  exactQuery.searchParams.set('parent_id', `eq.${ids.user}`);
  exactQuery.searchParams.set('status', 'eq.active');
  const queryUrl = exactQuery.href;
  const matrix = {
    sessionA_direct: await queryOverNode(tokenA, queryUrl),
    sessionB_direct: await queryOverNode(tokenB, queryUrl),
    sessionA_browser: await queryInBrowser(page, tokenA, queryUrl),
    sessionB_browser: await queryInBrowser(page, tokenB, queryUrl),
  };
  const identical = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const redactedQuery = new URLSearchParams(exactQuery.searchParams);
  redactedQuery.set('parent_id', 'eq.<synthetic-parent>');
  const requestInfo = { urlOriginIsLocal: new URL(queryUrl).origin === supabaseUrl, query: `${exactQuery.pathname}?${redactedQuery.toString()}`, publishableKeyMatchesForAll: true };
  const sessions = {
    sameToken: tokenA === tokenB,
    sameSubject: claims(tokenA, ids.user).expectedSub && claims(tokenB, ids.user).expectedSub,
    tokenA: claims(tokenA, ids.user),
    tokenB: claims(tokenB, ids.user),
  };
  const panelState = await page.evaluate(() => ({ loaded: document.querySelector('[data-testid="school-entry-panel"]')?.getAttribute('data-loaded') === 'true', childPrompt: document.body.innerText.includes('Choose a linked child to view their records.') }));
  console.log(JSON.stringify({ fixture: { synthetic: true, parentActive: authUser.active, role: authUser.role, linkActive: committedLink.status === 'active', studentActive: true, classSameSchool: true }, requestInfo, browserChildRequests, panelState, sessions, matrix, sameResultByToken: identical(matrix.sessionA_direct, matrix.sessionB_direct) && identical(matrix.sessionA_browser, matrix.sessionB_browser), sameResultByEnvironment: identical(matrix.sessionA_direct, matrix.sessionA_browser) && identical(matrix.sessionB_direct, matrix.sessionB_browser) }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => undefined);
  const cleanupErrors = [];
  const clean = async (label, operation) => {
    try {
      const result = await operation();
      if (result?.error) cleanupErrors.push(`${label}: ${result.error.message}`);
    } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
  };
  if (ids.student) await clean('Parent link', () => admin.from('parent_student_links').delete().eq('student_id', ids.student));
  if (ids.student) await clean('student', () => admin.from('students').delete().eq('id', ids.student));
  if (ids.class) await clean('class', () => admin.from('classes').delete().eq('id', ids.class));
  if (ids.user) await clean('profile', () => admin.from('profiles').delete().eq('id', ids.user));
  if (ids.user) await clean('Auth user', () => admin.auth.admin.deleteUser(ids.user));
  if (ids.school) await clean('school', () => admin.from('schools').delete().eq('id', ids.school));
  if (ids.school) {
    const remaining = await admin.from('schools').select('id').eq('id', ids.school);
    if (remaining.error || remaining.data?.length) cleanupErrors.push('synthetic school cleanup verification failed');
  }
  if (cleanupErrors.length) throw new Error(`Synthetic diagnostic cleanup failed: ${cleanupErrors.join('; ')}`);
}
